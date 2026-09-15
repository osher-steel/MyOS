import {
  LineEntryStatus,
  PlaidTransactionStatus,
  type LineEntry,
  type LineEntryView,
  type PlaidTransaction,
} from "../types/interfaces/finance.js";

export function plaidStatusOf(tx: Pick<PlaidTransaction, "pending">): PlaidTransactionStatus {
  return tx.pending ? PlaidTransactionStatus.PENDING : PlaidTransactionStatus.POSTED;
}

export function osStatusOf(label: string | undefined): LineEntryStatus {
  return label ? LineEntryStatus.LABELLED : LineEntryStatus.NOT_LABELLED;
}

export function toLineEntryView(tx: PlaidTransaction): LineEntryView {
  return {
    id: tx.id,
    name: tx.name,
    amount: tx.amount,
    date: tx.date,
    monthYear: tx.date.slice(0, 7),
    currency: tx.currency,
    ...(tx.pendingTransactionId ? { pendingTransactionId: tx.pendingTransactionId } : {}),
    plaidStatus: plaidStatusOf(tx),
    osStatus: LineEntryStatus.NOT_LABELLED,
  };
}

export function byDateDesc(a: LineEntryView, b: LineEntryView): number {
  return b.date.localeCompare(a.date) || a.name.localeCompare(b.name);
}

/**
 * Stored entries own the label; Plaid owns amount and status. When Plaid has
 * posted a transaction we only stored as pending, the label follows it to the
 * new id and the pending row disappears.
 */
export function mergeLineEntries(
  stored: Array<LineEntry | LineEntryView>,
  live: PlaidTransaction[],
): LineEntryView[] {
  const rows = new Map<string, LineEntryView>();
  for (const { createdAt: _c, updatedAt: _u, ...view } of stored as LineEntry[]) {
    rows.set(view.id, view);
  }

  for (const tx of live) {
    const settled = tx.pendingTransactionId ? rows.get(tx.pendingTransactionId) : undefined;
    if (settled) rows.delete(settled.id);

    const known = rows.get(tx.id) ?? settled;
    const fresh = toLineEntryView(tx);
    rows.set(
      tx.id,
      known?.label ? { ...fresh, label: known.label, osStatus: known.osStatus } : fresh,
    );
  }

  return [...rows.values()].sort(byDateDesc);
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
  return {
    all: rows,
    labelled: rows.filter((row) => row.label !== undefined),
    unlabelled: rows.filter((row) => row.label === undefined),
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
