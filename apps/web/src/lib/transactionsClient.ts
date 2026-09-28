import type { LineEntry, LineEntryView, MonthYear } from "@myos/shared";
import { unwrap } from "./proxyClient";

export type ItemSyncResult = {
  institution: string;
  skipped: boolean;
  created: number;
  updated: number;
  removed: number;
  deleted: number;
  months: MonthYear[];
};

export type LedgerRefresh = { items: ItemSyncResult[]; reports: MonthYear[] };

export async function fetchLineEntries(monthYear: MonthYear): Promise<LineEntry[]> {
  return unwrap<LineEntry[]>(await fetch(`/api/transactions/${monthYear}`));
}

export async function syncTransactions(): Promise<LedgerRefresh> {
  return unwrap<LedgerRefresh>(await fetch("/api/transactions/syncs", { method: "POST" }));
}

export async function saveLabel(entry: LineEntryView, label: string): Promise<LineEntry> {
  const res = await fetch(`/api/transactions/${entry.monthYear}/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
  return unwrap<LineEntry>(res);
}
