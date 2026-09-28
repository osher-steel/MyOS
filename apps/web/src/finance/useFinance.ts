"use client";

import {
  budgetUsage,
  groupLineEntries,
  monthReport,
  toMonthYear,
  totalLineEntries,
  type LineEntry,
  type LineEntryView,
  type MonthReport,
  type MonthYear,
} from "@myos/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBudget } from "@/lib/budgetsClient";
import { fetchPastReports } from "@/lib/reportsClient";
import { fetchLineEntries, patchLineEntry, syncTransactions } from "@/lib/transactionsClient";
import useMonthlySource from "./useMonthlySource";

export type SyncState = {
  syncing: boolean;
  error: string | null;
  version: number;
  institutions: string[];
  syncedAt: Date | null;
  autoLabelled: number;
};

/**
 * The ledger renders straight away while a bank sync runs in the background;
 * if the sync changed anything, the ledger and history are fetched again.
 */
export default function useFinance({ historyMonths = 6, initialMonth }: { historyMonths?: number; initialMonth?: MonthYear } = {}) {
  const [monthYear, setMonthYear] = useState<MonthYear>(() => initialMonth ?? toMonthYear());
  const isCurrent = monthYear === toMonthYear();
  const [sync, setSync] = useState<SyncState>({
    syncing: true,
    error: null,
    version: 0,
    institutions: [],
    syncedAt: null,
    autoLabelled: 0,
  });
  const budget = useMonthlySource(monthYear, fetchBudget);
  const stored = useMonthlySource(monthYear, fetchLineEntries, sync.version);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [past, setPast] = useState<{ reports: MonthReport[]; error: string | null } | null>(null);

  useEffect(() => {
    let ignore = false;
    syncTransactions()
      .then(({ items, reports }) => {
        if (ignore) return;
        const changed = reports.length > 0 || items.some((item) => item.months.length > 0);
        setSync((prev) => ({
          syncing: false,
          error: null,
          version: changed ? prev.version + 1 : prev.version,
          institutions: items.map((item) => item.institution),
          syncedAt: new Date(),
          autoLabelled: items.reduce((sum, item) => sum + (item.autoLabelled ?? 0), 0),
        }));
      })
      .catch((err: Error) => {
        if (!ignore) setSync((prev) => ({ ...prev, syncing: false, error: err.message }));
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchPastReports(historyMonths)
      .then((reports) => ({ reports, error: null }))
      .catch((err: Error) => ({ reports: [], error: err.message }))
      .then((result) => {
        if (!ignore) setPast(result);
      });
    return () => {
      ignore = true;
    };
  }, [historyMonths, sync.version]);

  const groups = useMemo(() => groupLineEntries(stored.data ?? []), [stored.data]);
  const totals = useMemo(() => totalLineEntries(groups), [groups]);
  const report = useMemo(() => monthReport(monthYear, budget.data, groups.all), [monthYear, budget.data, groups]);
  const usage = useMemo(
    () => (budget.data ? budgetUsage(budget.data, totals.usedByLabel, { unlabelledSpent: totals.spentUnlabelled }) : null),
    [budget.data, totals],
  );

  const updateStored = stored.update;
  const saveEntry = useCallback(
    async (entry: LineEntryView, patch: Partial<Pick<LineEntry, "label" | "tags">>) => {
      setSaveError(null);
      try {
        const saved = await patchLineEntry(entry, patch);
        updateStored((rows) => [...rows.filter((row) => row.id !== saved.id), saved]);
      } catch (err) {
        setSaveError((err as Error).message);
      }
    },
    [updateStored],
  );
  const labelEntry = useCallback((entry: LineEntryView, label: string) => saveEntry(entry, { label }), [saveEntry]);
  const tagEntry = useCallback((entry: LineEntryView, tags: string[]) => saveEntry(entry, { tags }), [saveEntry]);

  const history = useMemo(() => {
    if (!past) return null;
    return isCurrent ? past.reports.map((r) => (r.monthYear === monthYear ? report : r)) : past.reports;
  }, [past, isCurrent, monthYear, report]);

  return {
    monthYear,
    setMonthYear,
    sync,
    budget: { usage, loading: budget.loading, error: budget.error },
    transactions: {
      groups,
      totals,
      budget: budget.data,
      labelEntry,
      tagEntry,
      loading: stored.loading,
      sync,
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
