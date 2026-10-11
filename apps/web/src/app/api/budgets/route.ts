import { RequestBuilder, toQueryString, type Budget } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch, currentBook } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  const query = toQueryString(new RequestBuilder().prefix("id", `${await currentBook()}_`).limit(120).toQuery());
  try {
    return NextResponse.json({ data: await apiFetch<Budget[]>(`/budgets?${query}`) });
  } catch (error) {
    return fromError(error);
  }
}
