import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function DELETE(_req: Request, { params }: RouteContext<"/api/goal-allocations/[id]">) {
  const { id } = await params;
  try {
    await apiFetch(`/goal-allocations/${encodeURIComponent(id)}`, { method: "DELETE" });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
