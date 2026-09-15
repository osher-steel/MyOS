import "server-only";
import type { ErrorResponse } from "@myos/shared";
import { env } from "./env";

/**
 * Server-side client for packages/api. Holds the `myos_` API key, so it must
 * never be imported from a client component — the "server-only" import above
 * makes that a build error rather than a leaked secret.
 */
const BASE = (process.env.MYOS_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Calls the API and unwraps the `{ data }` envelope; throws ApiError on `{ error, code }`. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("MYOS_API_KEY")}`,
      ...init.headers,
    },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const body = (await res.json()) as { data?: T } & Partial<ErrorResponse>;
  if (!res.ok) {
    throw new ApiError(body.error ?? `API ${path} failed`, res.status, body.code ?? "internal_error", body.details);
  }
  return body.data as T;
}
