import type { MonthYear } from "../types/interfaces/common.js";
import { BudgetGroup } from "../types/interfaces/finance.js";
import type { MonthReport } from "./monthReport.js";

export type MonthSavingsShare = { name: string; amount: number };

export function monthSavingsShares(report: MonthReport): MonthSavingsShare[] {
  const savings = report.groups.find((group) => group.group === BudgetGroup.SAVINGS);
  return (savings?.categories ?? [])
    .filter((category) => category.used !== 0)
    .map((category) => ({ name: category.name, amount: category.used }));
}

export function uncoveredDeficit(report: Pick<MonthReport, "balanceDeduction">, covered: number): number {
  return Math.max(0, report.balanceDeduction - covered);
}

export type DeficitCoverCheck = {
  monthYear: MonthYear;
  amount: number;
  goalSaved: number;
  uncovered: number;
};

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Human messages for why a manual deficit cover can't be recorded; empty when it can. */
export function deficitCoverErrors({ monthYear, amount, goalSaved, uncovered }: DeficitCoverCheck): string[] {
  const draw = -amount;
  const errors: string[] = [];
  if (draw <= 0) errors.push("A deficit cover draws from the goal, so its amount must be negative.");
  if (draw > goalSaved) errors.push(`The goal only holds ${dollars(goalSaved)}.`);
  if (draw > uncovered) errors.push(`${monthYear} only has ${dollars(uncovered)} of deficit left to cover.`);
  return errors;
}
