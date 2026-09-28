import {
  budgetId,
  LINE_ENTRIES_COLLECTION,
  MONTH_REPORTS_COLLECTION,
  monthRange,
  monthReport,
  monthReportId,
  previousMonthYear,
  toMonthYear,
  type Budget,
  type LineEntryView,
  type MonthYear,
} from "@myos/shared";
import { db } from "../config/firebase.js";
import { ServiceNotFoundError } from "../core/errors/errors.js";
import { budgetRepo, budgetUserId } from "../domains/budgets/budgets.domain.js";
import type { MonthReportEntity } from "../domains/monthReports/monthReports.types.js";

const MAX_BACKFILL_MONTHS = 24;

const lineEntries = db.collection(LINE_ENTRIES_COLLECTION);
const reports = db.collection(MONTH_REPORTS_COLLECTION);

async function loadBudget(ownerUid: string, monthYear: MonthYear): Promise<Budget | null> {
  try {
    return (await budgetRepo.get(budgetId(ownerUid, monthYear))) as Budget;
  } catch (error) {
    if (error instanceof ServiceNotFoundError) return null;
    throw error;
  }
}

export async function generateMonthReport(monthYear: MonthYear): Promise<MonthReportEntity> {
  const ownerUid = budgetUserId();
  const [budget, snapshot] = await Promise.all([
    loadBudget(ownerUid, monthYear),
    lineEntries.where("monthYear", "==", monthYear).get(),
  ]);
  const rows = snapshot.docs.map((doc) => ({ ...(doc.data() as LineEntryView), id: doc.id }));

  const record = { ...monthReport(monthYear, budget, rows), generatedAt: new Date() };
  const id = monthReportId(ownerUid, monthYear);
  await reports.doc(id).set(record);
  return { ...record, id };
}

/** The open month is always computed on read, so only finished months are stored. */
export async function regeneratePastReports(months: Iterable<MonthYear>): Promise<MonthYear[]> {
  const past = [...new Set(months)].filter((month) => month < toMonthYear()).sort();
  for (const month of past) await generateMonthReport(month);
  return past;
}

export async function generateMissingReports(): Promise<MonthYear[]> {
  const earliest = await lineEntries.orderBy("date").limit(1).get();
  if (earliest.empty) return [];

  const ownerUid = budgetUserId();
  const lastClosed = previousMonthYear(toMonthYear());
  const months = monthRange((earliest.docs[0]!.get("date") as string).slice(0, 7), lastClosed).slice(
    -MAX_BACKFILL_MONTHS,
  );
  if (months.length === 0) return [];

  const existing = await db.getAll(...months.map((month) => reports.doc(monthReportId(ownerUid, month))));
  const missing = months.filter((_, i) => !existing[i]!.exists);
  return regeneratePastReports(missing);
}
