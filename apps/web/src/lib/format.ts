import {
  formatMonthYear,
  LabelSource,
  labelSourceOf,
  MonthOutcome,
  PlaidTransactionStatus,
  toCents,
  type LineEntryView,
  type MonthReport,
} from "@myos/shared";

export function money(amountCents: number | null, { currency = "USD", cents = false } = {}): string {
  if (amountCents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amountCents / 100);
}

export const dollarsInput = (amountCents: number) => amountCents / 100;
export const centsFromInput = (value: string) => toCents(Number(value) || 0);

// "2026-08-12" parses as UTC midnight and renders as the previous day west of
// Greenwich, so date-only values are pinned to local time before formatting.
export function day(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function transactionMeta(entry: LineEntryView): string {
  const parts = [day(entry.date)];
  if (entry.plaidStatus === PlaidTransactionStatus.PENDING) parts.push("pending");
  if (entry.business) parts.push("business");
  if (entry.bookedMonth) parts.push(`booked to ${formatMonthYear(entry.bookedMonth)}`);
  if (labelSourceOf(entry) === LabelSource.RULE) parts.push("auto-labelled");
  return parts.join(" · ");
}

export function daysLeftInMonth(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
}

export function reportSummary(report: MonthReport, inProgress: boolean): string {
  if (!report.hasBudget) return "No budget for this month.";
  const parts: string[] = [];
  const saved = report.projected ? "On track to save" : "Saved";
  if (report.variance === 0) parts.push("spending landed exactly on target.");
  else if (report.variance > 0) parts.push(`spending came in ${money(report.variance)} under target.`);
  else parts.push(`spending went ${money(-report.variance)} over target.`);

  switch (report.outcome) {
    case MonthOutcome.AHEAD:
      parts.push(
        report.savingsResult === report.savingsPlanned
          ? `${saved} ${money(report.savingsResult)}, as planned.`
          : `${saved} ${money(report.savingsResult)}, ${money(report.savingsResult - report.savingsPlanned)} more than planned.`,
      );
      break;
    case MonthOutcome.SHORT:
      parts.push(`${saved} ${money(report.savingsResult)} of the ${money(report.savingsPlanned)} planned.`);
      break;
    case MonthOutcome.DEFICIT:
      parts.push(`Spending ${report.projected ? "is set to outrun" : "outran"} entry by ${money(-report.savingsResult)}, which comes out of your goals.`);
      break;
  }
  if (report.incomeShortfall > 0) {
    parts.push(
      report.projected
        ? `That counts ${money(report.incomeShortfall)} of budgeted income still to come.`
        : `Entry fell ${money(report.incomeShortfall)} short of the budgeted income.`,
    );
  }
  const text = (inProgress ? "So far, " : "") + parts.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
