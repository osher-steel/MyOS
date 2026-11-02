"use client";

import {
  BUSINESS_CATEGORIES,
  burnVsBudget,
  convertToDate,
  formatMonthYear,
  GoalAllocationReason,
  LineEntryStatus,
  monthBurn,
  PlaidTransactionStatus,
  toMonthYear,
  type Goal,
  type GoalAllocation,
  type LineEntryView,
} from "@myos/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Section } from "@/components/editorial";
import { money } from "@/lib/format";
import { FIXED_GROUPS, isFixedLabel, MonthNav, Stat } from "./common";
import useBusinessMonth, { type Filing } from "./useBusinessMonth";

const NO_ALLOCATION = "";

const NEW_LINE = "__new__";

function CategoryPicker({
  entry,
  lines,
  others,
  onFile,
}: {
  entry: LineEntryView;
  lines: string[]; // this month's budget version
  others: string[]; // other burn labels: past versions and ones already used
  onFile: (filing: Filing) => void;
}) {
  const value = entry.label ?? "";
  const listed = new Set([...lines, ...others]);
  const unlisted = entry.label && !listed.has(entry.label) && !isFixedLabel(entry.label);
  return (
    <select
      aria-label={`Category for ${entry.name}`}
      value={value}
      onChange={(event) => {
        if (event.target.value !== NEW_LINE) return onFile({ label: event.target.value });
        const name = window.prompt("New category name")?.trim();
        if (name) onFile({ label: name.slice(0, 64) });
      }}
      className={`entry-meta max-w-[12rem] bg-transparent border-b outline-none ${value ? "border-rule" : "border-accent/50 text-accent"}`}
    >
      <option value="" disabled>
        category…
      </option>
      {lines.length > 0 ? (
        <optgroup label="monthly burn">
          {lines.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {others.length > 0 || unlisted ? (
        <optgroup label={lines.length > 0 ? "not in this month's budget" : "monthly burn (no budget this month)"}>
          {others.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          {unlisted ? <option value={entry.label}>{entry.label}</option> : null}
        </optgroup>
      ) : null}
      <option value={NEW_LINE}>+ new category…</option>
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

function AllocationPicker({
  entry,
  pools,
  goalName,
  onFile,
}: {
  entry: LineEntryView;
  pools: Goal[];
  goalName: Map<string, string>;
  onFile: (filing: Filing) => void;
}) {
  if (pools.length === 0 && !entry.goalId) return null;
  const closed = entry.goalId && !pools.some((goal) => goal.id === entry.goalId);
  return (
    <select
      aria-label={`Allocation for ${entry.name}`}
      value={entry.goalId ?? NO_ALLOCATION}
      onChange={(event) => onFile({ goalId: event.target.value || null })}
      className={`entry-meta max-w-[12rem] bg-transparent border-b outline-none ${entry.goalId ? "border-ink text-ink" : "border-rule text-muted"}`}
    >
      <option value={NO_ALLOCATION}>monthly budget</option>
      {pools.map((goal) => (
        <option key={goal.id} value={goal.id}>
          ↳ {goal.name}
        </option>
      ))}
      {closed ? <option value={entry.goalId}>↳ {goalName.get(entry.goalId!) ?? "closed allocation"}</option> : null}
    </select>
  );
}

type Filter = { kind: "label"; name: string } | { kind: "pool"; goalId: string } | { kind: "uncategorized" } | null;

const filterKey = (filter: Filter) =>
  !filter ? "" : filter.kind === "label" ? `label:${filter.name}` : filter.kind === "pool" ? `pool:${filter.goalId}` : "uncategorized";
const parseFilter = (key: string): Filter =>
  !key
    ? null
    : key === "uncategorized"
      ? { kind: "uncategorized" }
      : key.startsWith("pool:")
        ? { kind: "pool", goalId: key.slice(5) }
        : { kind: "label", name: key.slice(6) };
const matches = (entry: LineEntryView, filter: Filter) =>
  !filter ||
  (filter.kind === "uncategorized" ? !entry.label : filter.kind === "pool" ? entry.goalId === filter.goalId : entry.label === filter.name);

const inMonth = (allocation: GoalAllocation, month: string) => toMonthYear(convertToDate(allocation.createdAt)) === month;

export default function BusinessHome() {
  const current = toMonthYear();
  const [month, setMonth] = useState(current);
  const [filter, setFilter] = useState<Filter>(null);
  const { entries, budget, goals, allocations, knownLines, activeGoals, error, setError, file } = useBusinessMonth(month);

  const burn = useMemo(() => (entries ? monthBurn(entries, month) : null), [entries, month]);
  const lines = useMemo(() => Object.keys(budget?.needs ?? {}), [budget]);
  const otherLines = useMemo(() => {
    const used = (entries ?? []).flatMap((entry) => (entry.label && !isFixedLabel(entry.label) ? [entry.label] : []));
    return [...new Set([...knownLines, ...used])].filter((name) => !lines.includes(name)).sort((a, b) => a.localeCompare(b));
  }, [knownLines, entries, lines]);
  const plan = useMemo(() => (burn && budget !== undefined ? burnVsBudget(budget?.needs ?? {}, burn) : null), [burn, budget]);
  const goalName = useMemo(() => new Map(goals.map((goal) => [goal.id, goal.name])), [goals]);

  // Each allocation's month: what it paid for and what was added to it
  const allocationMonth = useMemo(() => {
    const spent = new Map((burn?.pools ?? []).map((pool) => [pool.goalId, pool]));
    const toppedUp = new Map<string, number>();
    for (const allocation of allocations) {
      if (allocation.reason === GoalAllocationReason.ASSIGNMENT && inMonth(allocation, month)) {
        toppedUp.set(allocation.goalId, (toppedUp.get(allocation.goalId) ?? 0) + allocation.amount);
      }
    }
    return goals
      .filter((goal) => spent.has(goal.id) || toppedUp.has(goal.id))
      .map((goal) => ({ goal, spend: spent.get(goal.id), toppedUp: toppedUp.get(goal.id) ?? 0 }));
  }, [burn, allocations, goals, month]);
  const fromAllocations = (burn?.pools ?? []).reduce((sum, pool) => sum + pool.amount, 0);

  const counted = useMemo(
    () =>
      (entries ?? []).filter(
        (entry) => entry.osStatus !== LineEntryStatus.EXCLUDED && entry.plaidStatus !== PlaidTransactionStatus.REMOVED,
      ),
    [entries],
  );
  const rows = useMemo(
    () =>
      counted
        .filter((entry) => matches(entry, filter))
        .sort((a, b) => Number(Boolean(a.label)) - Number(Boolean(b.label)) || b.date.localeCompare(a.date)),
    [counted, filter],
  );
  // Filter choices with how many transactions each holds and what they add up to
  const groups = useMemo(() => {
    const tally = new Map<string, { count: number; amount: number }>();
    const add = (key: string, entry: LineEntryView) => {
      const row = tally.get(key) ?? { count: 0, amount: 0 };
      row.count += 1;
      row.amount += entry.amount;
      tally.set(key, row);
    };
    for (const entry of counted) {
      add(entry.label ? `label:${entry.label}` : "uncategorized", entry);
      if (entry.goalId) add(`pool:${entry.goalId}`, entry);
    }
    return tally;
  }, [counted]);
  const shown = rows.reduce((sum, entry) => sum + entry.amount, 0);
  const uncategorized = groups.get("uncategorized")?.count ?? 0;
  const pick = (next: Filter) => setFilter((current) => (filterKey(current) === filterKey(next) ? null : next));
  const signed = (amount: number) => (amount < 0 ? `+${money(-amount, { cents: true })}` : money(amount, { cents: true }));

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <MonthNav
          month={month}
          max={current}
          onChange={(next) => {
            setError(null);
            setFilter(null);
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
                      <tr
                        key={line.name}
                        onClick={() => pick({ kind: "label", name: line.name })}
                        className={`cursor-pointer border-t border-rule hover:bg-rule/30 ${filterKey(filter) === `label:${line.name}` ? "bg-rule/40" : ""}`}
                      >
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
              <p className="entry-meta pt-2">Spending paid from an allocation isn&apos;t counted here.</p>
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
                {allocationMonth.length === 0 ? (
                  <p className="entry-meta py-3">No allocation was spent from or topped up this month.</p>
                ) : (
                  <ul>
                    {allocationMonth.map(({ goal, spend, toppedUp }) => (
                      <li key={goal.id} className="border-b border-rule py-3">
                        <div className="flex items-baseline justify-between gap-4">
                          <button
                            type="button"
                            className="text-left hover:text-accent"
                            onClick={() => pick({ kind: "pool", goalId: goal.id })}
                          >
                            {goal.name}
                          </button>
                          <span className="entry-meta">{money(goal.amountSaved)} left now</span>
                        </div>
                        {toppedUp ? (
                          <div className="entry-meta flex justify-between gap-4 pt-1">
                            <span>{toppedUp > 0 ? "Topped up" : "Reduced"}</span>
                            <span className="figure">
                              {toppedUp > 0 ? "+" : "−"}
                              {money(Math.abs(toppedUp))}
                            </span>
                          </div>
                        ) : null}
                        {spend ? (
                          <>
                            <div className="entry-meta flex justify-between gap-4 pt-1">
                              <span>Spent · {spend.count}</span>
                              <span className="figure">{money(spend.amount)}</span>
                            </div>
                            <ul className="pl-3">
                              {spend.lines.map((line) => (
                                <li key={line.name} className="entry-meta flex justify-between gap-4">
                                  <span>
                                    {line.name} · {line.count}
                                  </span>
                                  <span>{money(line.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section label="Revenue">
                {burn.revenues.length === 0 ? (
                  <p className="entry-meta py-3">Nothing yet.</p>
                ) : (
                  <ul>
                    {burn.revenues.map((row) => (
                      <li key={row.name} className="border-b border-rule py-2">
                        <button
                          type="button"
                          className="flex w-full items-baseline justify-between gap-4 text-left hover:text-accent"
                          onClick={() => pick({ kind: "label", name: row.name })}
                        >
                          <span>
                            {row.name} <span className="entry-meta">· {row.count}</span>
                          </span>
                          <span className="figure">{money(row.amount)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          </div>

          <Section label="Transactions">
            <p className="entry-meta pb-2">
              Pick what each transaction was, then which allocation paid for it if it didn&apos;t come out of the monthly budget.
            </p>
            <div className="flex flex-wrap items-baseline justify-between gap-4 pb-2">
              <label className="entry-meta flex items-baseline gap-2">
                Show
                <select
                  aria-label="Filter transactions"
                  value={filterKey(filter)}
                  onChange={(event) => setFilter(parseFilter(event.target.value))}
                  className="entry-meta bg-transparent border-b border-rule outline-none"
                >
                  <option value="">all ({counted.length})</option>
                  {uncategorized ? <option value="uncategorized">uncategorized ({uncategorized})</option> : null}
                  <optgroup label="categories">
                    {[...groups]
                      .filter(([key]) => key.startsWith("label:"))
                      .sort((a, b) => Math.abs(b[1].amount) - Math.abs(a[1].amount))
                      .map(([key, row]) => (
                        <option key={key} value={key}>
                          {key.slice(6)} ({row.count} · {signed(row.amount)})
                        </option>
                      ))}
                  </optgroup>
                  {[...groups].some(([key]) => key.startsWith("pool:")) ? (
                    <optgroup label="allocations">
                      {[...groups]
                        .filter(([key]) => key.startsWith("pool:"))
                        .map(([key, row]) => (
                          <option key={key} value={key}>
                            {goalName.get(key.slice(5)) ?? "Allocation"} ({row.count} · {signed(row.amount)})
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              {filter ? (
                <span className="entry-meta flex items-baseline gap-3">
                  {rows.length} {rows.length === 1 ? "transaction" : "transactions"} · <span className="figure">{signed(shown)}</span>
                  <button type="button" className="hover:text-accent" onClick={() => setFilter(null)}>
                    clear
                  </button>
                </span>
              ) : null}
            </div>
            <ul>
              {rows.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-2">
                  <span className="min-w-0 flex-1">
                    {entry.name} <span className="entry-meta">· {entry.date}</span>
                  </span>
                  <span className="figure">{signed(entry.amount)}</span>
                  <CategoryPicker entry={entry} lines={lines} others={otherLines} onFile={(filing) => void file(entry, filing)} />
                  <AllocationPicker entry={entry} pools={activeGoals} goalName={goalName} onFile={(filing) => void file(entry, filing)} />
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
