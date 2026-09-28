import {
  LINE_ENTRIES_COLLECTION,
  PLAID_ITEMS_COLLECTION,
  PlaidTransactionStatus,
  planSync,
  type LineEntryView,
  type PlaidSyncDelta,
  type SyncPlan,
} from "@myos/shared";
import { db, FieldValue, Timestamp } from "../config/firebase.js";
import { AppError } from "../core/errors/errors.js";
import { linkedItems, syncTransactions, type PlaidItem } from "../integrations/plaid.js";

const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const FIRESTORE_BATCH_LIMIT = 500;

export type ItemSyncResult = {
  institution: string;
  skipped: boolean;
  created: number;
  updated: number;
  removed: number;
  deleted: number;
};

type ItemState = { cursor?: string; startedAt?: Timestamp };

const lineEntries = db.collection(LINE_ENTRIES_COLLECTION);
const plaidItems = db.collection(PLAID_ITEMS_COLLECTION);

/** Claims the item so overlapping page loads don't run the same cursor twice. */
async function claim(item: PlaidItem, now: Date): Promise<{ cursor?: string; previousStart?: Timestamp } | null> {
  const ref = plaidItems.doc(item.itemId);
  return db.runTransaction(async (tx) => {
    const state = ((await tx.get(ref)).data() ?? {}) as ItemState;
    if (state.startedAt && now.getTime() - state.startedAt.toMillis() < MIN_SYNC_INTERVAL_MS) return null;
    tx.set(ref, { institution: item.institution, startedAt: Timestamp.fromDate(now) }, { merge: true });
    return { cursor: state.cursor, previousStart: state.startedAt };
  });
}

async function storedLabels(delta: PlaidSyncDelta): Promise<Map<string, LineEntryView>> {
  const ids = new Set(delta.removed);
  for (const tx of [...delta.added, ...delta.modified]) {
    ids.add(tx.id);
    if (tx.pendingTransactionId) ids.add(tx.pendingTransactionId);
  }

  const stored = new Map<string, LineEntryView>();
  const refs = [...ids].map((id) => lineEntries.doc(id));
  for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_LIMIT) {
    const docs = await db.getAll(...refs.slice(i, i + FIRESTORE_BATCH_LIMIT));
    for (const doc of docs) {
      if (doc.exists) stored.set(doc.id, { ...(doc.data() as LineEntryView), id: doc.id });
    }
  }
  return stored;
}

async function applyPlan(plan: SyncPlan, now: Date): Promise<void> {
  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [
    ...plan.creates.map(({ id, ...view }) => (batch: FirebaseFirestore.WriteBatch) =>
      batch.set(lineEntries.doc(id), { ...view, createdAt: now, updatedAt: now }),
    ),
    ...plan.updates.map(({ id, ...fields }) => (batch: FirebaseFirestore.WriteBatch) =>
      batch.update(lineEntries.doc(id), { ...fields, updatedAt: now }),
    ),
    ...plan.removed.map((id) => (batch: FirebaseFirestore.WriteBatch) =>
      batch.update(lineEntries.doc(id), { plaidStatus: PlaidTransactionStatus.REMOVED, updatedAt: now }),
    ),
    ...plan.deletes.map((id) => (batch: FirebaseFirestore.WriteBatch) => batch.delete(lineEntries.doc(id))),
  ];

  for (let i = 0; i < writes.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + FIRESTORE_BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

async function syncItem(item: PlaidItem): Promise<ItemSyncResult> {
  const now = new Date();
  const result = { institution: item.institution, skipped: false, created: 0, updated: 0, removed: 0, deleted: 0 };
  const claimed = await claim(item, now);
  if (!claimed) return { ...result, skipped: true };

  try {
    const { delta, nextCursor } = await syncTransactions(item, claimed.cursor);
    const plan = planSync(delta, await storedLabels(delta));
    await applyPlan(plan, now);
    // Cursor moves only after every write lands, so a crash replays the same delta
    await plaidItems.doc(item.itemId).set({ cursor: nextCursor, syncedAt: now }, { merge: true });
    return {
      ...result,
      created: plan.creates.length,
      updated: plan.updates.length,
      removed: plan.removed.length,
      deleted: plan.deletes.length,
    };
  } catch (error) {
    await plaidItems.doc(item.itemId).update({ startedAt: claimed.previousStart ?? FieldValue.delete() });
    throw error;
  }
}

export async function syncLinkedItems(): Promise<ItemSyncResult[]> {
  const items = linkedItems();
  if (items.length === 0) {
    throw new AppError(
      `No ${process.env.PLAID_ENV ?? "production"} bank linked. Run: python3 ~/.claude/skills/plaid/link_server.py <bank>`,
      503,
      "plaid_not_linked",
    );
  }
  return Promise.all(items.map(syncItem));
}
