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
  autoLabelled?: number;
  rulesLearned?: number;
};

export type LedgerRefresh = { items: ItemSyncResult[]; reports: MonthYear[] };

export async function fetchLineEntries(monthYear: MonthYear): Promise<LineEntry[]> {
  return unwrap<LineEntry[]>(await fetch(`/api/transactions/${monthYear}`));
}

export async function syncTransactions(): Promise<LedgerRefresh> {
  return unwrap<LedgerRefresh>(await fetch("/api/transactions/syncs", { method: "POST" }));
}

export type LineEntryEdit = Partial<Pick<LineEntry, "label" | "tags">>;

export async function patchLineEntry(entry: LineEntryView, edit: LineEntryEdit): Promise<LineEntry> {
  const res = await fetch(`/api/transactions/${entry.monthYear}/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(edit),
  });
  return unwrap<LineEntry>(res);
}
