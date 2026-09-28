import type { MonthYear } from "../types/interfaces/common.js";
import {
  LabelSource,
  LineEntryStatus,
  PlaidTransactionStatus,
  type PlaidDetails,
  type LineEntryView,
  type PlaidOwnedFields,
  type PlaidSyncDelta,
  type PlaidTransaction,
  type SyncPlan,
} from "../types/interfaces/finance.js";
import { normalizeDescription } from "./descriptions.js";

export function plaidStatusOf(tx: Pick<PlaidTransaction, "pending">): PlaidTransactionStatus {
  return tx.pending ? PlaidTransactionStatus.PENDING : PlaidTransactionStatus.POSTED;
}

export function osStatusOf(label: string | undefined, goalId?: string): LineEntryStatus {
  return label || goalId ? LineEntryStatus.LABELLED : LineEntryStatus.NOT_LABELLED;
}

export function labelSourceOf(entry: Pick<LineEntryView, "label" | "goalId" | "labelSource">): LabelSource | undefined {
  if (entry.labelSource) return entry.labelSource;
  return entry.label || entry.goalId ? LabelSource.MANUAL : undefined;
}

export function tagSourceOf(entry: Pick<LineEntryView, "tags" | "tagSource">): LabelSource | undefined {
  if (entry.tagSource) return entry.tagSource;
  return entry.tags?.length ? LabelSource.MANUAL : undefined;
}

const live = (entry: LineEntryView) => entry.plaidStatus !== PlaidTransactionStatus.REMOVED;

export function isUnlabelled(entry: LineEntryView): boolean {
  return !entry.label && !entry.goalId && entry.osStatus !== LineEntryStatus.EXCLUDED && live(entry);
}

export function isManuallyLabelled(entry: LineEntryView): boolean {
  return Boolean(entry.label) && labelSourceOf(entry) === LabelSource.MANUAL && live(entry);
}

export function isManuallyTagged(entry: LineEntryView): boolean {
  return Boolean(entry.tags?.length) && tagSourceOf(entry) === LabelSource.MANUAL && live(entry);
}

const DETAIL_KEYS = [
  "accountId",
  "merchantName",
  "merchantEntityId",
  "originalDescription",
  "counterparties",
  "categoryPrimary",
  "categoryDetailed",
  "categoryConfidence",
  "paymentChannel",
  "authorizedDate",
  "logoUrl",
  "website",
  "city",
  "region",
] as const satisfies ReadonlyArray<keyof PlaidDetails>;

function plaidDetails(tx: PlaidTransaction): PlaidDetails {
  const details: Record<string, unknown> = {};
  for (const key of DETAIL_KEYS) {
    if (tx[key] !== undefined) details[key] = tx[key];
  }
  const descriptionKey = normalizeDescription(tx.originalDescription ?? tx.name);
  const marketplace = tx.counterparties?.find((counterparty) => counterparty.type === "marketplace")?.name;
  return {
    ...(details as PlaidDetails),
    ...(descriptionKey ? { descriptionKey } : {}),
    ...(marketplace ? { marketplace } : {}),
  };
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
    ...plaidDetails(tx),
  };
}

export function byDateDesc(a: LineEntryView, b: LineEntryView): number {
  return b.date.localeCompare(a.date) || a.name.localeCompare(b.name);
}

type StoredLabel = Pick<
  LineEntryView,
  "id" | "label" | "goalId" | "labelSource" | "ruleId" | "tags" | "tagSource" | "osStatus"
>;

/**
 * Updates carry only Plaid-owned fields, so a sync can never overwrite a label.
 * A posted transaction replacing a stored pending one inherits its label or goal,
 * how it was labelled and its tags, and the pending row is deleted rather than
 * marked removed.
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
    plan.creates.push({
      ...fields,
      ...(settled?.label ? { label: settled.label } : {}),
      ...(settled?.goalId ? { goalId: settled.goalId } : {}),
      ...(settled?.labelSource ? { labelSource: settled.labelSource } : {}),
      ...(settled?.ruleId ? { ruleId: settled.ruleId } : {}),
      ...(settled?.tags?.length ? { tags: settled.tags } : {}),
      ...(settled?.tagSource ? { tagSource: settled.tagSource } : {}),
      osStatus: settled ? settled.osStatus : LineEntryStatus.NOT_LABELLED,
    });
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
  fromGoals: LineEntryView[];
};

export type LineEntryTotals = {
  spent: number;
  spentLabelled: number;
  spentUnlabelled: number;
  spentFromGoals: number;
  usedByLabel: Record<string, number>;
};

const outflow = (rows: LineEntryView[]) => rows.reduce((sum, row) => sum + Math.max(row.amount, 0), 0);

export function groupLineEntries(rows: LineEntryView[]): LineEntryGroups {
  const all = rows.filter((row) => live(row) && row.osStatus !== LineEntryStatus.EXCLUDED).sort(byDateDesc);
  return {
    all,
    labelled: all.filter((row) => row.label !== undefined),
    unlabelled: all.filter((row) => row.label === undefined && row.goalId === undefined),
    fromGoals: all.filter((row) => row.goalId !== undefined),
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
    spentFromGoals: outflow(groups.fromGoals),
    usedByLabel,
  };
}
