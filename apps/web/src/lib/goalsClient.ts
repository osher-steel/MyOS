import { GoalStatus, type Goal, type GoalAllocation, type MonthYear, type SavingsSummary } from "@myos/shared";
import { unwrap } from "./proxyClient";

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchGoals(): Promise<Goal[]> {
  return unwrap<Goal[]>(await fetch("/api/goals"));
}

export async function fetchActiveGoals(): Promise<Goal[]> {
  return (await fetchGoals()).filter((goal) => goal.status === GoalStatus.ACTIVE);
}

export async function createGoal(draft: { name: string; targetAmount?: number }): Promise<Goal> {
  return unwrap<Goal>(await fetch("/api/goals", json("POST", draft)));
}

export async function setGoalTarget(id: string, targetAmount: number): Promise<Goal> {
  return unwrap<Goal>(await fetch(`/api/goals/${encodeURIComponent(id)}`, json("PATCH", { targetAmount })));
}

export async function completeGoal(id: string): Promise<Goal> {
  return unwrap<Goal>(await fetch(`/api/goals/${encodeURIComponent(id)}/completions`, json("POST", {})));
}

export async function fetchAllocations(): Promise<GoalAllocation[]> {
  return unwrap<GoalAllocation[]>(await fetch("/api/goal-allocations"));
}

export async function assignToGoal(draft: { goalId: string; amount: number; monthYear?: MonthYear; note?: string }): Promise<GoalAllocation> {
  return unwrap<GoalAllocation>(await fetch("/api/goal-allocations", json("POST", draft)));
}

export async function transferBetweenGoals(draft: {
  fromGoalId: string;
  toGoalId: string;
  amount: number;
  monthYear: MonthYear;
  note?: string;
}): Promise<void> {
  await unwrap(await fetch("/api/goal-allocations/transfers", json("POST", draft)));
}

export async function undoAllocation(id: string): Promise<void> {
  const res = await fetch(`/api/goal-allocations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.status !== 204) await unwrap(res);
}

export async function fetchSavings(): Promise<SavingsSummary> {
  return unwrap<SavingsSummary>(await fetch("/api/savings"));
}
