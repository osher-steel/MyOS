"use client";

import { formatMonthYear, nextMonthYear, previousMonthYear, toMonthYear, type MonthYear } from "@myos/shared";
import Link from "next/link";
import { Section } from "@/components/editorial";
import BudgetPanel from "./BudgetPanel";
import HistoryChart from "./HistoryChart";
import ReportPanel from "./ReportPanel";
import TransactionsPanel from "./TransactionsPanel";
import useFinance from "./useFinance";

function PlanAhead({ monthYear, hasBudget, loading }: { monthYear: string; hasBudget: boolean; loading: boolean }) {
  return (
    <Section label="Plan ahead" aside="not started">
      <div className="flex flex-col gap-3">
        <p className="entry-title">
          {loading
            ? "Loading…"
            : hasBudget
              ? `${formatMonthYear(monthYear)} is budgeted. It takes over on the 1st.`
              : `No budget for ${formatMonthYear(monthYear)} yet.`}
        </p>
        <p className="entry-meta">Set income and allocations now so the month starts with a plan. You can edit it until the month ends.</p>
        {loading ? null : (
          <Link href={`/budget/${monthYear}`} className="entry-meta text-ink hover:text-accent">
            {hasBudget ? "edit budget →" : "create budget →"}
          </Link>
        )}
      </div>
    </Section>
  );
}

export default function ReportsView({ initialMonth }: { initialMonth?: MonthYear }) {
  const { monthYear, setMonthYear, budget, transactions, report, history } = useFinance({ initialMonth });
  const current = toMonthYear();
  const isFuture = monthYear > current;
  const lastViewable = nextMonthYear(current);
  const hasBudget = budget.usage !== null;

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col items-start gap-3 border-b border-rule pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <h2 className="font-display text-[length:var(--text-month)] leading-none">
          {formatMonthYear(monthYear)}
          {isFuture ? <span className="entry-meta ml-3 align-middle uppercase tracking-[0.18em]">upcoming</span> : null}
        </h2>
        <div className="entry-meta flex gap-5 whitespace-nowrap">
          <button type="button" className="hover:text-accent" onClick={() => setMonthYear(previousMonthYear(monthYear))}>
            ← previous
          </button>
          <button
            type="button"
            className="hover:text-accent disabled:opacity-40"
            onClick={() => setMonthYear(nextMonthYear(monthYear))}
            disabled={monthYear >= lastViewable}
          >
            next →
          </button>
          {monthYear >= current ? (
            <Link href={`/budget/${monthYear}`} className="hover:text-accent">
              {hasBudget || budget.loading ? "edit budget" : "create budget"}
            </Link>
          ) : null}
        </div>
      </div>

      {isFuture ? (
        <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-12 pt-3 md:grid-cols-2">
          <PlanAhead monthYear={monthYear} hasBudget={hasBudget} loading={budget.loading} />
          <HistoryChart {...history} />
          {hasBudget ? <BudgetPanel {...budget} /> : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-12 pt-3 md:grid-cols-2">
          <ReportPanel monthYear={monthYear} {...report} />
          <HistoryChart {...history} />
          <TransactionsPanel {...transactions} />
          <BudgetPanel {...budget} />
        </div>
      )}
    </div>
  );
}
