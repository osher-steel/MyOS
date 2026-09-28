"use client";

import {
  groupLineEntries,
  monthReport,
  toMonthYear,
  totalLineEntries,
  type LineEntryView,
  type MonthReport,
  type MonthYear,
} from "@myos/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBudget } from "@/lib/budgetsClient";
import { fetchPastReports } from "@/lib/reportsClient";
import { fetchLineEntries, saveLabel, syncTransactions } from "@/lib/transactionsClient";
import useMonthlySource from "./useMonthlySource";

const HISTORY_MONTHS = 6;

type SyncState = { syncing: boolean; error: string | null; version: number };

/**
 * The ledger renders straight away while a bank sync runs in the background;
 * if the sync changed anything, the ledger and history are fetched again.
 */
export default function useFinance() {
  const [monthYear, setMonthYear] = useState<MonthYear>(() => toMonthYear());
  const isCurrent = monthYear === toMonthYear();
  const [sync, setSync] = useState<SyncState>({ syncing: true, error: null, version: 0 });
  const budget = useMonthlySource(monthYear, fetchBudget);
  const stored = useMonthlySource(monthYear, fetchLineEntries, sync.version);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [past, setPast] = useState<{ reports: MonthReport[]; error: string | null } | null>(null);

  useEffect(() => {
    let ignore = false;
    syncTransactions()
      .then((items) => items.some((item) => item.created + item.updated + item.removed + item.deleted > 0))
      .then((changed) => ({ changed, error: null }))
      .catch((err: Error) => ({ changed: false, error: err.message }))
      .then(({ changed, error }) => {
        if (ignore) return;
        setSync((prev) => ({ syncing: false, error, version: changed ? prev.version + 1 : prev.version }));
      });
    return () => {
      ignore = true;
    };
  }, []);

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
  }, [sync.version]);

  const groups = useMemo(() => groupLineEntries(stored.data ?? []), [stored.data]);
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
      loading: stored.loading,
      syncing: sync.syncing,
      errors: { api: stored.error, sync: sync.error, save: saveError },
    },
    report: {
      report,
      inProgress: isCurrent,
      loading: budget.loading || stored.loading,
    },
    history: { reports: history, loading: past === null, error: past?.error ?? null },
  };
}
