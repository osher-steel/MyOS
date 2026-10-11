import type { BusinessSummary } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  try {
    return NextResponse.json({ data: await apiFetch<BusinessSummary>("/line-entries/business") });
  } catch (error) {
    return fromError(error);
  }
}
