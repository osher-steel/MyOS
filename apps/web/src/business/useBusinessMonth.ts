"use client";

import {
  GoalStatus,
  LabelSource,
  LineEntryStatus,
  type EffectiveBudget,
  type Goal,
  type LineEntry,
  type LineEntryView,
} from "@myos/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchBudget } from "@/lib/budgetsClient";
import { fetchGoals } from "@/lib/goalsClient";
import { unwrap } from "@/lib/proxyClient";
import { message } from "./common";

export const POOL = "pool:";

/** One month of a business book: its transactions, the budget version it runs on, and the allocation pools. */
export default function useBusinessMonth(month: string) {
  const [loaded, setLoaded] = useState<{ month: string; entries: LineEntryView[] } | null>(null);
  const [budget, setBudget] = useState<{ month: string; budget: EffectiveBudget | null } | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
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

  const loadGoals = useCallback(() => {
    fetchGoals()
      .then(setGoals)
      .catch((cause: unknown) => setError(message(cause)));
  }, []);
  useEffect(loadGoals, [loadGoals]);

  // Shows at once and saves in the background; a failed save puts the old choice back
  const latestEdit = useRef(new Map<string, number>());
  const file = useCallback(
    async (entry: LineEntryView, choice: string) => {
      setError(null);
      const seq = (latestEdit.current.get(entry.id) ?? 0) + 1;
      latestEdit.current.set(entry.id, seq);
      const goalId = choice.startsWith(POOL) ? choice.slice(POOL.length) : undefined;
      const patch = goalId ? { goalId } : { label: choice };
      const previous = { label: entry.label, goalId: entry.goalId, osStatus: entry.osStatus, labelSource: entry.labelSource };
      const set = (fields: Partial<LineEntryView>) =>
        setLoaded(
          (state) => state && { ...state, entries: state.entries.map((row) => (row.id === entry.id ? { ...row, ...fields } : row)) },
        );
      set({ label: goalId ? undefined : choice, goalId, osStatus: LineEntryStatus.LABELLED, labelSource: LabelSource.MANUAL });
      try {
        const saved = await unwrap<LineEntry>(
          await fetch(`/api/transactions/${entry.monthYear}/${entry.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }),
        );
        if (latestEdit.current.get(entry.id) !== seq) return;
        set({ osStatus: saved.osStatus });
        if (goalId || previous.goalId) loadGoals();
      } catch (cause) {
        if (latestEdit.current.get(entry.id) !== seq) return;
        set(previous);
        setError(`Couldn't save ${entry.name}: ${message(cause)}`);
      }
    },
    [loadGoals],
  );

  return {
    entries: loaded?.month === month ? loaded.entries : null,
    budget: budget?.month === month ? budget.budget : undefined, // undefined while loading, null when there is none
    goals,
    activeGoals: useMemo(() => goals.filter((goal) => goal.status === GoalStatus.ACTIVE), [goals]),
    error,
    setError,
    file,
  };
}
