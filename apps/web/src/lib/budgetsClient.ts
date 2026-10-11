import type { Budget, EffectiveBudget, MonthYear } from "@myos/shared";
import { ProxyClientError, unwrap } from "./proxyClient";

export type BudgetDraft = Pick<Budget, "income" | "needs" | "wants" | "savings">;

export { ProxyClientError as BudgetClientError };

export async function fetchBudget(monthYear: MonthYear): Promise<EffectiveBudget | null> {
  const res = await fetch(`/api/budgets/${monthYear}`);
  if (res.status === 404) return null;
  return unwrap<EffectiveBudget>(res);
}

export async function fetchBudgets(): Promise<Budget[]> {
  return unwrap<Budget[]>(await fetch("/api/budgets"));
}

export async function saveBudget(monthYear: MonthYear, draft: BudgetDraft): Promise<Budget> {
  const res = await fetch(`/api/budgets/${monthYear}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return unwrap<Budget>(res);
}
