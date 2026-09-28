import type { Goal } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function PATCH(req: Request, { params }: RouteContext<"/api/goals/[id]">) {
  const { id } = await params;
  const { targetAmount } = (await req.json()) as Pick<Goal, "targetAmount">;
  try {
    const goal = await apiFetch<Goal>(`/goals/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ targetAmount }) });
    return NextResponse.json({ data: goal });
  } catch (error) {
    return fromError(error);
  }
}
