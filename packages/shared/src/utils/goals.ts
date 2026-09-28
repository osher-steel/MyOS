import type { MonthYear } from "../types/interfaces/common.js";
import {
  BudgetGroup,
  GoalAllocationReason,
  type GoalAllocation,
  type SavingsState,
} from "../types/interfaces/finance.js";
import type { MonthReport } from "./monthReport.js";

export type MonthSavingsShare = { name: string; amount: number };

/** The budget's savings categories as a suggested split of the month's result. */
export function monthSavingsShares(report: MonthReport): MonthSavingsShare[] {
  const savings = report.groups.find((group) => group.group === BudgetGroup.SAVINGS);
  return (savings?.categories ?? [])
    .filter((category) => category.used !== 0)
    .map((category) => ({ name: category.name, amount: category.used }));
}

const dollars = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;

export type AssignmentCheck = {
  amount: number;
  goalName: string;
  goalBalance: number;
  monthRemaining?: number; // undefined when moving from unassigned savings
  unassigned: number;
};

/** Human messages for why an assignment can't be recorded; empty when it can. */
export function assignmentErrors({ amount, goalName, goalBalance, monthRemaining, unassigned }: AssignmentCheck): string[] {
  const errors: string[] = [];
  if (monthRemaining !== undefined) {
    if (monthRemaining === 0) errors.push("This month is already fully assigned.");
    else if (Math.sign(amount) !== Math.sign(monthRemaining)) {
      errors.push(monthRemaining > 0 ? "This month saved money, so assign a positive amount." : "This month overspent, so reduce a goal with a negative amount.");
    } else if (Math.abs(amount) > Math.abs(monthRemaining)) {
      errors.push(`Only ${dollars(monthRemaining)} of this month is left to assign.`);
    }
  } else if (amount > unassigned) {
    errors.push(`Only ${dollars(unassigned)} of savings is unassigned.`);
  }
  if (amount < 0 && goalBalance + amount < 0) errors.push(`${goalName} only holds ${dollars(goalBalance)}.`);
  return errors;
}

export function transferErrors({ amount, fromName, fromBalance, sameGoal }: {
  amount: number;
  fromName: string;
  fromBalance: number;
  sameGoal: boolean;
}): string[] {
  const errors: string[] = [];
  if (sameGoal) errors.push("Pick two different goals.");
  if (amount <= 0) errors.push("Transfer a positive amount.");
  if (amount > fromBalance) errors.push(`${fromName} only holds ${dollars(fromBalance)}.`);
  return errors;
}

export type SavingsMonth = { monthYear: MonthYear; result: number; assigned: number; remaining: number };

export type SavingsSummary = {
  startMonth: MonthYear | null;
  opening: number | null;
  total: number;
  inGoals: number;
  unassigned: number;
  months: SavingsMonth[];
};

/**
 * Transfers net to zero and goal spending leaves through a goal, so what is
 * unassigned is the opening plus every month's result, minus what was assigned
 * or released between the pool and the goals.
 */
export function savingsSummary(
  state: SavingsState | null,
  reports: Array<Pick<MonthReport, "monthYear" | "savingsResult">>,
  allocations: Array<Pick<GoalAllocation, "amount" | "reason" | "monthYear">>,
  goalBalances: number[],
): SavingsSummary {
  const counted = state ? reports.filter((report) => report.monthYear >= state.startMonth) : [];
  const assignedIn = (monthYear: MonthYear) =>
    allocations
      .filter((a) => a.reason === GoalAllocationReason.ASSIGNMENT && a.monthYear === monthYear)
      .reduce((sum, a) => sum + a.amount, 0);

  const months = counted
    .map((report) => {
      const assigned = assignedIn(report.monthYear);
      return { monthYear: report.monthYear, result: report.savingsResult, assigned, remaining: report.savingsResult - assigned };
    })
    .sort((a, b) => a.monthYear.localeCompare(b.monthYear));

  const opening = state?.opening?.amount ?? null;
  const toOrFromPool = allocations
    .filter((a) => a.reason === GoalAllocationReason.ASSIGNMENT || a.reason === GoalAllocationReason.RELEASE)
    .reduce((sum, a) => sum + a.amount, 0);
  const unassigned = (opening ?? 0) + months.reduce((sum, m) => sum + m.result, 0) - toOrFromPool;
  const inGoals = goalBalances.reduce((sum, balance) => sum + balance, 0);

  return { startMonth: state?.startMonth ?? null, opening, total: unassigned + inGoals, inGoals, unassigned, months };
}
