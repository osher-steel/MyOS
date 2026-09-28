import { RequestBuilder, toQueryString, type TagDefinition } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  const query = toQueryString(new RequestBuilder().limit(500).toQuery());
  try {
    return NextResponse.json({ data: await apiFetch<TagDefinition[]>(`/tags?${query}`) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(req: Request) {
  try {
    const tag = await apiFetch<TagDefinition>("/tags", { method: "POST", body: JSON.stringify(await req.json()) });
    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
