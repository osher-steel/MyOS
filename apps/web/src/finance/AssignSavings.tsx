"use client";

import type { Goal, MonthYear } from "@myos/shared";
import Link from "next/link";
import { useState } from "react";
import { assignToGoal } from "@/lib/goalsClient";
import { centsFromInput, dollarsInput, money } from "@/lib/format";
import { errorMessage } from "./useGoals";

const control = "bg-transparent border-b border-rule focus:border-ink outline-none py-0.5 text-ink";

export default function AssignSavings({
  monthYear,
  remaining,
  goals,
  onAssigned,
}: {
  monthYear: MonthYear;
  remaining: number;
  goals: Goal[];
  onAssigned: () => void;
}) {
  const takingOut = remaining < 0;
  const [goalId, setGoalId] = useState("");
  const [amount, setAmount] = useState(String(dollarsInput(Math.abs(remaining))));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = goalId || goals[0]?.id || "";

  if (goals.length === 0) {
    return (
      <p className="entry-meta">
        {money(Math.abs(remaining))} to {takingOut ? "take out of" : "assign to"} goals, but there are none yet.{" "}
        <Link href="/goals" className="text-ink hover:text-accent">
          Set up goals →
        </Link>
      </p>
    );
  }

  async function submit() {
    const cents = centsFromInput(amount);
    if (cents <= 0) return;
    setBusy(true);
    setError(null);
    try {
      await assignToGoal({ goalId: target, amount: takingOut ? -cents : cents, monthYear });
      onAssigned();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="entry-meta flex flex-col gap-2 border-t border-rule pt-3">
      <span>
        {money(Math.abs(remaining))} {takingOut ? "overspent, to take out of a goal" : "left to assign"}
      </span>
      <div className="flex flex-wrap items-baseline gap-3">
        <span>{takingOut ? "take" : "put"}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className={`${control} w-24 text-right figure`}
          aria-label="Amount"
        />
        <span>{takingOut ? "out of" : "into"}</span>
        <select value={target} onChange={(event) => setGoalId(event.target.value)} className={control} aria-label="Goal">
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => void submit()} className="text-ink hover:text-accent disabled:opacity-40">
          {busy ? "saving…" : "assign →"}
        </button>
      </div>
      {error ? <span className="text-accent">{error}</span> : null}
    </div>
  );
}
