"use client";

import { BudgetGroup, formatMonthYear, type Goal, type MonthReport, type MonthYear } from "@myos/shared";
import { Section } from "@/components/editorial";
import { money, reportSummary } from "@/lib/format";
import AssignSavings from "./AssignSavings";

const GROUP_LABELS: Record<BudgetGroup, string> = {
  [BudgetGroup.NEEDS]: "Needs",
  [BudgetGroup.WANTS]: "Wants",
  [BudgetGroup.SAVINGS]: "Savings",
};

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="entry-meta uppercase tracking-[0.18em]">{label}</div>
      <div className={`figure text-[var(--text-headline)] ${muted ? "text-muted" : ""}`}>{value}</div>
    </div>
  );
}

function openItems(report: MonthReport, savingsRemaining: number | null): string[] {
  const items: string[] = [];
  if (savingsRemaining !== null && savingsRemaining > 0) items.push(`assign ${money(savingsRemaining)} to goals`);
  if (savingsRemaining !== null && savingsRemaining < 0) items.push(`take ${money(-savingsRemaining)} out of goals`);
  if (report.unlabelledCount > 0) {
    items.push(`label ${report.unlabelledCount} ${report.unlabelledCount === 1 ? "entry" : "entries"}`);
  }
  return items;
}

export default function ReportPanel({
  monthYear,
  report,
  inProgress,
  savingsRemaining,
  goals,
  businessOwed,
  onAssigned,
  regenerate,
  regenerating,
  regenerateError,
  loading,
}: {
  monthYear: MonthYear;
  report: MonthReport;
  inProgress: boolean;
  savingsRemaining: number | null;
  goals: Goal[];
  businessOwed: number | null;
  onAssigned: () => void;
  regenerate: () => void;
  regenerating: boolean;
  regenerateError: string | null;
  loading: boolean;
}) {
  const open = inProgress || !report.hasBudget ? [] : openItems(report, savingsRemaining);
  const status = inProgress ? "in progress" : open.length > 0 ? "pending" : "closed";
  return (
    <Section label={`Report · ${formatMonthYear(monthYear)}`} aside={status}>
      {loading ? (
        <p className="entry-meta">Loading…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
            <Stat label="Allocated" value={money(report.allocated)} />
            <Stat label="Entry" value={money(report.entry)} />
            <Stat label="Spent" value={money(report.spent)} />
            <Stat label="Net" value={money(report.net)} muted={report.net === 0} />
          </div>

          {report.hasBudget ? (
            <div>
              {report.groups.map((group) => {
                const savings = group.group === BudgetGroup.SAVINGS;
                const over = savings ? group.used < group.allocated : group.used > group.allocated;
                return (
                  <div key={group.group} className="entry flex items-baseline justify-between gap-4">
                    <span>{GROUP_LABELS[group.group]}</span>
                    <span className="figure">
                      <span className={over ? "text-accent" : undefined}>{money(group.used)}</span>
                      <span className="text-muted"> / {money(group.allocated)}</span>
                    </span>
                  </div>
                );
              })}
              {report.unlabelledSpent > 0 ? (
                <div className="entry flex items-baseline justify-between gap-4">
                  <span className="text-muted">Unlabelled</span>
                  <span className="figure">{money(report.unlabelledSpent)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="entry-title">{reportSummary(report, inProgress)}</p>
          {report.businessPaid > 0 || report.businessReimbursed > 0 || businessOwed ? (
            <p className="entry-meta">
              Business: {money(report.businessPaid)} paid for DIBS, {money(report.businessReimbursed)} paid back this month
              {businessOwed !== null && businessOwed !== 0
                ? ` · ${businessOwed > 0 ? `DIBS owes you ${money(businessOwed)}` : `you owe DIBS ${money(-businessOwed)}`} overall`
                : ""}
              .
            </p>
          ) : null}
          {open.length > 0 ? (
            <p className="entry-meta">
              To close: {open.join(", ")}.
            </p>
          ) : null}
          {!inProgress && savingsRemaining ? (
            <AssignSavings
              key={savingsRemaining}
              monthYear={monthYear}
              remaining={savingsRemaining}
              goals={goals}
              onAssigned={onAssigned}
            />
          ) : null}
          {inProgress ? null : (
            <p className="entry-meta">
              <button type="button" className="text-ink hover:text-accent disabled:opacity-40" disabled={regenerating} onClick={regenerate}>
                {regenerating ? "regenerating…" : "regenerate report ↻"}
              </button>
              {regenerateError ? <span className="text-accent ml-3">{regenerateError}</span> : null}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
