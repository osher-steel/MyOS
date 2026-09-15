import { NextResponse } from "next/server";
import { ApiError } from "./api";

export function invalidMonth() {
  return NextResponse.json({ error: "Month must be YYYY-MM.", code: "validation_error" }, { status: 400 });
}

export function fromError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }
  // fetch() rejects when the API is down; env() throws when .env is incomplete.
  return NextResponse.json({ error: (error as Error).message, code: "upstream_unavailable" }, { status: 502 });
}
