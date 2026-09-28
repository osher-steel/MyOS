import type { Goal } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function POST(_req: Request, { params }: RouteContext<"/api/goals/[id]/completions">) {
  const { id } = await params;
  try {
    const goal = await apiFetch<Goal>(`/goals/${encodeURIComponent(id)}/completions`, { method: "POST", body: "{}" });
    return NextResponse.json({ data: goal }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
