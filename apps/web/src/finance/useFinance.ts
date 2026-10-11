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
  GoalStatus,
  type Goal,
  type SavingsSummary,
} from "@myos/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchBudget } from "@/lib/budgetsClient";
import { fetchGoals, fetchSavings } from "@/lib/goalsClient";
import { fetchPastReports, regenerateReport } from "@/lib/reportsClient";
import { fetchLineEntries, patchLineEntry, syncTransactions, type LineEntryEdit } from "@/lib/transactionsClient";
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
  const isOpen = monthYear >= toMonthYear();
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
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [reportsVersion, setReportsVersion] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

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
  }, [historyMonths, sync.version, reportsVersion]);

  useEffect(() => {
    let ignore = false;
    Promise.all([fetchSavings(), fetchGoals()])
      .then(([summary, loadedGoals]) => {
        if (ignore) return;
        setSavings(summary);
        setGoals(loadedGoals.filter((goal) => goal.status === GoalStatus.ACTIVE));
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [sync.version, reportsVersion]);

  const regenerate = useCallback(async () => {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      await regenerateReport(monthYear);
      setReportsVersion((v) => v + 1);
    } catch (err) {
      setRegenerateError((err as Error).message);
    } finally {
      setRegenerating(false);
    }
  }, [monthYear]);

  const groups = useMemo(() => groupLineEntries(stored.data ?? []), [stored.data]);
  const totals = useMemo(() => totalLineEntries(groups), [groups]);
  const report = useMemo(
    () => monthReport(monthYear, budget.data, groups.all, { projected: isCurrent }),
    [monthYear, budget.data, groups, isCurrent],
  );
  const usage = useMemo(() => {
    if (!budget.data) return null;
    const entry = isOpen ? Math.max(report.entry, budget.data.income) : report.entry;
    return budgetUsage(budget.data, totals.usedByLabel, { unlabelledSpent: totals.spentUnlabelled, entry });
  }, [budget.data, totals, report.entry, isOpen]);

  const updateStored = stored.update;
  const saveEntry = useCallback(
    async (entry: LineEntryView, patch: LineEntryEdit) => {
      setSaveError(null);
      try {
        const saved = await patchLineEntry(entry, patch);
        updateStored((rows) => [
          ...rows.filter((row) => row.id !== saved.id),
          ...(saved.monthYear === entry.monthYear ? [saved] : []),
        ]);
      } catch (err) {
        setSaveError((err as Error).message);
      }
    },
    [updateStored],
  );
  const labelEntry = useCallback((entry: LineEntryView, label: string) => saveEntry(entry, { label }), [saveEntry]);
  const tagEntry = useCallback((entry: LineEntryView, tags: string[]) => saveEntry(entry, { tags }), [saveEntry]);
  const bookEntry = useCallback(
    (entry: LineEntryView, bookedMonth: MonthYear | null) => saveEntry(entry, { bookedMonth }),
    [saveEntry],
  );

  const history = useMemo(() => {
    if (!past) return null;
    return isCurrent ? past.reports.map((r) => (r.monthYear === monthYear ? report : r)) : past.reports;
  }, [past, isCurrent, monthYear, report]);

  return {
    monthYear,
    setMonthYear,
    sync,
    budget: { usage, projected: isOpen, loading: budget.loading, error: budget.error },
    transactions: {
      groups,
      totals,
      budget: budget.data,
      labelEntry,
      tagEntry,
      bookEntry,
      loading: stored.loading,
      sync,
      errors: { api: stored.error, sync: sync.error, save: saveError },
    },
    report: {
      report,
      inProgress: isCurrent,
      regenerate,
      regenerating,
      regenerateError,
      goals,
      onAssigned: () => setReportsVersion((v) => v + 1),
      savingsRemaining: savings?.months.find((month) => month.monthYear === monthYear)?.remaining ?? null,
      loading: budget.loading || stored.loading,
    },
    history: { reports: history, loading: past === null, error: past?.error ?? null },
  };
}
