import { isMonthYear, RequestBuilder, toQueryString, type LineEntry } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError, invalidMonth } from "@/lib/proxyResponses";

type Params = RouteContext<"/api/transactions/[monthYear]">;

export async function GET(_req: Request, { params }: Params) {
  const { monthYear } = await params;
  if (!isMonthYear(monthYear)) return invalidMonth();

  const query = toQueryString(new RequestBuilder().eq("monthYear", monthYear).limit(1000).toQuery());
  try {
    const entries = await apiFetch<LineEntry[]>(`/line-entries?${query}`);
    return NextResponse.json({ data: entries });
  } catch (error) {
    return fromError(error);
  }
}
