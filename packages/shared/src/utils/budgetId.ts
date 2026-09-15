import type { MonthYear } from "../types/interfaces/common.js";
import { isMonthYear, toMonthYear } from "./monthYear.js";

/**
 * Budget document id: `${userId}_${YYYY-MM}`, e.g. `u123_2026-09`.
 * Year-first so ids sort chronologically within a user, and the suffix is a
 * `MonthYear`, so `previousMonthYear()` gives last month's id directly.
 */
export function budgetId(userId: string, monthYear: MonthYear | Date = new Date()): string {
  const suffix = monthYear instanceof Date ? toMonthYear(monthYear) : monthYear;
  return `${userId}_${suffix}`;
}

/** Inverse of `budgetId()`; undefined when the id is not in that shape. */
export function parseBudgetId(id: string): { userId: string; monthYear: MonthYear } | undefined {
  const at = id.lastIndexOf("_");
  if (at <= 0) return undefined;
  const userId = id.slice(0, at);
  const monthYear = id.slice(at + 1);
  return isMonthYear(monthYear) ? { userId, monthYear } : undefined;
}
