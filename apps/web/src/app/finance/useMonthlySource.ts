"use client";

import type { MonthYear } from "@myos/shared";
import { useCallback, useEffect, useState } from "react";

type Loaded<T> = { monthYear: MonthYear; data: T | null; error: string | null };

/**
 * The result is keyed by the month it was fetched for, so "loading" is simply
 * "the loaded month is not the selected month" — no state writes are needed
 * when the selection changes, only when a fetch settles.
 */
export default function useMonthlySource<T>(monthYear: MonthYear, fetcher: (monthYear: MonthYear) => Promise<T>) {
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);

  useEffect(() => {
    let ignore = false;

    fetcher(monthYear)
      .then((data) => ({ data, error: null }))
      .catch((err: Error) => ({ data: null, error: err.message }))
      .then((result) => {
        if (!ignore) setLoaded({ monthYear, ...result });
      });

    return () => {
      ignore = true;
    };
  }, [monthYear, fetcher]);

  const update = useCallback(
    (updater: (data: T) => T) =>
      setLoaded((prev) => (prev?.data == null ? prev : { ...prev, data: updater(prev.data) })),
    [],
  );

  const current = loaded?.monthYear === monthYear ? loaded : null;

  return { data: current?.data ?? null, loading: current === null, error: current?.error ?? null, update };
}
