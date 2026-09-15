"use client";

import { BudgetGroup, formatMonthYear, nextMonthYear, previousMonthYear, toMonthYear } from "@myos/shared";
import Link from "next/link";
import { Entry, Section, SourceError } from "@/components/editorial";
import useFinance from "./useFinance";

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);

const GROUPS: Array<{ id: BudgetGroup; label: string }> = [
  { id: BudgetGroup.NEEDS, label: "Needs" },
  { id: BudgetGroup.WANTS, label: "Wants" },
  { id: BudgetGroup.SAVINGS, label: "Savings" },
];

export default function BudgetPanel() {
  const { monthYear, setMonthYear, budget, loading, error } = useFinance();
  const isCurrent = monthYear === toMonthYear();
  const editable = monthYear >= toMonthYear();
  const allocated = budget
    ? GROUPS.reduce((sum, { id }) => sum + Object.values(budget[id]).reduce((s, a) => s + a, 0), 0)
    : 0;

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="entry-title">{formatMonthYear(monthYear)}</h2>
        <div className="entry-meta flex gap-4">
          <button type="button" onClick={() => setMonthYear(previousMonthYear(monthYear))}>
            ← previous
          </button>
          <button type="button" onClick={() => setMonthYear(nextMonthYear(monthYear))} disabled={isCurrent}>
            next →
          </button>
          {editable ? (
            <Link href={`/finance/edit/${monthYear}`} className="entry-link">
              edit
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <SourceError message={error} />
      ) : loading ? (
        <p className="entry-meta">Loading…</p>
      ) : !budget ? (
        <p className="entry-meta">No budget for this month yet.</p>
      ) : (
        <>
          <Section label="Income" aside={`${money(budget.income - allocated)} unallocated`}>
            <Entry title="Expected" figure={money(budget.income)} />
            <Entry title="Allocated" figure={money(allocated)} />
          </Section>
          {GROUPS.map(({ id, label }) => {
          const allocations = Object.entries(budget[id]);
          const total = allocations.reduce((sum, [, amount]) => sum + amount, 0);
          return (
            <Section key={id} label={label} aside={money(total)}>
              {allocations.length === 0 ? (
                <p className="entry-meta">Nothing allocated.</p>
              ) : (
                allocations.map(([category, amount]) => (
                  <Entry key={category} title={category} figure={money(amount)} />
                ))
              )}
            </Section>
          );
          })}
        </>
      )}
    </div>
  );
}
