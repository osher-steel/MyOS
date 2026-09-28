import type { SavingsSummary } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  try {
    return NextResponse.json({ data: await apiFetch<SavingsSummary>("/savings") });
  } catch (error) {
    return fromError(error);
  }
}
