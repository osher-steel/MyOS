import { isMonthYear, type StoredMonthReport } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError, invalidMonth } from "@/lib/proxyResponses";

type Params = RouteContext<"/api/reports/[monthYear]/generations">;

export async function POST(_req: Request, { params }: Params) {
  const { monthYear } = await params;
  if (!isMonthYear(monthYear)) return invalidMonth();

  try {
    const report = await apiFetch<StoredMonthReport>("/month-reports/generations", {
      method: "POST",
      body: JSON.stringify({ monthYear }),
    });
    return NextResponse.json({ data: report }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
