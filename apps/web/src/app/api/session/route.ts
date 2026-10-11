import { DEFAULT_BOOK, type BookView } from "@myos/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch, BOOK_COOKIE, SESSION_COOKIE } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

export async function POST(req: Request) {
  const { idToken } = (await req.json()) as { idToken?: string };
  try {
    const { session, expiresIn } = await apiFetch<{ session: string; expiresIn: number }>("/sessions", {
      method: "POST",
      body: JSON.stringify({ idToken }),
      book: null,
    });
    const books = await apiFetch<BookView[]>("/books", { book: null, headers: { "X-Session": session } });
    if (books.length === 0) {
      return NextResponse.json({ error: "This Google account isn't a member of any book.", code: "forbidden" }, { status: 403 });
    }
    const book = books.find((candidate) => candidate.id === DEFAULT_BOOK) ?? books[0]!;
    const store = await cookies();
    store.set(SESSION_COOKIE, session, cookieOptions(expiresIn / 1000));
    store.set(BOOK_COOKIE, book.id, cookieOptions(expiresIn / 1000));
    return NextResponse.json({ data: { book: book.id } });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(BOOK_COOKIE);
  return new NextResponse(null, { status: 204 });
}
