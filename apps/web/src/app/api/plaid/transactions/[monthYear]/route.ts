import { isMonthYear } from "@myos/shared";
import { NextResponse } from "next/server";
import { getTransactionsInMonth } from "@/lib/plaid";
import { fromError, invalidMonth } from "@/lib/proxyResponses";

type Params = RouteContext<"/api/plaid/transactions/[monthYear]">;

export async function GET(_req: Request, { params }: Params) {
  const { monthYear } = await params;
  if (!isMonthYear(monthYear)) return invalidMonth();

  try {
    return NextResponse.json({ data: await getTransactionsInMonth(monthYear) });
  } catch (error) {
    return fromError(error);
  }
}
