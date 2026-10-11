import { LINE_ENTRIES_COLLECTION, lineEntryBreakdowns, type LineEntryBreakdowns, type LineEntryView, type MonthYear } from "@myos/shared";
import { bookCollection } from "../core/books/bookContext.js";

export async function breakdownsBetween(from: MonthYear, to: MonthYear): Promise<LineEntryBreakdowns & { from: MonthYear; to: MonthYear }> {
  const snapshot = await bookCollection(LINE_ENTRIES_COLLECTION)
    .where("monthYear", ">=", from)
    .where("monthYear", "<=", to)
    .get();
  const rows = snapshot.docs.map((doc) => ({ ...(doc.data() as LineEntryView), id: doc.id }));
  return { from, to, ...lineEntryBreakdowns(rows) };
}
