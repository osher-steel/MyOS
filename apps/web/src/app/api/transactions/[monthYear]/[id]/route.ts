import { isMonthYear, type LineEntry } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError, invalidMonth } from "@/lib/proxyResponses";

type Params = RouteContext<"/api/transactions/[monthYear]/[id]">;

export async function PATCH(req: Request, { params }: Params) {
  const { monthYear, id } = await params;
  if (!isMonthYear(monthYear)) return invalidMonth();

  const { label } = (await req.json()) as { label: string };
  try {
    const entry = await apiFetch<LineEntry>(`/line-entries/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
    return NextResponse.json({ data: entry });
  } catch (error) {
    return fromError(error);
  }
}
