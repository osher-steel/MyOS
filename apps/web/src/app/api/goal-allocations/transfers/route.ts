import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function POST(req: Request) {
  const { fromGoalId, toGoalId, amount, monthYear, note } = (await req.json()) as Record<string, unknown>;
  try {
    const result = await apiFetch<{ transferId: string }>("/goal-allocations/transfers", {
      method: "POST",
      body: JSON.stringify({ fromGoalId, toGoalId, amount, monthYear, note }),
    });
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
