import type { LabelRule } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

type Params = RouteContext<"/api/rules/[id]">;

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { label, enabled } = (await req.json()) as Partial<Pick<LabelRule, "label" | "enabled">>;
  try {
    const rule = await apiFetch<LabelRule>(`/label-rules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ label, enabled }),
    });
    return NextResponse.json({ data: rule });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await apiFetch(`/label-rules/${encodeURIComponent(id)}`, { method: "DELETE" });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return fromError(error);
  }
}
