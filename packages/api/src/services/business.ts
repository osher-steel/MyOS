import { businessOwed, LINE_ENTRIES_COLLECTION, type BusinessSummary, type LineEntryView } from "@myos/shared";
import { bookCollection } from "../core/books/bookContext.js";

export async function businessSummary(): Promise<BusinessSummary> {
  const snapshot = await bookCollection(LINE_ENTRIES_COLLECTION).where("business", "==", true).get();
  const entries = snapshot.docs.map((doc) => ({ ...(doc.data() as LineEntryView), id: doc.id }));
  return { owed: businessOwed(entries), count: entries.length };
}
