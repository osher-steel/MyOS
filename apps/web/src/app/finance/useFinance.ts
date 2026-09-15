"use client";

import {
  groupLineEntries,
  mergeLineEntries,
  monthReport,
  toMonthYear,
  totalLineEntries,
  type LineEntryView,
  type MonthReport,
  type MonthYear,
  type PlaidTransaction,
} from "@myos/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBudget } from "@/lib/budgetsClient";
import { fetchPastReports } from "@/lib/reportsClient";
import { fetchLineEntries, fetchPlaidTransactions, saveLabel } from "@/lib/transactionsClient";
import useMonthlySource from "./useMonthlySource";

const HISTORY_MONTHS = 6;

const noLiveTransactions = async (): Promise<PlaidTransaction[]> => [];

/**
 * One month's budget, stored line entries and live Plaid transactions, each
 * fetched through the Next proxies in parallel and settling on its own, so a
 * slow or failed Plaid call never blanks the ledger the API already has.
 * Past months are the ledger's alone; only the open month asks Plaid.
 */
export default function useFinance() {
  const [monthYear, setMonthYear] = useState<MonthYear>(() => toMonthYear());
  const isCurrent = monthYear === toMonthYear();
  const budget = useMonthlySource(monthYear, fetchBudget);
  const stored = useMonthlySource(monthYear, fetchLineEntries);
  const live = useMonthlySource(monthYear, isCurrent ? fetchPlaidTransactions : noLiveTransactions);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [past, setPast] = useState<{ reports: MonthReport[]; error: string | null } | null>(null);

  useEffect(() => {
    let ignore = false;
    fetchPastReports(HISTORY_MONTHS)
      .then((reports) => ({ reports, error: null }))
      .catch((err: Error) => ({ reports: [], error: err.message }))
      .then((result) => {
        if (!ignore) setPast(result);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const groups = useMemo(
    () => groupLineEntries(mergeLineEntries(stored.data ?? [], live.data ?? [])),
    [stored.data, live.data],
  );
  const totals = useMemo(() => totalLineEntries(groups), [groups]);
  const report = useMemo(() => monthReport(monthYear, budget.data, groups.all), [monthYear, budget.data, groups]);

  const updateStored = stored.update;
  const labelEntry = useCallback(
    async (entry: LineEntryView, label: string) => {
      setSaveError(null);
      try {
        const saved = await saveLabel(entry, label);
        updateStored((rows) => [...rows.filter((row) => row.id !== saved.id), saved]);
      } catch (err) {
        setSaveError((err as Error).message);
      }
    },
    [updateStored],
  );

  const history = useMemo(() => {
    if (!past) return null;
    return isCurrent ? past.reports.map((r) => (r.monthYear === monthYear ? report : r)) : past.reports;
  }, [past, isCurrent, monthYear, report]);

  return {
    monthYear,
    setMonthYear,
    budget: {
      budget: budget.data,
      loading: budget.loading,
      error: budget.error,
      usedByLabel: totals.usedByLabel,
      unlabelledSpent: totals.spentUnlabelled,
    },
    transactions: {
      groups,
      totals,
      budget: budget.data,
      labelEntry,
      loading: stored.loading || live.loading,
      errors: { api: stored.error, plaid: live.error, save: saveError },
    },
    report: {
      report,
      inProgress: isCurrent,
      loading: budget.loading || stored.loading || live.loading,
    },
    history: { reports: history, loading: past === null, error: past?.error ?? null },
  };
}
