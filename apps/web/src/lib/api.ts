import "server-only";
import { DEFAULT_BOOK, type ErrorResponse } from "@myos/shared";
import { cookies } from "next/headers";

/**
 * Server-side client for packages/api. Forwards the signed-in user's session
 * and chosen book from cookies. Only a dev server with no session falls back
 * to the system key, so a deployed site never acts as the system.
 */
const BASE = (process.env.MYOS_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");

export const SESSION_COOKIE = "myos_session";
export const BOOK_COOKIE = "myos_book";

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

export async function currentBook(): Promise<string> {
  return (await cookies()).get(BOOK_COOKIE)?.value ?? DEFAULT_BOOK;
}

async function authHeaders(): Promise<Record<string, string>> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (session) return { "X-Session": session };
  const systemKey = process.env.NODE_ENV !== "production" ? process.env.MYOS_API_KEY : undefined;
  return systemKey ? { Authorization: `Bearer ${systemKey}` } : {};
}

/** Calls the API and unwraps the `{ data }` envelope; throws ApiError on `{ error, code }`. */
export async function apiFetch<T>(path: string, init: RequestInit & { book?: string | null } = {}): Promise<T> {
  const { book, ...request } = init;
  const bookId = book === null ? undefined : (book ?? (await currentBook()));
  const res = await fetch(`${BASE}${path}`, {
    ...request,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(bookId ? { "X-Book": bookId } : {}),
      ...request.headers,
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
