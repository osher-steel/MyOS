import { businessOwed, LINE_ENTRIES_COLLECTION, type BusinessSummary, type LineEntryView } from "@myos/shared";
import { db } from "../config/firebase.js";

export async function businessSummary(): Promise<BusinessSummary> {
  const snapshot = await db.collection(LINE_ENTRIES_COLLECTION).where("business", "==", true).get();
  const entries = snapshot.docs.map((doc) => ({ ...(doc.data() as LineEntryView), id: doc.id }));
  return { owed: businessOwed(entries), count: entries.length };
}
