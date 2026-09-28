import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function POST() {
  try {
    return NextResponse.json({ data: await apiFetch("/line-entries/syncs", { method: "POST" }) });
  } catch (error) {
    return fromError(error);
  }
}
