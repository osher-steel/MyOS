import type { FireTimestampLike, MonthYear } from "../types/interfaces/common.js";
import { BudgetGroup, type Budget, type LineEntryView } from "../types/interfaces/finance.js";
import { budgetUsage, type GroupUsage } from "./budgetUsage.js";
import { groupLineEntries, totalLineEntries } from "./lineEntries.js";

export enum MonthOutcome {
  UNDER = "under",
  OVER = "over",
  DEFICIT = "deficit",
}

export interface MonthReport {
  monthYear: MonthYear;
  hasBudget: boolean;
  incomeBudgeted: number;
  entry: number;
  incomeShortfall: number;
  allocated: number;
  spent: number;
  unlabelledSpent: number;
  net: number;
  spendingAllocated: number;
  spendingUsed: number;
  variance: number;
  savingsPlanned: number;
  savingsActual: number;
  balanceDeduction: number;
  groups: GroupUsage[];
  outcome: MonthOutcome | null;
}

export type StoredMonthReport = MonthReport & { id: string; generatedAt: FireTimestampLike; deficitCovered: number };

export { budgetId as monthReportId } from "./budgetId.js";

/** Credits need no label: every inflow is entry, every outflow is spent. */
export function monthReport(monthYear: MonthYear, budget: Budget | null, rows: LineEntryView[]): MonthReport {
  const groups = groupLineEntries(rows);
  const totals = totalLineEntries(groups);
  const entry = groups.all.reduce((total, row) => total + Math.max(-row.amount, 0), 0);
  const base = {
    monthYear,
    entry,
    spent: totals.spent,
    unlabelledSpent: totals.spentUnlabelled,
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
      spendingUsed: totals.spent,
      variance: 0,
      savingsPlanned: 0,
      savingsActual: 0,
      balanceDeduction: 0,
      groups: [],
      outcome: null,
    };
  }

  const usage = budgetUsage(budget, totals.usedByLabel, { unlabelledSpent: totals.spentUnlabelled, closing: true });
  const savings = usage.groups.find((g) => g.group === BudgetGroup.SAVINGS)!;
  const balanceDeduction = Math.max(0, -(savings.allocated + usage.variance));

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
    balanceDeduction,
    groups: usage.groups,
    outcome:
      usage.variance >= 0 ? MonthOutcome.UNDER : balanceDeduction > 0 ? MonthOutcome.DEFICIT : MonthOutcome.OVER,
  };
}
