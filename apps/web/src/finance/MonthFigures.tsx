"use client";

import { formatMonthYear, toMonthYear, type BudgetUsage, type Goal, type SavingsSummary } from "@myos/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { daysLeftInMonth, money } from "@/lib/format";

export function Figure({
  value,
  of,
  label,
  progress,
  note,
  tone,
  compact,
  className = "",
}: {
  value: string;
  of?: string;
  label: ReactNode;
  progress?: { fraction: number; fill: string };
  note: ReactNode;
  tone?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-2.5 ${className}`}>
      <div className="flex flex-wrap items-end gap-x-2 gap-y-1 font-display leading-none">
        <span className={`whitespace-nowrap tracking-[-0.01em] ${compact ? "text-[1.75rem] md:text-[length:var(--text-figure)]" : "text-[length:var(--text-figure)]"} ${tone ?? ""}`}>
          {value}
        </span>
        {of ? (
          <span className={`whitespace-nowrap text-muted ${compact ? "text-base md:text-[length:var(--text-figure-aside)]" : "text-[length:var(--text-figure-aside)]"}`}>
            / {of}
          </span>
        ) : null}
      </div>
      <p className="entry-meta truncate uppercase tracking-[0.18em]">{label}</p>
      <div className={`h-[3px] w-full ${progress ? "bg-rule" : ""}`}>
        {progress ? <div className="h-full" style={{ width: `${Math.min(1, Math.max(0, progress.fraction)) * 100}%`, background: progress.fill }} /> : null}
      </div>
      <p className="entry-meta">{note}</p>
    </div>
  );
}

const SIDE = "md:border-l md:border-rule md:px-6";

function goalFigure(goal: Goal, index: number) {
  return (
    <Figure
      key={goal.id}
      compact
      className={`${SIDE} ${index % 2 === 1 ? "max-md:border-l max-md:border-rule max-md:pl-6" : ""}`}
      value={money(goal.amountSaved)}
      of={goal.targetAmount ? money(goal.targetAmount) : undefined}
      label={
        <Link href="/goals" className="hover:text-accent">
          {goal.name}
        </Link>
      }
      progress={goal.targetAmount ? { fraction: goal.amountSaved / goal.targetAmount, fill: "var(--positive)" } : undefined}
      note={goal.targetAmount ? `${Math.floor((goal.amountSaved / goal.targetAmount) * 100)}% of goal` : "saved, no target"}
    />
  );
}

function SavingsFigure({ savings }: { savings: SavingsSummary | null }) {
  const upcoming = savings?.startMonth && savings.startMonth > toMonthYear();
  return (
    <Figure
      compact
      className={`${SIDE} max-md:col-span-2`}
      value={savings && !upcoming ? money(savings.total) : "—"}
      label="Savings"
      note={
        <>
          {!savings
            ? "Loading…"
            : !savings.startMonth
              ? "Not tracked yet"
              : upcoming
                ? `Starts ${formatMonthYear(savings.startMonth)}`
                : `${money(savings.unassigned)} not in a goal`}
          {" · "}
          <Link href="/goals" className="text-ink hover:text-accent">
            Set up goals →
          </Link>
        </>
      }
    />
  );
}

export default function MonthFigures({
  usage,
  goals,
  savings,
  toLabel,
  loading,
}: {
  usage: BudgetUsage | null;
  goals: Goal[];
  savings: SavingsSummary | null;
  toLabel: { count: number; amount: number };
  loading: { budget: boolean; ledger: boolean };
}) {
  const left = usage ? usage.spendingAllocated - usage.spendingUsed : 0;
  const days = daysLeftInMonth();
  const labelCount = loading.ledger ? "—" : String(toLabel.count);
  const labelTone = toLabel.count > 0 ? "text-accent" : undefined;
  const labelNote = loading.ledger ? "Loading…" : toLabel.count > 0 ? `${money(toLabel.amount, { cents: true })} unlabelled` : "All labelled";
  const autoLabelling = (
    <Link href="/settings" className="text-ink hover:text-accent">
      Auto-Labelling →
    </Link>
  );

  return (
    <div className="flex flex-col gap-6 border-y border-rule py-6 md:flex-row md:gap-0">
      <Figure
        className="md:pr-6"
        value={loading.budget ? "—" : money(usage?.spendingUsed ?? 0)}
        of={usage ? money(usage.spendingAllocated) : undefined}
        label="Spent of allocated"
        progress={usage ? { fraction: usage.spendingUsed / Math.max(1, usage.spendingAllocated), fill: left < 0 ? "var(--accent)" : "var(--ink)" } : undefined}
        note={
          loading.budget
            ? "Loading…"
            : usage
              ? `${left < 0 ? `${money(-left)} over` : `${money(left)} left`} · ${days} ${days === 1 ? "day" : "days"} to go`
              : "No budget this month"
        }
      />

      <div className="grid grid-cols-2 gap-6 border-t border-rule pt-6 md:contents">
        {goals.length > 0 ? goals.map(goalFigure) : <SavingsFigure savings={savings} />}
      </div>

      <Figure
        className={`${SIDE} max-md:hidden`}
        value={labelCount}
        label="To label"
        tone={labelTone}
        note={
          <>
            <span className="text-ink">{labelNote}</span> · {autoLabelling}
          </>
        }
      />
      <div className="flex items-center gap-4 border-t border-rule pt-5 md:hidden">
        <span className={`font-display text-[2rem] leading-none ${labelTone ?? ""}`}>{labelCount}</span>
        <span className="min-w-0 flex-1">
          <span className="entry-meta block uppercase tracking-[0.18em]">To label</span>
          <span className="entry-meta block">{labelNote}</span>
        </span>
        <span className="entry-meta shrink-0">{autoLabelling}</span>
      </div>
    </div>
  );
}
