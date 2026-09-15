import { isMonthYear, type LineEntry, type LineEntryView } from "@myos/shared";
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";
import { fromError, invalidMonth } from "@/lib/proxyResponses";

type Params = RouteContext<"/api/transactions/[monthYear]/[id]">;

/**
 * Label one transaction. PATCH when the ledger already has it; otherwise the
 * row only exists in Plaid, so create it from the fields the client sends.
 */
export async function PUT(req: Request, { params }: Params) {
  const { monthYear, id } = await params;
  if (!isMonthYear(monthYear)) return invalidMonth();

  const view = (await req.json()) as LineEntryView;
  const label = view.label;

  try {
    const entry = await apiFetch<LineEntry>(`/line-entries/${id}`, { method: "PATCH", body: JSON.stringify({ label }) });
    return NextResponse.json({ data: entry });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) return fromError(error);
  }

  const { name, amount, date, currency, plaidStatus, pendingTransactionId } = view;
  try {
    const entry = await apiFetch<LineEntry>("/line-entries", {
      method: "POST",
      body: JSON.stringify({ id, name, amount, date, currency, plaidStatus, pendingTransactionId, label }),
    });
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
