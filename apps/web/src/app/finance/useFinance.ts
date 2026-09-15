"use client";

import { toMonthYear, type Budget, type MonthYear } from "@myos/shared";
import { useEffect, useState } from "react";
import { fetchBudget } from "@/lib/budgetsClient";

type Loaded = { monthYear: MonthYear; budget: Budget | null; error: string | null };

/**
 * One month's budget, fetched through the Next proxy so the API key never
 * reaches the browser. A missing month is `budget: null` with no error.
 *
 * The result is keyed by the month it was fetched for, so "loading" is simply
 * "the loaded month is not the selected month" — no state writes are needed
 * when the selection changes, only when a fetch settles.
 */
export default function useFinance() {
  const [monthYear, setMonthYear] = useState<MonthYear>(() => toMonthYear());
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let ignore = false;

    fetchBudget(monthYear)
      .then((budget) => ({ budget, error: null }))
      .catch((err: Error) => ({ budget: null, error: err.message }))
      .then((result) => {
        if (!ignore) setLoaded({ monthYear, ...result });
      });

    return () => {
      ignore = true;
    };
  }, [monthYear]);

  const current = loaded?.monthYear === monthYear ? loaded : null;

  return {
    monthYear,
    setMonthYear,
    budget: current?.budget ?? null,
    loading: current === null,
    error: current?.error ?? null,
  };
}
