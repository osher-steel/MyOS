import type { Budget, MonthYear } from "@myos/shared";
import { ProxyClientError, unwrap } from "./proxyClient";

export type BudgetDraft = Pick<Budget, "income" | "needs" | "wants" | "savings">;

export { ProxyClientError as BudgetClientError };

export async function fetchBudget(monthYear: MonthYear): Promise<Budget | null> {
  const res = await fetch(`/api/budgets/${monthYear}`);
  if (res.status === 404) return null;
  return unwrap<Budget>(res);
}

export async function saveBudget(monthYear: MonthYear, draft: BudgetDraft): Promise<Budget> {
  const res = await fetch(`/api/budgets/${monthYear}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return unwrap<Budget>(res);
}
