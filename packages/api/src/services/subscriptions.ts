import { detectSubscriptions, LINE_ENTRIES_COLLECTION, previousMonthYear, toMonthYear, type LineEntryView, type SubscriptionsSummary } from "@myos/shared";
import { db } from "../config/firebase.js";

const LOOKBACK_MONTHS = 6;

export async function subscriptionsSummary(): Promise<SubscriptionsSummary> {
  const current = toMonthYear();
  let from = current;
  for (let i = 1; i < LOOKBACK_MONTHS; i += 1) from = previousMonthYear(from);
  const snapshot = await db.collection(LINE_ENTRIES_COLLECTION).where("monthYear", ">=", from).get();
  return detectSubscriptions(
    snapshot.docs.map((doc) => ({ ...(doc.data() as LineEntryView), id: doc.id })),
    current,
  );
}
