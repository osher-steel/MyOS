"use client";

import { convertToDate, GoalAllocationReason, GoalStatus, type Goal, type GoalAllocation, type LineEntryView } from "@myos/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Section } from "@/components/editorial";
import { money } from "@/lib/format";
import { assignToGoal, createGoal, fetchAllocations, fetchGoals, undoAllocation } from "@/lib/goalsClient";
import { unwrap } from "@/lib/proxyClient";
import { centsFrom, message, Stat } from "./common";

const REASONS: Record<GoalAllocationReason, string> = {
  [GoalAllocationReason.ASSIGNMENT]: "Top up",
  [GoalAllocationReason.TRANSFER]: "Moved",
  [GoalAllocationReason.GOAL_SPEND]: "Spent",
  [GoalAllocationReason.RELEASE]: "Closed",
};

const when = (allocation: GoalAllocation) => convertToDate(allocation.createdAt);
const stamp = (date: Date) =>
  date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

type PoolSummary = { goal: Goal; funded: number; spent: number; log: GoalAllocation[] };

function summarize(goal: Goal, allocations: GoalAllocation[]): PoolSummary {
  const log = allocations.filter((a) => a.goalId === goal.id).sort((a, b) => when(b).getTime() - when(a).getTime());
  const funded = log.filter((a) => a.reason !== GoalAllocationReason.GOAL_SPEND).reduce((sum, a) => sum + a.amount, 0);
  const spent = -log.filter((a) => a.reason === GoalAllocationReason.GOAL_SPEND).reduce((sum, a) => sum + a.amount, 0);
  return { goal, funded, spent, log };
}

// Money in and out of an allocation, newest first: top-ups by when they were logged, transactions by their date
type LogItem = { kind: "allocation"; at: Date; allocation: GoalAllocation } | { kind: "transaction"; at: Date; entry: LineEntryView };

function Pool({
  pool,
  version,
  onChanged,
  onError,
}: {
  pool: PoolSummary;
  version: number;
  onChanged: () => void;
  onError: (error: string) => void;
}) {
  const [transactions, setTransactions] = useState<LineEntryView[] | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { goal, funded, spent, log } = pool;

  useEffect(() => {
    let live = true;
    fetch(`/api/transactions?goalId=${encodeURIComponent(goal.id)}`)
      .then((res) => unwrap<LineEntryView[]>(res))
      .then((loaded) => live && setTransactions(loaded))
      .catch((cause: unknown) => live && onError(message(cause)));
    return () => {
      live = false;
    };
  }, [goal.id, version, onError]);

  const history = useMemo<LogItem[]>(
    () =>
      [
        ...log
          .filter((allocation) => allocation.reason !== GoalAllocationReason.GOAL_SPEND)
          .map((allocation) => ({ kind: "allocation" as const, at: when(allocation), allocation })),
        ...(transactions ?? []).map((entry) => ({ kind: "transaction" as const, at: new Date(`${entry.date}T12:00:00`), entry })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime()),
    [log, transactions],
  );
  const used = funded > 0 ? Math.min(100, Math.max(0, (spent / funded) * 100)) : 0;

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      onChanged();
    } catch (cause) {
      onError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const topUp = () =>
    run(async () => {
      const cents = centsFrom(amount);
      if (!cents) return;
      await assignToGoal({ goalId: goal.id, amount: cents, note: note.trim() || undefined });
      setAmount("");
      setNote("");
    });

  return (
    <Section
      label={goal.name}
      aside={<span className={`figure ${goal.amountSaved < 0 ? "text-accent" : ""}`}>{money(goal.amountSaved)} left</span>}
    >
      <div className="grid grid-cols-3 gap-6 pb-3">
        <Stat label="Funded" value={money(funded)} />
        <Stat label="Used" value={money(spent)} />
        <Stat label="Left" value={money(goal.amountSaved)} over={goal.amountSaved < 0} />
      </div>
      <div className="h-1.5 w-full bg-rule" aria-hidden>
        <div className={`h-full ${goal.amountSaved < 0 ? "bg-accent" : "bg-ink"}`} style={{ width: `${used}%` }} />
      </div>

      <form
        className="flex flex-wrap items-baseline gap-3 pt-5"
        onSubmit={(event) => {
          event.preventDefault();
          void topUp();
        }}
      >
        <input
          aria-label={`Top up ${goal.name}`}
          inputMode="decimal"
          placeholder="$ amount (− to reduce)"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="figure w-44 border-b border-rule bg-transparent outline-none"
        />
        <input
          aria-label="Note"
          placeholder="note, e.g. Q1 growth push"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-w-0 flex-1 border-b border-rule bg-transparent outline-none"
        />
        <button type="submit" className="entry-meta text-accent disabled:opacity-40" disabled={busy || !centsFrom(amount)}>
          log top-up
        </button>
      </form>

      <details className="pt-4" open={history.length <= 8}>
        <summary className="entry-meta cursor-pointer">
          History ·{" "}
          {transactions === null ? "loading…" : `${transactions.length} transactions, ${history.length - transactions.length} top-ups`}
        </summary>
        <ul className="pt-2">
          {history.map((item) =>
            item.kind === "transaction" ? (
              <li
                key={`t-${item.entry.id}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-2"
              >
                <span className="min-w-0 flex-1">
                  {item.entry.name}
                  <span className="entry-meta">
                    {" "}
                    · {item.entry.label ?? "uncategorized"} · {item.entry.date}
                  </span>
                </span>
                <span className="figure">
                  {item.entry.amount > 0 ? "−" : "+"}
                  {money(Math.abs(item.entry.amount), { cents: true })}
                </span>
              </li>
            ) : (
              <li
                key={item.allocation.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-2"
              >
                <span className="min-w-0 flex-1">
                  {item.allocation.amount < 0 && item.allocation.reason === GoalAllocationReason.ASSIGNMENT
                    ? "Reduced"
                    : REASONS[item.allocation.reason]}
                  {item.allocation.note ? <span className="entry-meta"> · {item.allocation.note}</span> : null}
                  <span className="entry-meta"> · {stamp(item.at)}</span>
                </span>
                <span className="figure text-ink">
                  {item.allocation.amount > 0 ? "+" : "−"}
                  {money(Math.abs(item.allocation.amount), { cents: true })}
                </span>
                {item.allocation.reason === GoalAllocationReason.ASSIGNMENT ? (
                  <button
                    type="button"
                    className="entry-meta hover:text-accent disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void run(() => undoAllocation(item.allocation.id))}
                  >
                    undo
                  </button>
                ) : null}
              </li>
            ),
          )}
        </ul>
      </details>
    </Section>
  );
}

export default function Allocations() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [allocations, setAllocations] = useState<GoalAllocation[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => {
    Promise.all([fetchGoals(), fetchAllocations()])
      .then(([loadedGoals, loadedAllocations]) => {
        setGoals(loadedGoals);
        setAllocations(loadedAllocations);
      })
      .catch((cause: unknown) => setError(message(cause)));
  }, []);
  useEffect(load, [load]);
  const reload = useCallback(() => {
    setVersion((v) => v + 1);
    load();
  }, [load]);

  const pools = useMemo(
    () => (goals ?? []).filter((goal) => goal.status === GoalStatus.ACTIVE).map((goal) => summarize(goal, allocations)),
    [goals, allocations],
  );
  const totals = pools.reduce(
    (sum, pool) => ({ funded: sum.funded + pool.funded, spent: sum.spent + pool.spent, left: sum.left + pool.goal.amountSaved }),
    { funded: 0, spent: 0, left: 0 },
  );

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const goal = await createGoal({ name: name.trim() });
      const cents = centsFrom(amount);
      if (cents > 0) await assignToGoal({ goalId: goal.id, amount: cents, note: "Initial allocation" });
      setName("");
      setAmount("");
      load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-12">
      <p className="entry-meta max-w-2xl">
        Allocations are money set aside for one push, like a growth budget, outside the monthly burn. File a transaction under an allocation
        on Home and it draws from here instead of the month&apos;s budget. Every top-up is logged with its date.
      </p>
      {error ? <p className="text-accent">{error}</p> : null}

      {goals === null ? (
        <p className="entry-meta">Loading…</p>
      ) : (
        <>
          {pools.length > 0 ? (
            <div className="grid grid-cols-3 gap-6">
              <Stat label="Allocated" value={money(totals.funded)} />
              <Stat label="Used" value={money(totals.spent)} />
              <Stat label="Left" value={money(totals.left)} over={totals.left < 0} />
            </div>
          ) : null}

          <div className="grid gap-12 md:grid-cols-2">
            {pools.map((pool) => (
              <Pool key={pool.goal.id} pool={pool} version={version} onChanged={reload} onError={setError} />
            ))}
            <Section label="New allocation">
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (name.trim()) void create();
                }}
              >
                <input
                  aria-label="Allocation name"
                  placeholder="Name, e.g. Growth budget"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="border-b border-rule bg-transparent outline-none"
                />
                <input
                  aria-label="Starting amount"
                  inputMode="decimal"
                  placeholder="$ starting amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="figure border-b border-rule bg-transparent outline-none"
                />
                <button type="submit" className="entry-meta self-start text-accent disabled:opacity-40" disabled={busy || !name.trim()}>
                  create allocation
                </button>
              </form>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
