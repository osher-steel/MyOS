"use client";

import {
  GoalStatus,
  LabelSource,
  osStatusOf,
  type EffectiveBudget,
  type Goal,
  type GoalAllocation,
  type LineEntry,
  type LineEntryView,
} from "@myos/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBudget, fetchBudgets } from "@/lib/budgetsClient";
import { fetchAllocations, fetchGoals } from "@/lib/goalsClient";
import { unwrap } from "@/lib/proxyClient";
import { message } from "./common";

/** A business transaction's label says what it was; its goalId says which allocation paid for it. */
export type Filing = { label: string } | { goalId: string | null };

/** One month of a business book: its transactions, the budget version it runs on, and the allocations. */
export default function useBusinessMonth(month: string) {
  const [loaded, setLoaded] = useState<{ month: string; entries: LineEntryView[] } | null>(null);
  const [budget, setBudget] = useState<{ month: string; budget: EffectiveBudget | null } | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [allocations, setAllocations] = useState<GoalAllocation[]>([]);
  const [knownLines, setKnownLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/transactions/${month}`)
      .then((res) => unwrap<LineEntryView[]>(res))
      .then((entries) => live && setLoaded({ month, entries }))
      .catch((cause: unknown) => live && setError(message(cause)));
    fetchBudget(month)
      .then((version) => live && setBudget({ month, budget: version }))
      .catch((cause: unknown) => live && setError(message(cause)));
    return () => {
      live = false;
    };
  }, [month]);

  // Lines from every budget version, newest first, so a month without its own budget can still be filed
  useEffect(() => {
    fetchBudgets()
      .then((versions) =>
        setKnownLines([
          ...new Set([...versions].sort((a, b) => b.id.localeCompare(a.id)).flatMap((version) => Object.keys(version.needs))),
        ]),
      )
      .catch(() => setKnownLines([]));
  }, []);

  const loadAllocations = useCallback(() => {
    Promise.all([fetchGoals(), fetchAllocations()])
      .then(([loadedGoals, loadedAllocations]) => {
        setGoals(loadedGoals);
        setAllocations(loadedAllocations);
      })
      .catch((cause: unknown) => setError(message(cause)));
  }, []);
  useEffect(loadAllocations, [loadAllocations]);

  // Shows at once and saves in the background; a failed save puts the old filing back
  const latestEdit = useRef(new Map<string, number>());
  const file = useCallback(
    async (entry: LineEntryView, filing: Filing) => {
      setError(null);
      const seq = (latestEdit.current.get(entry.id) ?? 0) + 1;
      latestEdit.current.set(entry.id, seq);
      const previous = { label: entry.label, goalId: entry.goalId, osStatus: entry.osStatus, labelSource: entry.labelSource };
      const next =
        "label" in filing
          ? { label: filing.label, goalId: entry.goalId, labelSource: LabelSource.MANUAL }
          : { label: entry.label, goalId: filing.goalId ?? undefined, labelSource: entry.labelSource };
      const set = (fields: Partial<LineEntryView>) =>
        setLoaded(
          (state) => state && { ...state, entries: state.entries.map((row) => (row.id === entry.id ? { ...row, ...fields } : row)) },
        );
      set({ ...next, osStatus: osStatusOf(next.label, next.goalId) });
      try {
        const saved = await unwrap<LineEntry>(
          await fetch(`/api/transactions/${entry.monthYear}/${entry.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(filing),
          }),
        );
        if (latestEdit.current.get(entry.id) !== seq) return;
        set({ osStatus: saved.osStatus, goalId: saved.goalId, label: saved.label });
        if (next.goalId || previous.goalId) loadAllocations();
      } catch (cause) {
        if (latestEdit.current.get(entry.id) !== seq) return;
        set(previous);
        setError(`Couldn't save ${entry.name}: ${message(cause)}`);
      }
    },
    [loadAllocations],
  );

  return {
    entries: loaded?.month === month ? loaded.entries : null,
    budget: budget?.month === month ? budget.budget : undefined, // undefined while loading, null when there is none
    goals,
    allocations,
    knownLines,
    activeGoals: useMemo(() => goals.filter((goal) => goal.status === GoalStatus.ACTIVE), [goals]),
    error,
    setError,
    file,
  };
}
