import { RequestBuilder, toQueryString, type Budget } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { env } from "@/lib/env";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  const query = toQueryString(new RequestBuilder().prefix("id", `${env("MYOS_OWNER_UID")}_`).limit(120).toQuery());
  try {
    return NextResponse.json({ data: await apiFetch<Budget[]>(`/budgets?${query}`) });
  } catch (error) {
    return fromError(error);
  }
}
