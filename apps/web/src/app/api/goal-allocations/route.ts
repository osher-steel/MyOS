import { RequestBuilder, toQueryString, type GoalAllocation } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  const query = toQueryString(new RequestBuilder().sort("createdAt", "asc").limit(5000).toQuery());
  try {
    return NextResponse.json({ data: await apiFetch<GoalAllocation[]>(`/goal-allocations?${query}`) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(req: Request) {
  const { goalId, monthYear, amount, note } = (await req.json()) as Pick<GoalAllocation, "goalId" | "monthYear" | "amount" | "note">;
  try {
    const allocation = await apiFetch<GoalAllocation>("/goal-allocations", {
      method: "POST",
      body: JSON.stringify({ goalId, monthYear, amount, note }),
    });
    return NextResponse.json({ data: allocation }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
