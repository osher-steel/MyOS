import { BudgetGroup, type Budget } from "../types/interfaces/finance.js";
import { splitProportionally } from "./money.js";

export type CategoryUsage = { name: string; used: number; allocated: number };
export type GroupUsage = { group: BudgetGroup; used: number; allocated: number; categories: CategoryUsage[] };

export type BudgetUsage = {
  income: number;
  allocated: number;
  unallocated: number;
  spendingAllocated: number;
  spendingUsed: number;
  variance: number;
  groups: GroupUsage[];
};

const SPENDING_GROUPS = [BudgetGroup.NEEDS, BudgetGroup.WANTS] as const;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function spendingUsage(budget: Budget, group: BudgetGroup, usedByLabel: Record<string, number>): GroupUsage {
  const categories = Object.entries(budget[group]).map(([name, allocated]) => ({
    name,
    allocated,
    used: usedByLabel[name] ?? 0,
  }));
  return {
    group,
    categories,
    used: sum(categories.map((c) => c.used)),
    allocated: sum(categories.map((c) => c.allocated)),
  };
}

// A negative total stays on the group so the deficit shows; categories only split what was kept
function savingsUsage(budget: Budget, used: number): GroupUsage {
  const entries = Object.entries(budget[BudgetGroup.SAVINGS]);
  const allocated = sum(entries.map(([, amount]) => amount));
  const shares = splitProportionally(Math.max(0, used), entries.map(([, amount]) => amount));
  const categories = entries.map(([name, amount], i) => ({ name, allocated: amount, used: shares[i]! }));
  return { group: BudgetGroup.SAVINGS, categories, used, allocated };
}

/**
 * Unlabelled spending still left the account, so it counts against the
 * spending allocation. Without `entry` savings is projected: the allocation,
 * reduced by any overspend. With it savings is what is actually left over,
 * entry minus spending, and goes negative when spending outran entry.
 */
export function budgetUsage(
  budget: Budget,
  usedByLabel: Record<string, number>,
  { unlabelledSpent = 0, entry }: { unlabelledSpent?: number; entry?: number } = {},
): BudgetUsage {
  const spending = SPENDING_GROUPS.map((group) => spendingUsage(budget, group, usedByLabel));
  const spendingAllocated = sum(spending.map((g) => g.allocated));
  const spendingUsed = sum(spending.map((g) => g.used)) + unlabelledSpent;
  const variance = spendingAllocated - spendingUsed;
  const savingsAllocated = sum(Object.values(budget[BudgetGroup.SAVINGS]));
  const saved = entry === undefined ? Math.max(0, savingsAllocated + Math.min(0, variance)) : entry - spendingUsed;
  const groups = [...spending, savingsUsage(budget, saved)];
  const allocated = sum(groups.map((g) => g.allocated));
  return {
    income: budget.income,
    allocated,
    unallocated: budget.income - allocated,
    spendingAllocated,
    spendingUsed,
    variance,
    groups,
  };
}

export function budgetCategories(budget: Budget): Array<{ group: BudgetGroup; names: string[] }> {
  return Object.values(BudgetGroup).map((group) => ({ group, names: Object.keys(budget[group]) }));
}
