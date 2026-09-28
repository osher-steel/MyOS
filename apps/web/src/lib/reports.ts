import "server-only";
import {
  budgetId,
  monthReport,
  RequestBuilder,
  toMonthYear,
  toQueryString,
  type Budget,
  type LineEntry,
  type MonthReport,
  type MonthYear,
  type StoredMonthReport,
} from "@myos/shared";
import { ApiError, apiFetch } from "./api";
import { env } from "./env";

async function loadBudget(monthYear: MonthYear): Promise<Budget | null> {
  try {
    return await apiFetch<Budget>(`/budgets/${budgetId(env("MYOS_OWNER_UID"), monthYear)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function loadLedger(monthYear: MonthYear): Promise<LineEntry[]> {
  const query = toQueryString(new RequestBuilder().eq("monthYear", monthYear).limit(1000).toQuery());
  return apiFetch<LineEntry[]>(`/line-entries?${query}`);
}

async function computeMonthReport(monthYear: MonthYear): Promise<MonthReport> {
  const [budget, ledger] = await Promise.all([loadBudget(monthYear), loadLedger(monthYear)]);
  return monthReport(monthYear, budget, ledger);
}

async function loadStoredReports(monthYears: MonthYear[]): Promise<Map<MonthYear, MonthReport>> {
  if (monthYears.length === 0) return new Map();
  const query = toQueryString(new RequestBuilder().in("monthYear", monthYears).limit(monthYears.length).toQuery());
  const stored = await apiFetch<StoredMonthReport[]>(`/month-reports?${query}`);
  return new Map(stored.map((report) => [report.monthYear, report]));
}

/** Finished months come from their stored report; the open month, or one never stored, is computed. */
export async function loadMonthReports(monthYears: MonthYear[]): Promise<MonthReport[]> {
  const stored = await loadStoredReports(monthYears.filter((month) => month < toMonthYear()));
  return Promise.all(monthYears.map((month) => stored.get(month) ?? computeMonthReport(month)));
}
