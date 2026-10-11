import { BudgetGroup, type Budget } from "../types/interfaces/finance.js";

export type CategorySuggestion = { name: string; amount: number };

export const DEFAULT_CATEGORIES: Record<BudgetGroup, string[]> = {
  [BudgetGroup.NEEDS]: ["Rent", "Groceries", "Healthcare", "Insurance", "Utilities", "Phone", "Gas and Car Maintenance", "Work", "Misc"],
  [BudgetGroup.WANTS]: ["Eating out", "Fun", "Subscriptions", "Shopping", "Travel", "Gifts"],
  [BudgetGroup.SAVINGS]: ["Emergency", "Investing", "Travel"],
};

export type IncomeSuggestion = { average: number; last: number; months: number };

// Months that took in nothing are left out: they're usually before the bank was linked
export function incomeSuggestion(closedReports: Array<{ monthYear: string; entry: number }>, months = 3): IncomeSuggestion | null {
  const recent = closedReports
    .filter((report) => report.entry > 0)
    .sort((a, b) => b.monthYear.localeCompare(a.monthYear))
    .slice(0, months);
  if (recent.length === 0) return null;
  const average = Math.round(recent.reduce((sum, report) => sum + report.entry, 0) / recent.length);
  return { average, last: recent[0]!.entry, months: recent.length };
}

/** Names from past budgets, newest first with the amount last given, then defaults never used. */
export function budgetSuggestions(budgets: Budget[], group: BudgetGroup): CategorySuggestion[] {
  const seen = new Map<string, number>();
  for (const budget of [...budgets].sort((a, b) => b.id.localeCompare(a.id))) {
    for (const [name, amount] of Object.entries(budget[group])) {
      if (!seen.has(name)) seen.set(name, amount);
    }
  }
  const suggestions = [...seen].map(([name, amount]) => ({ name, amount }));
  const defaults = DEFAULT_CATEGORIES[group].filter((name) => !seen.has(name)).map((name) => ({ name, amount: 0 }));
  return [...suggestions, ...defaults];
}
