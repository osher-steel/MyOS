import type { FireTimestampLike, ISODateString, MonthYear } from "./common.js";

// ── Budgets ──────────────────────────────────────────────

/** The three hard-coded top-level groups every category belongs to. */
export enum BudgetGroup {
  NEEDS = "needs",
  WANTS = "wants",
  SAVINGS = "savings",
}

export type BudgetAllocations = Record<string, number>; // category name → cents

export interface Budget {
  id: string;
  createdAt: FireTimestampLike;
  updatedAt: FireTimestampLike;
  income: number; // cents; allocations across all groups may not exceed it
  needs: BudgetAllocations;
  wants: BudgetAllocations;
  savings: BudgetAllocations;
}

export enum PlaidTransactionStatus {
  PENDING = "pending",
  POSTED = "posted",
  REMOVED = "removed",
}

export enum LineEntryStatus {
  LABELLED = "labelled",
  NOT_LABELLED = "not_labelled",
  MISLABELED = "mislabeled",
}

export interface LineEntry {
  id: string; // Plaid transaction_id, so re-sync is idempotent
  name: string;
  amount: number; // cents, Plaid sign: positive is money out
  date: ISODateString; // YYYY-MM-DD
  monthYear: MonthYear;
  currency: string;
  label?: string;
  pendingTransactionId?: string;
  plaidStatus: PlaidTransactionStatus;
  osStatus: LineEntryStatus;
  createdAt: FireTimestampLike;
  updatedAt: FireTimestampLike;
}

export type LineEntryView = Omit<LineEntry, "createdAt" | "updatedAt">;

export interface PlaidTransaction {
  id: string;
  name: string;
  amount: number; // cents
  date: ISODateString;
  currency: string;
  pending: boolean;
  pendingTransactionId?: string;
}

export interface PlaidSyncDelta {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: string[];
}

export type PlaidOwnedFields = Pick<
  LineEntryView,
  "id" | "name" | "amount" | "date" | "monthYear" | "currency" | "pendingTransactionId" | "plaidStatus"
>;

export interface SyncPlan {
  creates: LineEntryView[];
  updates: PlaidOwnedFields[];
  removed: string[];
  deletes: string[];
}
