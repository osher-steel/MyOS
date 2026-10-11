import type { BookView } from "@myos/shared";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiFetch, BOOK_COOKIE } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function POST(req: Request) {
  const { bookId } = (await req.json()) as { bookId?: string };
  try {
    const books = await apiFetch<BookView[]>("/books", { book: null });
    if (!books.some((book) => book.id === bookId)) {
      return NextResponse.json({ error: "You aren't a member of that book.", code: "forbidden" }, { status: 403 });
    }
    (await cookies()).set(BOOK_COOKIE, bookId!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
    return NextResponse.json({ data: { book: bookId } });
  } catch (error) {
    return fromError(error);
  }
}
