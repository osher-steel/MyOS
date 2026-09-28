import { RequestBuilder, toQueryString, type Goal } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  const query = toQueryString(new RequestBuilder().limit(200).toQuery());
  try {
    return NextResponse.json({ data: await apiFetch<Goal[]>(`/goals?${query}`) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(req: Request) {
  const { name, targetAmount } = (await req.json()) as Pick<Goal, "name" | "targetAmount">;
  try {
    const goal = await apiFetch<Goal>("/goals", { method: "POST", body: JSON.stringify({ name, targetAmount }) });
    return NextResponse.json({ data: goal }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
