import type { FireTimestampLike, MonthYear } from "../types/interfaces/common.js";
import { BudgetGroup, type Budget, type LineEntryView } from "../types/interfaces/finance.js";
import { lineEntryBreakdowns, type LineEntryBreakdowns } from "./breakdowns.js";
import { budgetUsage, type GroupUsage } from "./budgetUsage.js";
import { groupLineEntries, totalLineEntries } from "./lineEntries.js";

export enum MonthOutcome {
  AHEAD = "ahead",
  SHORT = "short",
  DEFICIT = "deficit",
}

export interface MonthReport {
  monthYear: MonthYear;
  hasBudget: boolean;
  incomeBudgeted: number;
  entry: number;
  projected: boolean;
  incomeShortfall: number;
  allocated: number;
  spent: number;
  unlabelledSpent: number;
  unlabelledCount: number;
  businessPaid: number;
  businessReimbursed: number;
  breakdowns: LineEntryBreakdowns;
  net: number;
  spendingAllocated: number;
  spendingUsed: number;
  variance: number;
  savingsPlanned: number;
  savingsActual: number;
  savingsResult: number;
  goalSpent: number;
  groups: GroupUsage[];
  outcome: MonthOutcome | null;
}

export type StoredMonthReport = MonthReport & { id: string; generatedAt: FireTimestampLike };

export { budgetId as monthReportId } from "./budgetId.js";

/**
 * Every inflow is entry and every outflow is spent; labels on credits only say
 * where income came from. A `projected` month counts income that hasn't landed
 * yet: savings is figured from the budgeted income until entry passes it.
 */
export function monthReport(
  monthYear: MonthYear,
  budget: Budget | null,
  rows: LineEntryView[],
  { projected = false }: { projected?: boolean } = {},
): MonthReport {
  const groups = groupLineEntries(rows);
  const totals = totalLineEntries(groups);
  const entry = groups.all.reduce((total, row) => total + Math.max(-row.amount, 0), 0);
  const base = {
    monthYear,
    entry,
    projected,
    spent: totals.spent,
    unlabelledSpent: totals.spentUnlabelled,
    unlabelledCount: groups.unlabelled.length,
    businessPaid: groups.business.reduce((total, row) => total + Math.max(row.amount, 0), 0),
    businessReimbursed: groups.business.reduce((total, row) => total + Math.max(-row.amount, 0), 0),
    breakdowns: lineEntryBreakdowns(groups.all),
    goalSpent: totals.spentFromGoals,
    net: entry - totals.spent,
  };

  if (!budget) {
    return {
      ...base,
      hasBudget: false,
      incomeBudgeted: 0,
      incomeShortfall: 0,
      allocated: 0,
      spendingAllocated: 0,
      spendingUsed: totals.spent - totals.spentFromGoals,
      variance: 0,
      savingsPlanned: 0,
      savingsActual: 0,
      savingsResult: 0,
      groups: [],
      outcome: null,
    };
  }

  const expectedEntry = projected ? Math.max(entry, budget.income) : entry;
  const usage = budgetUsage(budget, totals.usedByLabel, { unlabelledSpent: totals.spentUnlabelled, entry: expectedEntry });
  const savings = usage.groups.find((g) => g.group === BudgetGroup.SAVINGS)!;

  return {
    ...base,
    hasBudget: true,
    incomeBudgeted: budget.income,
    incomeShortfall: Math.max(0, budget.income - entry),
    allocated: usage.allocated,
    spendingAllocated: usage.spendingAllocated,
    spendingUsed: usage.spendingUsed,
    variance: usage.variance,
    savingsPlanned: savings.allocated,
    savingsActual: savings.used,
    savingsResult: savings.used,
    groups: usage.groups,
    outcome:
      savings.used < 0 ? MonthOutcome.DEFICIT : savings.used >= savings.allocated ? MonthOutcome.AHEAD : MonthOutcome.SHORT,
  };
}
