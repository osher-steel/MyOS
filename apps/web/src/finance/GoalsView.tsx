"use client";

import { convertToDate, formatMonthYear, GoalAllocationReason, toMonthYear, type Goal, type GoalAllocation, type SavingsSummary } from "@myos/shared";
import { useState } from "react";
import { Entry, Section, SourceError } from "@/components/editorial";
import { createGoal, undoAllocation } from "@/lib/goalsClient";
import { centsFromInput, day, money } from "@/lib/format";
import GoalProgressChart, { goalColor } from "./GoalProgressChart";
import GoalRow, { amountInput, submit } from "./GoalRow";
import { Figure } from "./MonthFigures";
import { useGoals, type GoalsData } from "./useGoals";

const ALL_ACTIVE = "active";
const LEDGER_PREVIEW = 12;

const REASON_LABELS: Record<GoalAllocationReason, string> = {
  [GoalAllocationReason.ASSIGNMENT]: "Added",
  [GoalAllocationReason.TRANSFER]: "Moved",
  [GoalAllocationReason.GOAL_SPEND]: "Spent from goal",
  [GoalAllocationReason.RELEASE]: "Released on completion",
};

const signed = (amount: number) => (amount > 0 ? `+${money(amount, { cents: true })}` : `−${money(-amount, { cents: true })}`);

function startNote(savings: SavingsSummary): string {
  if (!savings.startMonth) return "Savings tracking hasn't started.";
  if (savings.startMonth > toMonthYear()) {
    return `Savings tracking starts in ${formatMonthYear(savings.startMonth)}. The opening balance is recorded on the 1st, once that month has a budget.`;
  }
  return savings.opening === null
    ? `Tracking since ${formatMonthYear(savings.startMonth)}.`
    : `Tracking since ${formatMonthYear(savings.startMonth)}, opening with ${money(savings.opening)}.`;
}

function SavingsFigures({ savings, goals }: { savings: SavingsSummary | null; goals: Goal[] }) {
  const targets = goals.reduce((sum, goal) => sum + (goal.targetAmount ?? 0), 0);
  return (
    <div className="flex flex-col gap-6 border-y border-rule py-6 md:flex-row md:gap-0">
      <Figure className="md:pr-6" value={savings ? money(savings.total) : "—"} label="Total savings" note={savings ? startNote(savings) : "Loading…"} />
      <div className="grid grid-cols-2 gap-6 border-t border-rule pt-6 md:contents">
        <Figure
          compact
          className="md:border-l md:border-rule md:px-6"
          value={savings ? money(savings.inGoals) : "—"}
          of={targets > 0 ? money(targets) : undefined}
          label="In goals"
          progress={targets > 0 && savings ? { fraction: savings.inGoals / targets, fill: "var(--positive)" } : undefined}
          note={`${goals.length} active ${goals.length === 1 ? "goal" : "goals"}`}
        />
        <Figure
          compact
          className="max-md:border-l max-md:border-rule max-md:pl-6 md:border-l md:border-rule md:px-6"
          value={savings ? money(savings.unassigned) : "—"}
          label="Not in a goal"
          tone={savings && savings.unassigned < 0 ? "text-accent" : undefined}
          note="Add money to a goal from here"
        />
      </div>
    </div>
  );
}

function NewGoal({ act }: { act: GoalsData["act"] }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return setError("Name the goal.");
    setBusy(true);
    const targetAmount = centsFromInput(target);
    const failure = await act(() => createGoal({ name: name.trim(), targetAmount: targetAmount > 0 ? targetAmount : undefined }));
    setBusy(false);
    setError(failure);
    if (!failure) {
      setName("");
      setTarget("");
    }
  }

  return (
    <Section label="New goal">
      <div className="flex flex-col gap-3">
        <input
          aria-label="Goal name"
          value={name}
          placeholder="Car purchase"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
          className="entry-title bg-transparent border-b border-rule pb-1 outline-none focus:border-ink"
        />
        <div className="flex items-end justify-between gap-4">
          <label className="entry-meta flex items-end gap-3">
            <span className="uppercase tracking-[0.18em]">target</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={target}
              placeholder="optional"
              onChange={(event) => setTarget(event.target.value)}
              className={amountInput}
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void add()} className={submit}>
            {busy ? "adding…" : "add goal →"}
          </button>
        </div>
        {error ? <p className="entry-meta text-accent">{error}</p> : null}
        <p className="entry-meta">A goal&apos;s name can&apos;t change later: monthly savings categories find their goal by name.</p>
      </div>
    </Section>
  );
}

function reachedAmount(goal: Goal, allocations: GoalAllocation[]): number {
  const release = allocations.find((a) => a.goalId === goal.id && a.reason === GoalAllocationReason.RELEASE);
  return release ? -release.amount : 0;
}

function Ledger({ allocations, goals, focus, act }: { allocations: GoalAllocation[]; goals: Goal[]; focus: Goal | null; act: GoalsData["act"] }) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(goals.map((goal) => [goal.id, goal.name]));
  const rows = allocations.filter((a) => !focus || a.goalId === focus.id).reverse();
  const visible = expanded ? rows : rows.slice(0, LEDGER_PREVIEW);

  async function undo(id: string) {
    const failure = await act(() => undoAllocation(id));
    setConfirming(null);
    setError(failure);
  }

  return (
    <Section label="Ledger" aside={focus ? focus.name : "all goals"}>
      {error ? <SourceError message={error} /> : null}
      {rows.length === 0 ? (
        <p className="entry-meta py-2">No money has moved yet.</p>
      ) : (
        <>
          {visible.map((allocation) => {
            const undoable = allocation.reason === GoalAllocationReason.ASSIGNMENT || allocation.reason === GoalAllocationReason.TRANSFER;
            const meta = [day(convertToDate(allocation.createdAt).toISOString()), REASON_LABELS[allocation.reason]];
            if (allocation.monthYear && allocation.reason === GoalAllocationReason.ASSIGNMENT) meta.push(`from ${formatMonthYear(allocation.monthYear)}`);
            if (allocation.note) meta.push(allocation.note);
            return (
              <Entry
                key={allocation.id}
                title={focus ? REASON_LABELS[allocation.reason] : (names.get(allocation.goalId) ?? "Goal")}
                meta={meta.join(" · ")}
                figure={signed(allocation.amount)}
                positive={allocation.amount > 0}
                label={
                  !undoable ? null : confirming === allocation.id ? (
                    <span className="entry-meta flex gap-2">
                      <button type="button" className="text-accent" onClick={() => void undo(allocation.id)}>
                        undo
                      </button>
                      <button type="button" className="hover:text-ink" onClick={() => setConfirming(null)}>
                        keep
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="entry-meta hover:text-accent" onClick={() => setConfirming(allocation.id)}>
                      undo…
                    </button>
                  )
                }
              />
            );
          })}
          {rows.length > LEDGER_PREVIEW ? (
            <div className="entry-meta flex justify-between border-t border-rule pt-3.5">
              <span>
                Showing {visible.length} of {rows.length}
              </span>
              <button type="button" className="text-ink hover:text-accent" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Show fewer ↑" : "View all →"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

function Months({ savings }: { savings: SavingsSummary }) {
  if (savings.months.length === 0) return null;
  return (
    <Section label="Months" aside="saved · added to goals · left">
      {[...savings.months].reverse().map((month) => (
        <div key={month.monthYear} className="entry flex items-baseline justify-between gap-4">
          <span>{formatMonthYear(month.monthYear)}</span>
          <span className="figure text-[length:var(--text-small)]">
            {money(month.result)} <span className="text-muted">· {money(month.assigned)} ·</span>{" "}
            <span className={month.remaining !== 0 ? "text-accent" : "text-muted"}>{money(month.remaining)}</span>
          </span>
        </div>
      ))}
    </Section>
  );
}

export default function GoalsView() {
  const data = useGoals();
  const { goals, active, completed, allocations, savings, error, act } = data;
  const [focusId, setFocusId] = useState<string>(ALL_ACTIVE);
  const focus = goals?.find((goal) => goal.id === focusId) ?? null;
  const shown = focus ? [focus] : active;
  const toggleFocus = (goal: Goal) => setFocusId(focusId === goal.id ? ALL_ACTIVE : goal.id);

  return (
    <div className="flex flex-col gap-7">
      <h2 className="font-display text-[length:var(--text-month)] leading-none">Savings</h2>
      <SavingsFigures savings={savings} goals={active} />
      {error ? <SourceError message={error} /> : null}

      <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-12 pt-3 md:grid-cols-[minmax(0,657fr)_minmax(0,459fr)]">
        <div className="flex flex-col gap-12">
          <Section label="Goals" aside={goals ? `${active.length} active` : undefined}>
            {goals === null && !error ? (
              <p className="entry-meta py-2">Loading…</p>
            ) : active.length === 0 ? (
              <p className="entry-meta py-2">No goals yet. Add one below, then move savings into it.</p>
            ) : (
              active.map((goal) => (
                <GoalRow
                  key={goal.id}
                  goal={goal}
                  color={goalColor(active, goal)}
                  others={active.filter((other) => other.id !== goal.id)}
                  savings={savings}
                  focused={focusId === goal.id}
                  onFocus={() => toggleFocus(goal)}
                  act={act}
                />
              ))
            )}
          </Section>

          <NewGoal act={act} />

          <Section label="Completed" aside={completed.length > 0 ? `${completed.length} met` : undefined}>
            {completed.length === 0 ? (
              <p className="entry-meta py-2">Goals you complete are kept here.</p>
            ) : (
              completed.map((goal) => {
                const meta = [goal.completedAt ? `completed ${day(convertToDate(goal.completedAt).toISOString())}` : "completed"];
                if (goal.targetAmount) meta.push(`target ${money(goal.targetAmount)}`);
                return (
                  <Entry
                    key={goal.id}
                    title={goal.name}
                    meta={meta.join(" · ")}
                    onOpen={() => toggleFocus(goal)}
                    figure={money(reachedAmount(goal, allocations))}
                    label={<span className="entry-meta">{focusId === goal.id ? "charted" : "reached"}</span>}
                  />
                );
              })
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-12">
          <Section label="Progress" aside="saved over time">
            {goals && goals.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1" role="tablist">
                {[{ id: ALL_ACTIVE, name: "All active" }, ...active].map(({ id, name }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={focusId === id}
                    onClick={() => setFocusId(id)}
                    className={`entry-meta border-b pb-1 ${focusId === id ? "border-ink text-ink" : "border-transparent hover:border-rule"}`}
                  >
                    {name}
                  </button>
                ))}
                {focus && !active.includes(focus) ? (
                  <span className="entry-meta border-b border-ink pb-1 text-ink">{focus.name} · completed</span>
                ) : null}
              </div>
            ) : null}
            {goals === null ? <p className="entry-meta">Loading…</p> : <GoalProgressChart goals={active} shown={shown} allocations={allocations} />}
          </Section>

          <Ledger allocations={allocations} goals={goals ?? []} focus={focus} act={act} />
          {savings ? <Months savings={savings} /> : null}
        </div>
      </div>
    </div>
  );
}
