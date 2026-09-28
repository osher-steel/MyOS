"use client";

import { convertToDate, GoalStatus, type Goal, type GoalAllocation, type SavingsSummary } from "@myos/shared";
import { useCallback, useEffect, useState } from "react";
import { fetchAllocations, fetchGoals, fetchSavings } from "@/lib/goalsClient";
import { ProxyClientError } from "@/lib/proxyClient";

export function errorMessage(err: unknown): string {
  if (err instanceof ProxyClientError && err.formErrors.length > 0) return err.formErrors.join(" ");
  return (err as Error).message;
}

export const timeOf = (value: Goal["createdAt"]) => convertToDate(value).getTime();

export type GoalsData = {
  goals: Goal[] | null;
  active: Goal[];
  completed: Goal[];
  allocations: GoalAllocation[];
  savings: SavingsSummary | null;
  error: string | null;
  act: (change: () => Promise<unknown>) => Promise<string | null>;
};

export function useGoals(): GoalsData {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [allocations, setAllocations] = useState<GoalAllocation[]>([]);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let ignore = false;
    Promise.all([fetchGoals(), fetchAllocations(), fetchSavings()])
      .then(([loadedGoals, loadedAllocations, loadedSavings]) => {
        if (ignore) return;
        setGoals([...loadedGoals].sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt)));
        setAllocations(loadedAllocations);
        setSavings(loadedSavings);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ignore) setError(errorMessage(err));
      });
    return () => {
      ignore = true;
    };
  }, [version]);

  const act = useCallback(async (change: () => Promise<unknown>) => {
    try {
      await change();
      setVersion((v) => v + 1);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }, []);

  const all = goals ?? [];
  return {
    goals,
    active: all.filter((goal) => goal.status === GoalStatus.ACTIVE),
    completed: all
      .filter((goal) => goal.status === GoalStatus.COMPLETED)
      .sort((a, b) => timeOf(b.completedAt ?? b.updatedAt) - timeOf(a.completedAt ?? a.updatedAt)),
    allocations,
    savings,
    error,
    act,
  };
}
