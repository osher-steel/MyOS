import "server-only";
import {
  budgetId,
  monthReport,
  RequestBuilder,
  toQueryString,
  type Budget,
  type LineEntry,
  type MonthReport,
  type MonthYear,
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

export async function loadMonthReport(monthYear: MonthYear): Promise<MonthReport> {
  const [budget, ledger] = await Promise.all([loadBudget(monthYear), loadLedger(monthYear)]);
  return monthReport(monthYear, budget, ledger);
}
