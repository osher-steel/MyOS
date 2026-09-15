import type { MonthYear } from "../types/interfaces/common.js";

const MONTH_YEAR = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthYear(value: string): value is MonthYear {
  return MONTH_YEAR.test(value);
}

/** `YYYY-MM` for the given date in local time (defaults to now). */
export function toMonthYear(date: Date = new Date()): MonthYear {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

/** The `YYYY-MM` immediately before the given one. */
export function previousMonthYear(monthYear: MonthYear): MonthYear {
  const [year, month] = monthYear.split("-").map(Number) as [number, number];
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

/** The `YYYY-MM` immediately after the given one. */
export function nextMonthYear(monthYear: MonthYear): MonthYear {
  const [year, month] = monthYear.split("-").map(Number) as [number, number];
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** "September 2026" for a `YYYY-MM`. */
export function formatMonthYear(monthYear: MonthYear): string {
  const [year, month] = monthYear.split("-").map(Number) as [number, number];
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
