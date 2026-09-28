import {
  isUnlabelled,
  LABEL_RULES_COLLECTION,
  LabelSource,
  labelSourceOf,
  LINE_ENTRIES_COLLECTION,
  LineEntryStatus,
  matchRule,
  PlaidTransactionStatus,
  planAutoLabels,
  ruleCorrection,
  tagSourceOf,
  type AutoLabelPlan,
  type LineEntryView,
  type MonthYear,
  type RuleMatcher,
} from "@myos/shared";
import { db, FieldValue } from "../config/firebase.js";
import type { WriteChange } from "../core/resourceBuilder/resourceBuilder.types.js";
import { FIRESTORE_IN_MAX } from "../validators/common.js";

export type AutoLabelResult = AutoLabelPlan & { months: MonthYear[] };

type Write = (batch: FirebaseFirestore.WriteBatch) => void;

const FIRESTORE_BATCH_LIMIT = 500;
const PEER_FIELDS = ["merchantEntityId", "merchantName", "marketplace", "descriptionKey", "categoryDetailed"] as const;

const lineEntries = db.collection(LINE_ENTRIES_COLLECTION);
const labelRules = db.collection(LABEL_RULES_COLLECTION);

const toView = (doc: FirebaseFirestore.DocumentSnapshot) => ({ ...(doc.data() as LineEntryView), id: doc.id });

async function loadRules(): Promise<RuleMatcher[]> {
  const snapshot = await labelRules.get();
  return snapshot.docs.map((doc) => ({ ...(doc.data() as RuleMatcher), id: doc.id }));
}

/** Every entry sharing a merchant, marketplace, description or category with one of `entries`. */
async function loadPeers(entries: LineEntryView[]): Promise<LineEntryView[]> {
  const peers = new Map<string, LineEntryView>();
  for (const field of PEER_FIELDS) {
    const values = [...new Set(entries.map((entry) => entry[field]).filter((value): value is string => Boolean(value)))];
    for (let i = 0; i < values.length; i += FIRESTORE_IN_MAX) {
      const snapshot = await lineEntries.where(field, "in", values.slice(i, i + FIRESTORE_IN_MAX)).get();
      for (const doc of snapshot.docs) peers.set(doc.id, toView(doc));
    }
  }
  return [...peers.values()];
}

async function commitInBatches(writes: Write[]): Promise<void> {
  for (let i = 0; i < writes.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + FIRESTORE_BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

async function applyPlan(plan: AutoLabelPlan, existingRuleIds: Set<string>): Promise<void> {
  const now = new Date();
  // Learned rules land first so their match counters below have a document to increment
  await commitInBatches(
    plan.learned.map(({ id, ...rule }) => (batch) =>
      existingRuleIds.has(id)
        ? batch.update(labelRules.doc(id), {
            ...(rule.label ? { label: rule.label } : {}),
            ...(rule.tags ? { tags: rule.tags } : {}),
            learnedFrom: rule.learnedFrom,
            updatedAt: now,
          })
        : batch.set(labelRules.doc(id), { ...rule, matchCount: 0, createdAt: now, updatedAt: now }, { merge: true }),
    ),
  );

  const hits = new Map<string, number>();
  const hit = (ruleId: string) => hits.set(ruleId, (hits.get(ruleId) ?? 0) + 1);
  for (const { ruleId } of plan.assignments) hit(ruleId);
  for (const { ruleIds } of plan.tagAssignments) ruleIds.forEach(hit);

  await commitInBatches([
    ...plan.assignments.map(({ id, ruleId, label }): Write => (batch) =>
      batch.update(lineEntries.doc(id), {
        ...(label ? { label, osStatus: LineEntryStatus.LABELLED } : { osStatus: LineEntryStatus.EXCLUDED }),
        labelSource: LabelSource.RULE,
        ruleId,
        updatedAt: now,
      }),
    ),
    ...plan.tagAssignments.map(({ id, tags }): Write => (batch) =>
      batch.update(lineEntries.doc(id), {
        ...(tags.length
          ? { tags, tagSource: LabelSource.RULE }
          : { tags: FieldValue.delete(), tagSource: FieldValue.delete() }),
        updatedAt: now,
      }),
    ),
    ...[...hits].map(([ruleId, count]): Write => (batch) =>
      batch.update(labelRules.doc(ruleId), { matchCount: FieldValue.increment(count), lastMatchedAt: now }),
    ),
  ]);
}

function needsLearning(entry: LineEntryView, rules: RuleMatcher[]): boolean {
  if (entry.plaidStatus === PlaidTransactionStatus.REMOVED) return false;
  return (isUnlabelled(entry) && !matchRule(entry, rules)) || tagSourceOf(entry) !== LabelSource.MANUAL;
}

async function run(candidates: LineEntryView[], history: LineEntryView[] | undefined, dryRun: boolean): Promise<AutoLabelResult> {
  const live = candidates.filter((entry) => entry.plaidStatus !== PlaidTransactionStatus.REMOVED);
  if (live.length === 0) return { assignments: [], tagAssignments: [], learned: [], months: [] };

  const rules = await loadRules();
  const learners = live.filter((entry) => needsLearning(entry, rules));
  const peers = history ?? (learners.length > 0 ? await loadPeers(learners) : []);
  const plan = planAutoLabels(live, rules, [...new Map([...peers, ...live].map((entry) => [entry.id, entry])).values()]);

  if (!dryRun) await applyPlan(plan, new Set(rules.map((rule) => rule.id)));
  return { ...plan, months: [...new Set(plan.assignments.map((row) => row.monthYear))].sort() };
}

export async function autoLabel(candidates: LineEntryView[], { dryRun = false } = {}): Promise<AutoLabelResult> {
  return run(candidates, undefined, dryRun);
}

/** Every entry is both a candidate and history, so rule tags are recomputed everywhere. */
export async function autoLabelAll({ dryRun = false }: { dryRun?: boolean } = {}): Promise<AutoLabelResult> {
  const everything = (await lineEntries.get()).docs.map(toView);
  return run(everything, everything, dryRun);
}

/** Moves every entry a rule labelled to its new label. Hand-labelled entries keep theirs. */
export async function relabelRuleEntries(ruleId: string, label: string): Promise<MonthYear[]> {
  const snapshot = await lineEntries.where("ruleId", "==", ruleId).get();
  const docs = snapshot.docs.filter((doc) => doc.get("labelSource") === LabelSource.RULE && doc.get("label") !== label);
  const now = new Date();
  await commitInBatches(docs.map((doc) => (batch) => batch.update(doc.ref, { label, osStatus: LineEntryStatus.LABELLED, updatedAt: now })));
  return [...new Set(docs.map((doc) => doc.get("monthYear") as MonthYear))];
}

async function correctRule(ruleId: string, correctedLabel: string | undefined): Promise<MonthYear[]> {
  const doc = await labelRules.doc(ruleId).get();
  if (!doc.exists) return [];
  const correction = ruleCorrection({ ...(doc.data() as RuleMatcher), id: doc.id }, correctedLabel);
  if (!correction) return [];
  await doc.ref.update({ ...correction, updatedAt: new Date() });
  return correction.label ? relabelRuleEntries(ruleId, correction.label) : [];
}

const sameList = (a: string[] | undefined, b: string[] | undefined) => (a ?? []).join() === (b ?? []).join();

/** A hand label or hand tags are the first sighting later entries learn from; a relabel also corrects the rule it replaced. */
export async function learnFromManualEdit({ before, after }: WriteChange): Promise<MonthYear[]> {
  const previous = before as LineEntryView | null;
  const current = after as LineEntryView | null;
  if (!current) return [];

  const relabelled =
    labelSourceOf(current) === LabelSource.MANUAL &&
    (!previous ||
      previous.label !== current.label ||
      previous.goalId !== current.goalId ||
      previous.osStatus !== current.osStatus ||
      previous.labelSource !== current.labelSource);
  const retagged = tagSourceOf(current) === LabelSource.MANUAL && (!previous || !sameList(previous.tags, current.tags));
  if (!relabelled && !retagged) return [];

  const corrected =
    relabelled && previous?.labelSource === LabelSource.RULE && previous.ruleId
      ? await correctRule(previous.ruleId, current.label)
      : [];

  const related = await loadPeers([current]);
  const { months } = await autoLabel(related);
  return [...corrected, ...months];
}
