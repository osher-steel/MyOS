import type { BookView } from "@myos/shared";
import { NextResponse } from "next/server";
import { apiFetch, currentBook } from "@/lib/api";
import { fromError } from "@/lib/proxyResponses";

export async function GET() {
  try {
    const books = await apiFetch<BookView[]>("/books", { book: null });
    return NextResponse.json({ data: { books, current: await currentBook() } });
  } catch (error) {
    return fromError(error);
  }
}
