"use client";

import { BudgetGroup, formatMonthYear, type MonthReport, type MonthYear } from "@myos/shared";
import { Section } from "@/components/editorial";
import { money, reportSummary } from "@/lib/format";

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

export default function ReportPanel({
  monthYear,
  report,
  inProgress,
  loading,
}: {
  monthYear: MonthYear;
  report: MonthReport;
  inProgress: boolean;
  loading: boolean;
}) {
  return (
    <Section label={`Report · ${formatMonthYear(monthYear)}`} aside={inProgress ? "in progress" : "closed"}>
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
        </div>
      )}
    </Section>
  );
}
