import { LINE_ENTRIES_COLLECTION, lineEntryBreakdowns, type LineEntryBreakdowns, type LineEntryView, type MonthYear } from "@myos/shared";
import { db } from "../config/firebase.js";

export async function breakdownsBetween(from: MonthYear, to: MonthYear): Promise<LineEntryBreakdowns & { from: MonthYear; to: MonthYear }> {
  const snapshot = await db
    .collection(LINE_ENTRIES_COLLECTION)
    .where("monthYear", ">=", from)
    .where("monthYear", "<=", to)
    .get();
  const rows = snapshot.docs.map((doc) => ({ ...(doc.data() as LineEntryView), id: doc.id }));
  return { from, to, ...lineEntryBreakdowns(rows) };
}
