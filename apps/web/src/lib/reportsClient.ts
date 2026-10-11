import type { MonthReport, MonthYear, StoredMonthReport } from "@myos/shared";
import { unwrap } from "./proxyClient";

export async function fetchPastReports(months: number): Promise<MonthReport[]> {
  return unwrap<MonthReport[]>(await fetch(`/api/reports?months=${months}`));
}

export async function regenerateReport(monthYear: MonthYear): Promise<StoredMonthReport> {
  return unwrap<StoredMonthReport>(await fetch(`/api/reports/${monthYear}/generations`, { method: "POST" }));
}
