import { budgetId, isMonthYear, type Budget } from "@myos/shared";
import { NextResponse } from "next/server";
import { ApiError, apiFetch } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * Browser-facing proxy for one month's budget. The API key and the owner id
 * stay on the server; the client only ever names a month. Auth is deferred,
 * so every call is filed under the single configured owner.
 */

type Params = RouteContext<"/api/budgets/[monthYear]">;

function invalidMonth() {
  return NextResponse.json({ error: "Month must be YYYY-MM.", code: "validation_error" }, { status: 400 });
}

function fromError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  // fetch() rejects when the API is down; env() throws when .env is incomplete.
  return NextResponse.json({ error: (error as Error).message, code: "upstream_unavailable" }, { status: 502 });
}

export async function GET(_req: Request, { params }: Params) {
  const { monthYear } = await params;
  if (!isMonthYear(monthYear)) return invalidMonth();

  try {
    const budget = await apiFetch<Budget>(`/budgets/${budgetId(env("MYOS_OWNER_UID"), monthYear)}`);
    return NextResponse.json({ data: budget });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * Create-or-replace: PATCH the month if it exists, POST it if not. The
 * client sends the full draft either way and never chooses a verb.
 */
export async function PUT(req: Request, { params }: Params) {
  const { monthYear } = await params;
  if (!isMonthYear(monthYear)) return invalidMonth();

  const draft: unknown = await req.json();
  const id = budgetId(env("MYOS_OWNER_UID"), monthYear);

  try {
    const budget = await apiFetch<Budget>(`/budgets/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
    return NextResponse.json({ data: budget });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) return fromError(error);
  }

  try {
    const budget = await apiFetch<Budget>("/budgets", {
      method: "POST",
      body: JSON.stringify({ ...(draft as object), monthYear }),
    });
    return NextResponse.json({ data: budget }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
