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

/**
 * Savings is what is left, not what was spent: it starts at its allocation and
 * moves by the spending variance, shared across its categories in proportion
 * to their allocation, never below zero.
 */
function savingsUsage(budget: Budget, delta: number): GroupUsage {
  const entries = Object.entries(budget[BudgetGroup.SAVINGS]);
  const allocated = sum(entries.map(([, amount]) => amount));
  const kept = Math.max(0, allocated + delta);
  const shares = splitProportionally(kept, entries.map(([, amount]) => amount));
  const categories = entries.map(([name, amount], i) => ({ name, allocated: amount, used: shares[i]! }));
  return { group: BudgetGroup.SAVINGS, categories, used: kept, allocated };
}

/**
 * Unlabelled spending still left the account, so it counts against the
 * spending allocation. Mid-month only overspend touches savings; at close
 * (`closing`) underspend flows into it too.
 */
export function budgetUsage(
  budget: Budget,
  usedByLabel: Record<string, number>,
  { unlabelledSpent = 0, closing = false }: { unlabelledSpent?: number; closing?: boolean } = {},
): BudgetUsage {
  const spending = SPENDING_GROUPS.map((group) => spendingUsage(budget, group, usedByLabel));
  const spendingAllocated = sum(spending.map((g) => g.allocated));
  const spendingUsed = sum(spending.map((g) => g.used)) + unlabelledSpent;
  const variance = spendingAllocated - spendingUsed;
  const groups = [...spending, savingsUsage(budget, closing ? variance : Math.min(0, variance))];
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
