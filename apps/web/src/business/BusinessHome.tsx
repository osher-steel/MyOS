"use client";

import {
  BUSINESS_CATEGORIES,
  burnVsBudget,
  formatMonthYear,
  LineEntryStatus,
  monthBurn,
  PlaidTransactionStatus,
  toMonthYear,
  type Goal,
  type LineEntryView,
} from "@myos/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Section } from "@/components/editorial";
import { money } from "@/lib/format";
import { FIXED_GROUPS, MonthNav, Stat } from "./common";
import useBusinessMonth, { POOL } from "./useBusinessMonth";

function FilePicker({
  entry,
  lines,
  pools,
  goalName,
  onFile,
}: {
  entry: LineEntryView;
  lines: string[];
  pools: Goal[];
  goalName: Map<string, string>;
  onFile: (entry: LineEntryView, choice: string) => void;
}) {
  const value = entry.goalId ? `${POOL}${entry.goalId}` : (entry.label ?? "");
  const offBudget = entry.label && !lines.includes(entry.label) && !BUSINESS_CATEGORIES.some(({ name }) => name === entry.label);
  const closedPool = entry.goalId && !pools.some((goal) => goal.id === entry.goalId);
  return (
    <select
      aria-label={`Budget line or allocation for ${entry.name}`}
      value={value}
      onChange={(event) => onFile(entry, event.target.value)}
      className={`entry-meta max-w-[14rem] bg-transparent border-b outline-none ${value ? "border-rule" : "border-accent/50 text-accent"}`}
    >
      <option value="" disabled>
        file under…
      </option>
      <optgroup label="monthly burn">
        {lines.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {offBudget ? <option value={entry.label}>{entry.label} (not in budget)</option> : null}
      </optgroup>
      {pools.length > 0 || closedPool ? (
        <optgroup label="allocations">
          {pools.map((goal) => (
            <option key={goal.id} value={`${POOL}${goal.id}`}>
              {goal.name}
            </option>
          ))}
          {closedPool ? <option value={value}>{goalName.get(entry.goalId!) ?? "closed allocation"}</option> : null}
        </optgroup>
      ) : null}
      {FIXED_GROUPS.map(([flow, label]) => (
        <optgroup key={flow} label={label}>
          {BUSINESS_CATEGORIES.filter((category) => category.flow === flow).map(({ name }) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function BusinessHome() {
  const current = toMonthYear();
  const [month, setMonth] = useState(current);
  const [onlyUnfiled, setOnlyUnfiled] = useState(false);
  const { entries, budget, goals, activeGoals, error, setError, file } = useBusinessMonth(month);

  const burn = useMemo(() => (entries ? monthBurn(entries, month) : null), [entries, month]);
  const lines = useMemo(() => Object.keys(budget?.needs ?? {}), [budget]);
  const plan = useMemo(() => (burn && budget !== undefined ? burnVsBudget(budget?.needs ?? {}, burn) : null), [burn, budget]);
  const goalName = useMemo(() => new Map(goals.map((goal) => [goal.id, goal.name])), [goals]);
  const fromAllocations = (burn?.pools ?? []).reduce((sum, pool) => sum + pool.amount, 0);

  const rows = useMemo(
    () =>
      (entries ?? [])
        .filter((entry) => entry.osStatus !== LineEntryStatus.EXCLUDED && entry.plaidStatus !== PlaidTransactionStatus.REMOVED)
        .filter((entry) => !onlyUnfiled || !(entry.goalId || entry.label))
        .sort((a, b) => Number(Boolean(a.goalId || a.label)) - Number(Boolean(b.goalId || b.label)) || b.date.localeCompare(a.date)),
    [entries, onlyUnfiled],
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <MonthNav
          month={month}
          max={current}
          onChange={(next) => {
            setError(null);
            setMonth(next);
          }}
        />
        {budget === undefined ? null : budget ? (
          <span className="entry-meta">
            Budget version from {formatMonthYear(budget.carriedFrom ?? month)} ·{" "}
            <Link href="/burn" className="hover:text-accent">
              edit in Monthly Burn
            </Link>
          </span>
        ) : (
          <Link href="/burn" className="entry-meta text-accent">
            No budget for this month yet. Set one in Monthly Burn →
          </Link>
        )}
      </div>

      {error ? <p className="text-accent">{error}</p> : null}
      {!burn || !plan ? (
        <p className="entry-meta">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Budget" value={money(plan.budgeted)} />
            <Stat label="Spent from budget" value={money(burn.grossBurn)} />
            <Stat label={plan.left < 0 ? "Over budget" : "Left"} value={money(Math.abs(plan.left))} over={plan.left < 0} />
            <Stat label="From allocations" value={money(fromAllocations)} />
            <Stat label="Revenue" value={money(burn.revenue)} />
            <Stat label="Net burn" value={money(burn.netBurn)} note="spent from budget − revenue" />
          </div>
          {burn.unclassified.length > 0 ? (
            <p className="entry-meta">
              {burn.unclassified.length} {burn.unclassified.length === 1 ? "transaction isn't" : "transactions aren't"} filed yet, so
              {burn.unclassified.length === 1 ? " it's" : " they're"} in none of these figures.
            </p>
          ) : null}

          <div className="grid gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Section label="Budget vs spent">
              {plan.lines.length === 0 ? (
                <p className="entry-meta py-3">No budget or spending yet.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="entry-meta text-left">
                      <th className="py-2 font-normal">line</th>
                      <th className="py-2 text-right font-normal">budget</th>
                      <th className="py-2 text-right font-normal">spent</th>
                      <th className="py-2 text-right font-normal">left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.lines.map((line) => (
                      <tr key={line.name} className="border-t border-rule">
                        <td className="py-2">
                          {line.name}
                          {line.name in (budget?.needs ?? {}) ? null : <span className="entry-meta"> · not in budget</span>}
                        </td>
                        <td className="figure py-2 text-right">{line.budgeted ? money(line.budgeted) : "—"}</td>
                        <td className="figure py-2 text-right">{money(line.actual)}</td>
                        <td className={`figure py-2 text-right ${line.left < 0 ? "text-accent" : ""}`}>
                          {line.left < 0 ? `over ${money(-line.left)}` : money(line.left)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <div className="space-y-10">
              <Section
                label="Allocations this month"
                aside={
                  <Link href="/allocations" className="entry-meta hover:text-accent">
                    all allocations →
                  </Link>
                }
              >
                {burn.pools.length === 0 ? (
                  <p className="entry-meta py-3">Nothing spent from allocations this month.</p>
                ) : (
                  <ul>
                    {burn.pools.map((pool) => {
                      const goal = goals.find((g) => g.id === pool.name);
                      return (
                        <li key={pool.name} className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
                          <span>
                            {goal?.name ?? "Allocation"} <span className="entry-meta">· {pool.count}</span>
                          </span>
                          <span className="figure">
                            {money(pool.amount)}
                            {goal ? <span className="entry-meta"> · {money(goal.amountSaved)} left</span> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
              <Section label="Revenue">
                {burn.revenues.length === 0 ? (
                  <p className="entry-meta py-3">Nothing yet.</p>
                ) : (
                  <ul>
                    {burn.revenues.map((row) => (
                      <li key={row.name} className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
                        <span>
                          {row.name} <span className="entry-meta">· {row.count}</span>
                        </span>
                        <span className="figure">{money(row.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>

          <Section label="Transactions">
            <label className="entry-meta flex items-center gap-2 pb-2">
              <input type="checkbox" checked={onlyUnfiled} onChange={(event) => setOnlyUnfiled(event.target.checked)} />
              only unfiled ({burn.unclassified.length})
            </label>
            <ul>
              {rows.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-2">
                  <span className="min-w-0 flex-1">
                    {entry.name} <span className="entry-meta">· {entry.date}</span>
                  </span>
                  <span className="figure">
                    {entry.amount < 0 ? `+${money(-entry.amount, { cents: true })}` : money(entry.amount, { cents: true })}
                  </span>
                  <FilePicker
                    entry={entry}
                    lines={lines}
                    pools={activeGoals}
                    goalName={goalName}
                    onFile={(row, choice) => void file(row, choice)}
                  />
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
