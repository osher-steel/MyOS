import type { MonthYear } from "../types/interfaces/common.js";
import {
  IncomeSource,
  LabelRuleField,
  LabelRuleMatch,
  LabelRuleSource,
  LabelSource,
  PlaidTransactionStatus,
  type LabelRule,
  type LineEntryView,
  type Tag,
} from "../types/interfaces/finance.js";
import { containsAllTokens, containsPhrase, normalizeDescription, normalizeText } from "./descriptions.js";
import { isManuallyLabelled, isManuallyTagged, isUnlabelled, tagSourceOf } from "./lineEntries.js";

export type RuleMatcher = Pick<
  LabelRule,
  "id" | "name" | "field" | "match" | "value" | "label" | "exclude" | "tags" | "source" | "enabled"
>;

export type LearnedRuleDraft = RuleMatcher & { learnedFrom: string[] };

export interface LabelAssignment {
  id: string;
  monthYear: MonthYear;
  ruleId: string;
  label?: string;
  exclude?: true;
}

export interface TagAssignment {
  id: string;
  monthYear: MonthYear;
  tags: Tag[];
  ruleIds: string[];
}

export interface AutoLabelPlan {
  assignments: LabelAssignment[];
  tagAssignments: TagAssignment[];
  learned: LearnedRuleDraft[];
}

export const EXACT_ONLY_FIELDS: ReadonlySet<LabelRuleField> = new Set([
  LabelRuleField.MERCHANT_ENTITY_ID,
  LabelRuleField.CATEGORY,
]);

const FIELD_ORDER = [
  LabelRuleField.MERCHANT_ENTITY_ID,
  LabelRuleField.MERCHANT_NAME,
  LabelRuleField.COUNTERPARTY,
  LabelRuleField.DESCRIPTION,
  LabelRuleField.CATEGORY,
];
const MATCH_ORDER = [LabelRuleMatch.EXACT, LabelRuleMatch.TOKENS, LabelRuleMatch.CONTAINS];

const CONFIDENT = new Set(["HIGH", "VERY_HIGH"]);
// Transfers and income describe who the money moved to, not what it bought
const UNLEARNABLE_PRIMARIES = new Set(["TRANSFER_IN", "TRANSFER_OUT", "INCOME", "LOAN_PAYMENTS"]);
const TRANSFER_PRIMARIES = new Set(["TRANSFER_IN", "TRANSFER_OUT"]);
const INCOME_LABELS: ReadonlySet<string> = new Set(Object.values(IncomeSource));
const MIN_DESCRIPTION_TOKENS = 2;
const MIN_CATEGORY_MERCHANTS = 2;

export function isIncomeLabel(label: string | undefined): boolean {
  return label !== undefined && INCOME_LABELS.has(label);
}

export function normalizeRuleValue(field: LabelRuleField, value: string): string {
  switch (field) {
    case LabelRuleField.MERCHANT_ENTITY_ID:
      return value.trim();
    case LabelRuleField.CATEGORY:
      return value.trim().toUpperCase();
    default:
      return normalizeText(value);
  }
}

export function labelRuleId(field: LabelRuleField, match: LabelRuleMatch, value: string): string {
  return `${field}_${match}_${normalizeRuleValue(field, value).replace(/\s+/g, "-")}`;
}

function descriptionKeyOf(entry: LineEntryView): string {
  return entry.descriptionKey ?? normalizeDescription(entry.originalDescription ?? entry.name);
}

function fieldTexts(entry: LineEntryView, field: LabelRuleField): string[] {
  switch (field) {
    case LabelRuleField.MERCHANT_ENTITY_ID:
      return entry.merchantEntityId ? [entry.merchantEntityId] : [];
    case LabelRuleField.MERCHANT_NAME:
      return entry.merchantName ? [normalizeText(entry.merchantName)] : [];
    case LabelRuleField.COUNTERPARTY:
      return (entry.counterparties ?? []).map((counterparty) => normalizeText(counterparty.name));
    case LabelRuleField.DESCRIPTION: {
      const texts = [descriptionKeyOf(entry), normalizeText(entry.name)];
      if (entry.originalDescription) texts.push(normalizeText(entry.originalDescription));
      return [...new Set(texts.filter(Boolean))];
    }
    case LabelRuleField.CATEGORY:
      return [entry.categoryDetailed, entry.categoryPrimary].filter((value): value is string => Boolean(value));
  }
}

function textMatches(text: string, rule: RuleMatcher): boolean {
  switch (rule.match) {
    case LabelRuleMatch.EXACT:
      return text === rule.value;
    case LabelRuleMatch.CONTAINS:
      return containsPhrase(text, rule.value);
    case LabelRuleMatch.TOKENS:
      return containsAllTokens(text, rule.value);
  }
}

function ruleMatches(entry: LineEntryView, rule: RuleMatcher): boolean {
  return rule.enabled && fieldTexts(entry, rule.field).some((text) => textMatches(text, rule));
}

const files = (rule: RuleMatcher) => Boolean(rule.label || rule.exclude);

// Income labels only ever describe money coming in
const fits = (rule: RuleMatcher, entry: LineEntryView) => !isIncomeLabel(rule.label) || entry.amount < 0;

/** Most specific first: what a rule matches on, then rules a person wrote, then the tighter match. */
export function compareRules(a: RuleMatcher, b: RuleMatcher): number {
  return (
    FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field) ||
    Number(a.source !== LabelRuleSource.MANUAL) - Number(b.source !== LabelRuleSource.MANUAL) ||
    MATCH_ORDER.indexOf(a.match) - MATCH_ORDER.indexOf(b.match) ||
    b.value.length - a.value.length ||
    a.id.localeCompare(b.id)
  );
}

function firstFiling<T extends RuleMatcher>(entry: LineEntryView, sorted: T[]): T | undefined {
  return sorted.find((rule) => files(rule) && fits(rule, entry) && ruleMatches(entry, rule));
}

/** The one rule that files an entry, with a label or as excluded. */
export function matchRule<T extends RuleMatcher>(entry: LineEntryView, rules: T[]): T | undefined {
  return firstFiling(entry, [...rules].sort(compareRules));
}

/** Tags add up: every matching rule contributes its tags. */
export function matchTagRules<T extends RuleMatcher>(entry: LineEntryView, rules: T[]): T[] {
  return rules.filter((rule) => rule.tags?.length && ruleMatches(entry, rule));
}

const sortedTags = (tags: Iterable<Tag>): Tag[] => [...new Set(tags)].sort();

const sameTags = (a: Tag[] | undefined, b: Tag[]) => sortedTags(a ?? []).join() === b.join();

// Zelle, Apple Cash and bank transfers name who got the money, not what it bought
export function isTransfer(entry: LineEntryView): boolean {
  return (
    TRANSFER_PRIMARIES.has(entry.categoryPrimary ?? "") ||
    (entry.counterparties ?? []).some((counterparty) => counterparty.type === "payment_app")
  );
}

function learnableCategory(entry: LineEntryView): string | undefined {
  const category = entry.categoryDetailed;
  if (!category || !CONFIDENT.has(entry.categoryConfidence ?? "")) return undefined;
  // Plaid files anything it can't place under an *_OTHER_* catch-all
  if (UNLEARNABLE_PRIMARIES.has(entry.categoryPrimary ?? "") || category.includes("OTHER")) return undefined;
  return category;
}

function merchantOf(entry: LineEntryView): string {
  return entry.merchantEntityId ?? (entry.merchantName ? normalizeText(entry.merchantName) : descriptionKeyOf(entry));
}

function learnableDescription(entry: LineEntryView): string | undefined {
  const key = descriptionKeyOf(entry);
  return key.split(" ").length >= MIN_DESCRIPTION_TOKENS ? key : undefined;
}

function categoryName(category: string): string {
  const words = category.toLowerCase().replace(/_/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} (Plaid category)`;
}

type LearnKey = {
  field: LabelRuleField;
  candidateKey: (entry: LineEntryView) => string | undefined;
  peerKey: (entry: LineEntryView) => string | undefined;
  enoughPeers: (peers: LineEntryView[]) => boolean;
  name: (entry: LineEntryView, value: string) => string;
};

const anyPeer = (peers: LineEntryView[]) => peers.length > 0;
const merchantNameKey = (entry: LineEntryView) => (entry.merchantName ? normalizeText(entry.merchantName) : undefined);
const marketplaceKey = (entry: LineEntryView) => (entry.marketplace ? normalizeText(entry.marketplace) : undefined);

const MERCHANT_ENTITY_KEY: LearnKey = {
  field: LabelRuleField.MERCHANT_ENTITY_ID,
  candidateKey: (entry) => entry.merchantEntityId,
  peerKey: (entry) => entry.merchantEntityId,
  enoughPeers: anyPeer,
  name: (entry, value) => entry.merchantName ?? value,
};
const MERCHANT_NAME_KEY: LearnKey = {
  field: LabelRuleField.MERCHANT_NAME,
  candidateKey: merchantNameKey,
  peerKey: merchantNameKey,
  enoughPeers: anyPeer,
  name: (entry, value) => entry.merchantName ?? value,
};
const MARKETPLACE_KEY: LearnKey = {
  field: LabelRuleField.COUNTERPARTY,
  candidateKey: marketplaceKey,
  peerKey: marketplaceKey,
  enoughPeers: anyPeer,
  name: (entry, value) => entry.marketplace ?? value,
};
const DESCRIPTION_KEY: LearnKey = {
  field: LabelRuleField.DESCRIPTION,
  candidateKey: learnableDescription,
  peerKey: descriptionKeyOf,
  enoughPeers: anyPeer,
  name: (_entry, value) => value,
};
const CATEGORY_KEY: LearnKey = {
  field: LabelRuleField.CATEGORY,
  candidateKey: learnableCategory,
  peerKey: (entry) => entry.categoryDetailed,
  enoughPeers: (peers) => {
    const confident = peers.filter((peer) => learnableCategory(peer) !== undefined);
    return new Set(confident.map(merchantOf)).size >= MIN_CATEGORY_MERCHANTS;
  },
  name: (_entry, value) => categoryName(value),
};

const LABEL_LEARN_KEYS = [MERCHANT_ENTITY_KEY, MERCHANT_NAME_KEY, DESCRIPTION_KEY, CATEGORY_KEY];
const TAG_LEARN_KEYS = [MERCHANT_ENTITY_KEY, MERCHANT_NAME_KEY, MARKETPLACE_KEY, DESCRIPTION_KEY];

function draftFor(key: LearnKey, entry: LineEntryView, value: string, peers: LineEntryView[]): LearnedRuleDraft {
  return {
    id: labelRuleId(key.field, LabelRuleMatch.EXACT, value),
    name: key.name(entry, value),
    field: key.field,
    match: LabelRuleMatch.EXACT,
    value,
    source: LabelRuleSource.LEARNED,
    enabled: true,
    learnedFrom: peers.map((peer) => peer.id),
  };
}

/**
 * A rule from the second sighting: the candidate shares a merchant or a
 * description with an entry labelled by hand, or a confident category with
 * entries from two merchants labelled by hand, and every one of those entries
 * agrees on the label. Disagreement stops learning, and transfers never learn.
 */
export function learnRule(entry: LineEntryView, history: LineEntryView[]): LearnedRuleDraft | undefined {
  if (isTransfer(entry)) return undefined;
  const labelled = history.filter((peer) => peer.id !== entry.id && isManuallyLabelled(peer));
  for (const key of LABEL_LEARN_KEYS) {
    const value = key.candidateKey(entry);
    if (!value) continue;
    const peers = labelled.filter((peer) => key.peerKey(peer) === value);
    if (!key.enoughPeers(peers)) continue;

    const labels = new Set(peers.map((peer) => peer.label!));
    if (labels.size > 1) return undefined;
    const label = [...labels][0]!;
    if (isIncomeLabel(label) && entry.amount >= 0) return undefined;
    return { ...draftFor(key, entry, value, peers), label };
  }
  return undefined;
}

/** The most specific shared merchant, marketplace or description, carrying the tags every hand-tagged peer has. */
export function learnTagRule(entry: LineEntryView, history: LineEntryView[]): LearnedRuleDraft | undefined {
  if (isTransfer(entry)) return undefined;
  const tagged = history.filter((peer) => peer.id !== entry.id && isManuallyTagged(peer));
  for (const key of TAG_LEARN_KEYS) {
    const value = key.candidateKey(entry);
    if (!value) continue;
    const peers = tagged.filter((peer) => key.peerKey(peer) === value);
    if (peers.length === 0) continue;

    const common = peers.map((peer) => new Set(peer.tags)).reduce((shared, tags) => new Set([...shared].filter((tag) => tags.has(tag))));
    if (common.size > 0) return { ...draftFor(key, entry, value, peers), tags: sortedTags(common) };
  }
  return undefined;
}

/** A learned draft either becomes a new rule or adds its label or tags to a learned rule with the same id. */
function mergeLearned(draft: LearnedRuleDraft, existing: RuleMatcher | undefined): LearnedRuleDraft | undefined {
  if (!existing) return draft;
  if (existing.source !== LabelRuleSource.LEARNED || !existing.enabled) return undefined;

  const label = existing.label ?? (existing.exclude ? undefined : draft.label);
  const tags = sortedTags([...(existing.tags ?? []), ...(draft.tags ?? [])]);
  if (label === existing.label && sameTags(existing.tags, tags)) return undefined;
  const learnedFrom = [...new Set([...((existing as Partial<LearnedRuleDraft>).learnedFrom ?? []), ...draft.learnedFrom])];
  return { ...existing, ...(label ? { label } : {}), ...(tags.length ? { tags } : {}), learnedFrom };
}

/**
 * Files what is still unlabelled and recomputes rule tags on everything not
 * tagged by hand, learning rules along the way. `rules` includes disabled
 * ones, so a rule someone turned off is never re-learned.
 */
export function planAutoLabels(candidates: LineEntryView[], rules: RuleMatcher[], history: LineEntryView[]): AutoLabelPlan {
  const byId = new Map<string, RuleMatcher>(rules.map((rule) => [rule.id, rule]));
  const learned = new Map<string, LearnedRuleDraft>();
  let sorted = rules.filter((rule) => rule.enabled).sort(compareRules);
  const adopt = (draft: LearnedRuleDraft): RuleMatcher | undefined => {
    const merged = mergeLearned(draft, byId.get(draft.id));
    if (!merged) return undefined;
    byId.set(merged.id, merged);
    learned.set(merged.id, merged);
    sorted = [...byId.values()].filter((rule) => rule.enabled).sort(compareRules);
    return merged;
  };

  const plan: AutoLabelPlan = { assignments: [], tagAssignments: [], learned: [] };
  const oldestFirst = [...candidates].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const entry of oldestFirst) {
    if (isUnlabelled(entry)) {
      let rule = firstFiling(entry, sorted);
      if (!rule) {
        const draft = learnRule(entry, history);
        if (draft && adopt(draft)) rule = firstFiling(entry, sorted);
      }
      if (rule) {
        plan.assignments.push({
          id: entry.id,
          monthYear: entry.monthYear,
          ruleId: rule.id,
          ...(rule.exclude ? { exclude: true as const } : { label: rule.label! }),
        });
      }
    }

    if (tagSourceOf(entry) !== LabelSource.MANUAL && entry.plaidStatus !== PlaidTransactionStatus.REMOVED) {
      const tagDraft = learnTagRule(entry, history);
      if (tagDraft) adopt(tagDraft);
      const tagRules = matchTagRules(entry, sorted);
      const tags = sortedTags(tagRules.flatMap((rule) => rule.tags ?? []));
      if (!sameTags(entry.tags, tags)) {
        plan.tagAssignments.push({ id: entry.id, monthYear: entry.monthYear, tags, ruleIds: tagRules.map((rule) => rule.id) });
      }
    }
  }
  plan.learned = [...learned.values()];
  return plan;
}

/** A hand correction retrains a learned merchant or description rule, and switches off a category rule as too broad. */
export function ruleCorrection(
  rule: RuleMatcher,
  correctedLabel: string | undefined,
): Partial<Pick<LabelRule, "label" | "enabled">> | undefined {
  if (rule.source !== LabelRuleSource.LEARNED || !rule.label || !correctedLabel || correctedLabel === rule.label) {
    return undefined;
  }
  return rule.field === LabelRuleField.CATEGORY ? { enabled: false } : { label: correctedLabel };
}
