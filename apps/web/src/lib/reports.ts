import "server-only";
import {
  budgetId,
  mergeLineEntries,
  monthReport,
  RequestBuilder,
  toMonthYear,
  toQueryString,
  type Budget,
  type LineEntry,
  type MonthReport,
  type MonthYear,
} from "@myos/shared";
import { ApiError, apiFetch } from "./api";
import { env } from "./env";
import { getTransactionsInMonth } from "./plaid";

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

/** Past months are the ledger's alone; only the open month is merged with live Plaid. */
export async function loadMonthReport(monthYear: MonthYear): Promise<MonthReport> {
  const [budget, ledger, live] = await Promise.all([
    loadBudget(monthYear),
    loadLedger(monthYear),
    monthYear === toMonthYear() ? getTransactionsInMonth(monthYear).catch(() => []) : Promise.resolve([]),
  ]);
  return monthReport(monthYear, budget, mergeLineEntries(ledger, live));
}
