"use client";

import { formatMonthYear, toMonthYear, type Goal, type SavingsSummary } from "@myos/shared";
import { useState, type ReactNode } from "react";
import { assignToGoal, completeGoal, setGoalTarget, transferBetweenGoals } from "@/lib/goalsClient";
import { centsFromInput, dollarsInput, money } from "@/lib/format";

type Action = "add" | "move" | "target" | "complete";

const ACTIONS: Array<{ id: Action; label: string }> = [
  { id: "add", label: "add money" },
  { id: "move", label: "move" },
  { id: "target", label: "target" },
  { id: "complete", label: "complete…" },
];

export const amountInput =
  "figure w-28 bg-transparent border-b border-rule px-1 py-0.5 text-right text-sm outline-none focus:border-ink";
export const select = "entry-meta min-w-0 cursor-pointer bg-transparent border-b border-rule pb-[3px] text-ink outline-none focus:border-ink";
export const submit = "entry-meta shrink-0 text-ink hover:text-accent disabled:opacity-40";

function Form({ children, error }: { children: ReactNode; error: string | null }) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-l border-rule pl-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">{children}</div>
      {error ? <p className="entry-meta text-accent">{error}</p> : null}
    </div>
  );
}

export default function GoalRow({
  goal,
  color,
  others,
  savings,
  focused,
  onFocus,
  act,
}: {
  goal: Goal;
  color: string;
  others: Goal[];
  savings: SavingsSummary | null;
  focused: boolean;
  onFocus: () => void;
  act: (change: () => Promise<unknown>) => Promise<string | null>;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [toGoalId, setToGoalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = goal.targetAmount;
  const fraction = target ? goal.amountSaved / target : null;
  const months = (savings?.months ?? []).filter((month) => month.remaining !== 0);
  const sourceMonth = months.find((month) => month.monthYear === source);
  const destination = toGoalId || others[0]?.id || "";

  function open(next: Action) {
    setAction(action === next ? null : next);
    setAmount(next === "target" && target ? String(dollarsInput(target)) : "");
    setError(null);
  }

  async function run(change: () => Promise<unknown>) {
    setBusy(true);
    const failure = await act(change);
    setBusy(false);
    setError(failure);
    if (!failure) setAction(null);
  }

  const cents = centsFromInput(amount);
  const needsAmount = action !== "complete" && cents <= 0;

  return (
    <div className="entry">
      <div className="flex items-baseline justify-between gap-4">
        <button type="button" onClick={onFocus} className="flex min-w-0 items-center gap-2 text-left hover:text-accent" aria-pressed={focused}>
          <span className="inline-block h-0.5 w-3 shrink-0" style={{ background: color }} aria-hidden />
          <span className={`entry-title truncate ${focused ? "underline decoration-rule underline-offset-4" : ""}`}>{goal.name}</span>
        </button>
        <span className="figure shrink-0">
          <span className={goal.amountSaved < 0 ? "text-accent" : undefined}>{money(goal.amountSaved)}</span>
          {target ? <span className="text-muted"> / {money(target)}</span> : null}
        </span>
      </div>

      <div className="mt-2 h-[3px] w-full bg-rule">
        {fraction !== null ? <div className="h-full bg-positive" style={{ width: `${Math.min(1, Math.max(0, fraction)) * 100}%` }} /> : null}
      </div>

      <div className="entry-meta mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          {fraction === null
            ? "No target"
            : fraction >= 1
              ? "Target reached"
              : `${Math.floor(fraction * 100)}% of goal · ${money(target! - goal.amountSaved)} to go`}
        </span>
        <span className="flex gap-4">
          {ACTIONS.filter(({ id }) => id !== "move" || others.length > 0).map(({ id, label }) => (
            <button key={id} type="button" onClick={() => open(id)} className={action === id ? "text-ink" : "hover:text-ink"}>
              {label}
            </button>
          ))}
        </span>
      </div>

      {action === "add" ? (
        <Form error={error}>
          <label className="entry-meta flex flex-col gap-1">
            from
            <select value={source} onChange={(event) => setSource(event.target.value)} className={select}>
              <option value="">Unassigned savings{savings ? ` · ${money(savings.unassigned)}` : ""}</option>
              {months.map((month) => (
                <option key={month.monthYear} value={month.monthYear}>
                  {formatMonthYear(month.monthYear)} · {month.remaining > 0 ? `${money(month.remaining)} left` : `${money(-month.remaining)} overspent`}
                </option>
              ))}
            </select>
          </label>
          <label className="entry-meta flex flex-col gap-1">
            {sourceMonth && sourceMonth.remaining < 0 ? "take out" : "amount"}
            <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={amountInput} />
          </label>
          <button
            type="button"
            disabled={busy || needsAmount}
            className={submit}
            onClick={() =>
              void run(() =>
                assignToGoal({
                  goalId: goal.id,
                  amount: sourceMonth && sourceMonth.remaining < 0 ? -cents : cents,
                  monthYear: sourceMonth?.monthYear,
                }),
              )
            }
          >
            {busy ? "adding…" : "add →"}
          </button>
        </Form>
      ) : null}

      {action === "move" ? (
        <Form error={error}>
          <label className="entry-meta flex flex-col gap-1">
            to
            <select value={destination} onChange={(event) => setToGoalId(event.target.value)} className={select}>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
            </select>
          </label>
          <label className="entry-meta flex flex-col gap-1">
            amount
            <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={amountInput} />
          </label>
          <button
            type="button"
            disabled={busy || needsAmount}
            className={submit}
            onClick={() => void run(() => transferBetweenGoals({ fromGoalId: goal.id, toGoalId: destination, amount: cents, monthYear: toMonthYear() }))}
          >
            {busy ? "moving…" : "move →"}
          </button>
        </Form>
      ) : null}

      {action === "target" ? (
        <Form error={error}>
          <label className="entry-meta flex flex-col gap-1">
            target
            <input type="number" min="0" step="1" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={amountInput} />
          </label>
          <button type="button" disabled={busy || needsAmount} className={submit} onClick={() => void run(() => setGoalTarget(goal.id, cents))}>
            {busy ? "saving…" : "save"}
          </button>
        </Form>
      ) : null}

      {action === "complete" ? (
        <Form error={error}>
          <p className="entry-meta">
            {goal.amountSaved > 0 ? `Its ${money(goal.amountSaved)} goes back to unassigned savings.` : "Nothing is left in it."} It moves to completed goals.
          </p>
          <button type="button" disabled={busy} className="entry-meta text-accent disabled:opacity-40" onClick={() => void run(() => completeGoal(goal.id))}>
            {busy ? "completing…" : "complete"}
          </button>
          <button type="button" className="entry-meta hover:text-ink" onClick={() => setAction(null)}>
            keep
          </button>
        </Form>
      ) : null}
    </div>
  );
}
