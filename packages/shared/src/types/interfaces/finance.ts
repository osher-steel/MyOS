import type { FireTimestampLike } from "./common.js";

// ── Budgets ──────────────────────────────────────────────

/** The three hard-coded top-level groups every category belongs to. */
export enum BudgetGroup {
  NEEDS = "needs",
  WANTS = "wants",
  SAVINGS = "savings",
}

/** Category name → amount allocated for the month. */
export type BudgetAllocations = Record<string, number>;

/**
 * One month's plan. Stamped per month so last month's allocations survive
 * when this month's change. Document id is `${userId}_${YYYY-MM}` — see
 * `budgetId()` — so the current budget is a direct get, not a query.
 */
export interface Budget {
  id: string;
  createdAt: FireTimestampLike;
  updatedAt: FireTimestampLike;
  /** Expected money in for the month. Allocations across all groups may not exceed it. */
  income: number;
  needs: BudgetAllocations;
  wants: BudgetAllocations;
  savings: BudgetAllocations;
}

// ── Line entries (transactions) ──────────────────────────

/** Plaid's view of the transaction, from /transactions/sync. */
export enum PlaidTransactionStatus {
  PENDING = "pending",
  POSTED = "posted",
  REMOVED = "removed",
}

/** Our view: has it been filed under a budget category, and is that category still real. */
export enum LineEntryStatus {
  LABELLED = "labelled",
  NOT_LABELLED = "not_labelled",
  /** The label names a category that no longer exists in the month's budget. */
  MISLABELED = "mislabeled",
}

/**
 * A single transaction. Document id is Plaid's `transaction_id`, so re-syncing
 * the same transaction is an idempotent write, not a duplicate.
 */
export interface LineEntry {
  id: string;
  amount: number;
  /** A category name from the month's budget (any group). */
  label?: string;
  plaidStatus: PlaidTransactionStatus;
  osStatus: LineEntryStatus;
}
