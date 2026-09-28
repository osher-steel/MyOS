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
  EXCLUDED = "excluded", // not spending or income, e.g. a transfer between your own accounts
}

export type Tag = string; // a doc id in the tags collection, e.g. "food_delivery"

export interface TagDefinition {
  id: Tag;
  createdAt: FireTimestampLike;
}

export enum IncomeSource {
  DIBS_PAY = "DIBS pay",
  FREELANCE = "Freelance",
  REIMBURSEMENT = "Reimbursement",
  INTEREST = "Interest",
  GIFT_RECEIVED = "Gift received",
  OTHER_INCOME = "Other income",
}

export enum LabelSource {
  MANUAL = "manual",
  RULE = "rule",
}

export interface Counterparty {
  name: string;
  type: string;
  entityId?: string;
}

export interface PlaidDetails {
  accountId?: string;
  merchantName?: string;
  merchantEntityId?: string;
  originalDescription?: string;
  descriptionKey?: string; // normalized description, the same for every visit to one store
  marketplace?: string; // the delivery or marketplace app behind the merchant, e.g. DoorDash
  counterparties?: Counterparty[];
  categoryPrimary?: string;
  categoryDetailed?: string;
  categoryConfidence?: string;
  paymentChannel?: string;
  authorizedDate?: ISODateString;
  logoUrl?: string;
  website?: string;
  city?: string;
  region?: string;
}

export interface LineEntry extends PlaidDetails {
  id: string; // Plaid transaction_id, so re-sync is idempotent
  name: string;
  amount: number; // cents, Plaid sign: positive is money out
  date: ISODateString; // YYYY-MM-DD
  monthYear: MonthYear;
  currency: string;
  label?: string;
  goalId?: string; // paid from a goal instead of the month's budget; never set with label
  labelSource?: LabelSource; // absent on entries labelled before sources existed, which were manual
  ruleId?: string;
  tags?: Tag[];
  tagSource?: LabelSource;
  pendingTransactionId?: string;
  plaidStatus: PlaidTransactionStatus;
  osStatus: LineEntryStatus;
  createdAt: FireTimestampLike;
  updatedAt: FireTimestampLike;
}

export type LineEntryView = Omit<LineEntry, "createdAt" | "updatedAt">;

export interface PlaidTransaction extends Omit<PlaidDetails, "descriptionKey" | "marketplace"> {
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
> &
  PlaidDetails;

export interface SyncPlan {
  creates: LineEntryView[];
  updates: PlaidOwnedFields[];
  removed: string[];
  deletes: string[];
}

export enum LabelRuleField {
  MERCHANT_ENTITY_ID = "merchantEntityId",
  MERCHANT_NAME = "merchantName",
  COUNTERPARTY = "counterparty",
  DESCRIPTION = "description",
  CATEGORY = "category",
}

export enum LabelRuleMatch {
  EXACT = "exact",
  CONTAINS = "contains",
  TOKENS = "tokens",
}

export enum LabelRuleSource {
  MANUAL = "manual",
  LEARNED = "learned",
}

export interface LabelRule {
  id: string; // derived from field, match and value, so the same rule can't exist twice
  name: string;
  field: LabelRuleField;
  match: LabelRuleMatch;
  value: string;
  label?: string;
  exclude?: true; // files matches as excluded instead of labelling them; never set with label
  tags?: Tag[];
  source: LabelRuleSource;
  enabled: boolean;
  learnedFrom?: string[];
  matchCount: number;
  lastMatchedAt?: FireTimestampLike;
  createdAt: FireTimestampLike;
  updatedAt: FireTimestampLike;
}

export enum GoalStatus {
  ACTIVE = "active",
  COMPLETED = "completed",
}

export interface Goal {
  id: string;
  name: string;
  targetAmount?: number; // cents
  amountSaved: number; // cents, sum of this goal's allocations; negative when overdrawn
  status: GoalStatus;
  completedAt?: FireTimestampLike;
  createdAt: FireTimestampLike;
  updatedAt: FireTimestampLike;
}

export enum GoalAllocationReason {
  ASSIGNMENT = "assignment",
  TRANSFER = "transfer",
  GOAL_SPEND = "goal_spend",
  RELEASE = "release",
}

export interface GoalAllocation {
  id: string;
  goalId: string;
  monthYear?: MonthYear; // the month this is attributed to; absent for moves from unassigned savings
  amount: number; // cents, negative draws from the goal
  reason: GoalAllocationReason;
  transferId?: string;
  lineEntryId?: string;
  note?: string;
  createdAt: FireTimestampLike;
}

export interface SavingsOpening {
  amount: number; // cents: balance minus the start month's total allocation
  balance: number;
  allocated: number;
  computedAt: FireTimestampLike;
}

export interface SavingsState {
  startMonth: MonthYear;
  opening?: SavingsOpening;
}
