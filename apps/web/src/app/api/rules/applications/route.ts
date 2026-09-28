import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function POST(req: Request) {
  const { dryRun } = (await req.json()) as { dryRun?: boolean };
  try {
    const result = await apiFetch("/label-rules/applications", { method: "POST", body: JSON.stringify({ dryRun }) });
    return NextResponse.json({ data: result });
  } catch (error) {
    return fromError(error);
  }
}
