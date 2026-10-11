import {
  LINE_ENTRIES_COLLECTION,
  MONTH_REPORTS_COLLECTION,
  monthRange,
  monthReport,
  monthReportId,
  previousMonthYear,
  toMonthYear,
  type LineEntryView,
  type MonthYear,
} from "@myos/shared";
import { db } from "../config/firebase.js";
import { currentBookId, bookCollection  } from "../core/books/bookContext.js";
import type { MonthReportEntity } from "../domains/monthReports/monthReports.types.js";
import { effectiveBudget } from "./budgets.js";

const MAX_BACKFILL_MONTHS = 24;

const lineEntries = () => bookCollection(LINE_ENTRIES_COLLECTION);
const reports = () => bookCollection(MONTH_REPORTS_COLLECTION);

export async function generateMonthReport(monthYear: MonthYear): Promise<MonthReportEntity> {
  const ownerUid = currentBookId();
  const [budget, snapshot] = await Promise.all([
    effectiveBudget(ownerUid, monthYear),
    lineEntries().where("monthYear", "==", monthYear).get(),
  ]);
  const rows = snapshot.docs.map((doc) => ({ ...(doc.data() as LineEntryView), id: doc.id }));

  const record = { ...monthReport(monthYear, budget, rows), generatedAt: new Date() };
  const id = monthReportId(ownerUid, monthYear);
  await reports().doc(id).set(record);
  return { ...record, id };
}

/** The open month is always computed on read, so only finished months are stored. */
export async function regeneratePastReports(months: Iterable<MonthYear>): Promise<MonthYear[]> {
  const past = [...new Set(months)].filter((month) => month < toMonthYear()).sort();
  for (const month of past) await generateMonthReport(month);
  return past;
}

export async function generateMissingReports(): Promise<MonthYear[]> {
  const earliest = await lineEntries().orderBy("date").limit(1).get();
  if (earliest.empty) return [];

  const ownerUid = currentBookId();
  const lastClosed = previousMonthYear(toMonthYear());
  const months = monthRange((earliest.docs[0]!.get("date") as string).slice(0, 7), lastClosed).slice(
    -MAX_BACKFILL_MONTHS,
  );
  if (months.length === 0) return [];

  const existing = await db.getAll(...months.map((month) => reports().doc(monthReportId(ownerUid, month))));
  const missing = months.filter((_, i) => !existing[i]!.exists);
  return regeneratePastReports(missing);
}
