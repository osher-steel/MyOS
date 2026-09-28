import { RequestBuilder, toQueryString, type LabelRule } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  const query = toQueryString(new RequestBuilder().limit(500).toQuery());
  try {
    return NextResponse.json({ data: await apiFetch<LabelRule[]>(`/label-rules?${query}`) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(req: Request) {
  try {
    const rule = await apiFetch<LabelRule>("/label-rules", { method: "POST", body: JSON.stringify(await req.json()) });
    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
