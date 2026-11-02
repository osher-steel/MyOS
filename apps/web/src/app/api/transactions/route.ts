import { RequestBuilder, toQueryString, type LineEntry } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

/** Every transaction an allocation (goal) paid for, across all months. */
export async function GET(req: Request) {
  const goalId = new URL(req.url).searchParams.get("goalId")?.trim();
  if (!goalId) return NextResponse.json({ error: "Pass the allocation as ?goalId=." }, { status: 400 });

  const query = toQueryString(new RequestBuilder().eq("goalId", goalId).limit(1000).toQuery());
  try {
    const entries = await apiFetch<LineEntry[]>(`/line-entries?${query}`);
    return NextResponse.json({ data: entries });
  } catch (error) {
    return fromError(error);
  }
}
