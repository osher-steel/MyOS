import "../src/load-env.js";
import {
  DEFAULT_TAGS,
  LABEL_RULES_COLLECTION,
  LabelSource,
  LINE_ENTRIES_COLLECTION,
  LineEntryStatus,
  PLAID_ITEMS_COLLECTION,
  TAGS_COLLECTION,
} from "@myos/shared";
import { db, FieldValue } from "../src/config/firebase.js";
import { autoLabelAll } from "../src/services/autoLabel.js";
import { refreshLedger } from "../src/services/ledgerRefresh.js";
import { regeneratePastReports } from "../src/services/monthReports.js";

const FIRESTORE_BATCH_LIMIT = 500;

// Every label that predates label sources was set by hand
const labelled = await db.collection(LINE_ENTRIES_COLLECTION).where("osStatus", "!=", LineEntryStatus.NOT_LABELLED).get();
const legacy = labelled.docs.filter((doc) => !doc.get("labelSource") && (doc.get("label") || doc.get("goalId")));
for (let i = 0; i < legacy.length; i += FIRESTORE_BATCH_LIMIT) {
  const batch = db.batch();
  for (const doc of legacy.slice(i, i + FIRESTORE_BATCH_LIMIT)) batch.update(doc.ref, { labelSource: LabelSource.MANUAL });
  await batch.commit();
}
console.log(`marked ${legacy.length} existing labels as manual`);

const tags = db.collection(TAGS_COLLECTION);
const missingTags = (await db.getAll(...DEFAULT_TAGS.map((tag) => tags.doc(tag)))).filter((doc) => !doc.exists);
await Promise.all(missingTags.map((doc) => doc.ref.set({ createdAt: new Date() })));
console.log(`seeded ${missingTags.length} default tags`);

// Without a cursor Plaid replays full history, which backfills merchant and category fields
const items = await db.collection(PLAID_ITEMS_COLLECTION).get();
await Promise.all(items.docs.map((doc) => doc.ref.update({ cursor: FieldValue.delete(), startedAt: FieldValue.delete() })));

const { items: synced } = await refreshLedger();
for (const item of synced) {
  console.log(`${item.institution}: ${item.updated} backfilled, ${item.created} new, ${item.autoLabelled} auto-labelled, ${item.rulesLearned} rules learned`);
}

// Rules learned before rules had names show the merchant they were learned from
const entries = new Map((await db.collection(LINE_ENTRIES_COLLECTION).get()).docs.map((doc) => [doc.id, doc.data()]));
const unnamed = (await db.collection(LABEL_RULES_COLLECTION).get()).docs.filter((doc) => !doc.get("name"));
for (const doc of unnamed) {
  const source = ((doc.get("learnedFrom") as string[] | undefined) ?? []).map((id) => entries.get(id)).find(Boolean);
  await doc.ref.update({ name: source?.merchantName ?? source?.marketplace ?? doc.get("value") });
}
console.log(`named ${unnamed.length} rules`);

const everything = await autoLabelAll();
await regeneratePastReports(await allMonths());
console.log(`rerun: ${everything.assignments.length} filed, ${everything.tagAssignments.length} retagged, ${everything.learned.length} rules learned`);

async function allMonths() {
  return [...new Set([...entries.values()].map((entry) => entry.monthYear as string))];
}
