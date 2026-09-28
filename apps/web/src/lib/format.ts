import {
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
  if (labelSourceOf(entry) === LabelSource.RULE) parts.push("auto-labelled");
  return parts.join(" · ");
}

export function daysLeftInMonth(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
}

export function reportSummary(report: MonthReport, inProgress: boolean): string {
  if (!report.hasBudget) return "No budget for this month.";
  const parts: string[] = [];
  const prefix = inProgress ? "So far: " : "";
  switch (report.outcome) {
    case MonthOutcome.UNDER: {
      if (report.variance === 0) {
        parts.push(`${prefix}allocated perfectly, nothing surpassed.`);
      } else {
        const extra = report.savingsPlanned > 0 ? `, adding ${Math.round((report.variance / report.savingsPlanned) * 100)}% extra to savings` : "";
        parts.push(`${prefix}under allocation by ${money(report.variance)}${extra}.`);
      }
      break;
    }
    case MonthOutcome.OVER:
      parts.push(`${prefix}went over allocation by ${money(-report.variance)}, taken out of savings.`);
      break;
    case MonthOutcome.DEFICIT:
      parts.push(
        `${prefix}went far over allocation: no savings this month, and the balance was deducted by ${money(report.balanceDeduction)}.`,
      );
      break;
  }
  if (report.incomeShortfall > 0) {
    parts.push(`Entry fell ${money(report.incomeShortfall)} short of the budgeted income.`);
  }
  const text = parts.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
