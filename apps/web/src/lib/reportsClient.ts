import type { MonthReport } from "@myos/shared";
import { unwrap } from "./proxyClient";

export async function fetchPastReports(months: number): Promise<MonthReport[]> {
  return unwrap<MonthReport[]>(await fetch(`/api/reports?months=${months}`));
}
