import type { MonthYear } from "../types/interfaces/common.js";
import {
  LineEntryStatus,
  PlaidTransactionStatus,
  type LineEntryView,
  type PlaidOwnedFields,
  type PlaidSyncDelta,
  type PlaidTransaction,
  type SyncPlan,
} from "../types/interfaces/finance.js";

export function plaidStatusOf(tx: Pick<PlaidTransaction, "pending">): PlaidTransactionStatus {
  return tx.pending ? PlaidTransactionStatus.PENDING : PlaidTransactionStatus.POSTED;
}

export function osStatusOf(label: string | undefined): LineEntryStatus {
  return label ? LineEntryStatus.LABELLED : LineEntryStatus.NOT_LABELLED;
}

export function plaidOwnedFields(tx: PlaidTransaction): PlaidOwnedFields {
  return {
    id: tx.id,
    name: tx.name,
    amount: tx.amount,
    date: tx.date,
    monthYear: tx.date.slice(0, 7),
    currency: tx.currency,
    ...(tx.pendingTransactionId ? { pendingTransactionId: tx.pendingTransactionId } : {}),
    plaidStatus: plaidStatusOf(tx),
  };
}

export function byDateDesc(a: LineEntryView, b: LineEntryView): number {
  return b.date.localeCompare(a.date) || a.name.localeCompare(b.name);
}

type StoredLabel = Pick<LineEntryView, "id" | "label" | "osStatus">;

/**
 * Updates carry only Plaid-owned fields, so a sync can never overwrite a label.
 * A posted transaction replacing a stored pending one inherits its label, and
 * the pending row is deleted rather than marked removed.
 */
export function planSync(delta: PlaidSyncDelta, stored: ReadonlyMap<string, StoredLabel>): SyncPlan {
  const removed = new Set(delta.removed);
  const latest = new Map<string, PlaidTransaction>();
  for (const tx of [...delta.added, ...delta.modified]) {
    if (!removed.has(tx.id)) latest.set(tx.id, tx);
  }

  const plan: SyncPlan = { creates: [], updates: [], removed: [], deletes: [] };
  for (const tx of latest.values()) {
    const fields = plaidOwnedFields(tx);
    if (stored.has(tx.id)) {
      plan.updates.push(fields);
      continue;
    }
    const settled = tx.pendingTransactionId ? stored.get(tx.pendingTransactionId) : undefined;
    if (settled) plan.deletes.push(settled.id);
    plan.creates.push(
      settled?.label
        ? { ...fields, label: settled.label, osStatus: settled.osStatus }
        : { ...fields, osStatus: LineEntryStatus.NOT_LABELLED },
    );
  }

  const deleted = new Set(plan.deletes);
  plan.removed = delta.removed.filter((id) => stored.has(id) && !deleted.has(id));
  return plan;
}

/** Months whose totals a plan changes, including where removed and deleted rows lived. */
export function touchedMonths(plan: SyncPlan, stored: ReadonlyMap<string, Pick<LineEntryView, "monthYear">>): MonthYear[] {
  const months = new Set<MonthYear>([...plan.creates, ...plan.updates].map((row) => row.monthYear));
  for (const id of [...plan.removed, ...plan.deletes]) {
    const month = stored.get(id)?.monthYear;
    if (month) months.add(month);
  }
  return [...months].sort();
}

export type LineEntryGroups = {
  all: LineEntryView[];
  labelled: LineEntryView[];
  unlabelled: LineEntryView[];
};

export type LineEntryTotals = {
  spent: number;
  spentLabelled: number;
  spentUnlabelled: number;
  usedByLabel: Record<string, number>;
};

const outflow = (rows: LineEntryView[]) => rows.reduce((sum, row) => sum + Math.max(row.amount, 0), 0);

export function groupLineEntries(rows: LineEntryView[]): LineEntryGroups {
  const all = rows.filter((row) => row.plaidStatus !== PlaidTransactionStatus.REMOVED).sort(byDateDesc);
  return {
    all,
    labelled: all.filter((row) => row.label !== undefined),
    unlabelled: all.filter((row) => row.label === undefined),
  };
}

/** Per-label totals keep the sign so a refund reduces what a category used. */
export function totalLineEntries(groups: LineEntryGroups): LineEntryTotals {
  const usedByLabel: Record<string, number> = {};
  for (const row of groups.labelled) {
    usedByLabel[row.label!] = (usedByLabel[row.label!] ?? 0) + row.amount;
  }
  return {
    spent: outflow(groups.all),
    spentLabelled: outflow(groups.labelled),
    spentUnlabelled: outflow(groups.unlabelled),
    usedByLabel,
  };
}
