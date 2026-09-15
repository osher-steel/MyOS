import type { LineEntry, LineEntryView, MonthYear, PlaidTransaction } from "@myos/shared";
import { unwrap } from "./proxyClient";

export async function fetchLineEntries(monthYear: MonthYear): Promise<LineEntry[]> {
  return unwrap<LineEntry[]>(await fetch(`/api/transactions/${monthYear}`));
}

export async function fetchPlaidTransactions(monthYear: MonthYear): Promise<PlaidTransaction[]> {
  return unwrap<PlaidTransaction[]>(await fetch(`/api/plaid/transactions/${monthYear}`));
}

export async function saveLabel(entry: LineEntryView, label: string): Promise<LineEntry> {
  const res = await fetch(`/api/transactions/${entry.monthYear}/${entry.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...entry, label }),
  });
  return unwrap<LineEntry>(res);
}
