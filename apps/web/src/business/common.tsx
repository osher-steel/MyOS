"use client";

import { BUSINESS_CATEGORIES, BusinessFlow, formatMonthYear, nextMonthYear, previousMonthYear } from "@myos/shared";
import { centsFromInput } from "@/lib/format";

// Revenue, investment and transfers have fixed labels; every other label is a monthly burn line
export const FIXED_GROUPS: Array<[BusinessFlow, string]> = [
  [BusinessFlow.REVENUE, "revenue"],
  [BusinessFlow.FINANCING, "financing"],
  [BusinessFlow.INTERNAL, "internal"],
];
export const FIXED_LABELS: readonly string[] = BUSINESS_CATEGORIES.map(({ name }) => name);
export const isFixedLabel = (label: string) => FIXED_LABELS.includes(label);

export const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Dollars as typed, tolerating "$" and thousands commas. */
export const centsFrom = (value: string) => centsFromInput(value.replace(/[$,\s]/g, ""));

export function Stat({ label, value, note, over }: { label: string; value: string; note?: string; over?: boolean }) {
  return (
    <div>
      <div className="entry-meta uppercase tracking-[0.18em]">{label}</div>
      <div className={`figure text-[var(--text-headline)] ${over ? "text-accent" : ""}`}>{value}</div>
      {note ? <div className="entry-meta">{note}</div> : null}
    </div>
  );
}

export function MonthNav({ month, max, onChange }: { month: string; max: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-baseline gap-5">
      <button type="button" className="entry-meta hover:text-accent" onClick={() => onChange(previousMonthYear(month))}>
        ← previous
      </button>
      <span className="figure">{formatMonthYear(month)}</span>
      <button
        type="button"
        className="entry-meta hover:text-accent disabled:opacity-40"
        disabled={month >= max}
        onClick={() => onChange(nextMonthYear(month))}
      >
        next →
      </button>
    </div>
  );
}
