import { previousMonthYear, toMonthYear, type MonthYear } from "@myos/shared";
import { NextResponse } from "next/server";
import { fromError } from "@/lib/proxyResponses";
import { loadMonthReports } from "@/lib/reports";

const MAX_MONTHS = 24;

/** The last `months` closed months plus the open one, oldest first. */
export async function GET(req: Request) {
  const requested = Number(new URL(req.url).searchParams.get("months") ?? 6);
  const months = Math.min(MAX_MONTHS, Math.max(1, Number.isFinite(requested) ? requested : 6));

  const monthYears: MonthYear[] = [toMonthYear()];
  let cursor = previousMonthYear(toMonthYear());
  for (let i = 0; i < months; i += 1) {
    monthYears.unshift(cursor);
    cursor = previousMonthYear(cursor);
  }

  try {
    return NextResponse.json({ data: await loadMonthReports(monthYears) });
  } catch (error) {
    return fromError(error);
  }
}
