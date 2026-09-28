import type { MonthYear } from "@myos/shared";
import { generateMissingReports, regeneratePastReports } from "./monthReports.js";
import { syncLinkedItems, type ItemSyncResult } from "./plaidSync.js";
import { ensureOpening } from "./savings.js";

export type LedgerRefresh = { items: ItemSyncResult[]; reports: MonthYear[]; openingRecorded: boolean };

export async function refreshLedger(): Promise<LedgerRefresh> {
  const items = await syncLinkedItems();
  const backfilled = await generateMissingReports();
  const touched = items.flatMap((item) => item.months).filter((month) => !backfilled.includes(month));
  const regenerated = await regeneratePastReports(touched);
  return { items, reports: [...backfilled, ...regenerated].sort(), openingRecorded: await ensureOpening() };
}
