"use client";

import { formatMonthYear, type Goal, type SavingsSummary } from "@myos/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchActiveGoals, fetchSavings } from "@/lib/goalsClient";
import { clock } from "@/lib/format";
import BudgetPanel from "./BudgetPanel";
import MonthFigures from "./MonthFigures";
import RecentMonthsChart from "./RecentMonthsChart";
import TransactionsPanel from "./TransactionsPanel";
import useFinance, { type SyncState } from "./useFinance";

function useSavingsOverview(refreshKey: number): { goals: Goal[]; savings: SavingsSummary | null } {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [savings, setSavings] = useState<SavingsSummary | null>(null);
  useEffect(() => {
    let ignore = false;
    fetchActiveGoals()
      .then((loaded) => {
        if (!ignore) setGoals(loaded);
      })
      .catch(() => {
        if (!ignore) setGoals([]);
      });
    fetchSavings()
      .then((loaded) => {
        if (!ignore) setSavings(loaded);
      })
      .catch(() => {
        if (!ignore) setSavings({ startMonth: null, opening: null, total: 0, inGoals: 0, unassigned: 0, months: [] });
      });
    return () => {
      ignore = true;
    };
  }, [refreshKey]);
  return { goals, savings };
}

function Footer({ sync }: { sync: SyncState }) {
  const banks = sync.institutions.length > 0 ? ` · ${sync.institutions.join(", ")}` : "";
  const synced = sync.syncing ? " · syncing…" : sync.syncedAt ? ` · last synced ${clock(sync.syncedAt.toISOString())}` : "";
  return (
    <footer className="mt-12 flex items-baseline justify-between gap-4 border-t border-rule pt-4">
      <span className="entry-meta">
        Plaid{banks}
        {synced}
      </span>
      <span className="font-display text-[15px]">Personal OS</span>
    </footer>
  );
}

export default function HomeView() {
  const { monthYear, sync, budget, transactions, history } = useFinance({ historyMonths: 5 });
  const { goals, savings } = useSavingsOverview(sync.version);

  return (
    <>
      <div className="flex flex-col gap-7">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-[length:var(--text-month)] leading-none">{formatMonthYear(monthYear)}</h2>
          <Link href={`/budget/${monthYear}`} className="entry-meta hover:text-accent">
            {budget.usage || budget.loading ? "edit budget" : "set up budget →"}
          </Link>
        </div>

        <MonthFigures
          usage={budget.usage}
          goals={goals}
          savings={savings}
          toLabel={{ count: transactions.groups.unlabelled.length, amount: transactions.totals.spentUnlabelled }}
          loading={{ budget: budget.loading, ledger: transactions.loading }}
        />

        <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-12 pt-3 md:grid-cols-[minmax(0,657fr)_minmax(0,459fr)]">
          <TransactionsPanel {...transactions} />
          <div className="flex flex-col gap-12">
            <BudgetPanel {...budget} />
            <RecentMonthsChart {...history} />
          </div>
        </div>
      </div>

      <Footer sync={sync} />
    </>
  );
}
