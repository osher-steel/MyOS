"use client";

import type { BookView } from "@myos/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { unwrap } from "@/lib/proxyClient";

export function BookSwitcher() {
  const router = useRouter();
  const [books, setBooks] = useState<BookView[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/books")
      .then((res) => unwrap<{ books: BookView[]; current: string }>(res))
      .then((data) => {
        setBooks(data.books);
        setCurrent(data.current);
      })
      .catch(() => {});
  }, []);

  async function choose(bookId: string) {
    await unwrap(await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookId }) }));
    window.location.reload();
  }

  async function signOut() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="entry-meta flex items-baseline gap-4">
      {books.length > 1 ? (
        <select
          value={current ?? ""}
          onChange={(event) => void choose(event.target.value)}
          aria-label="Book"
          className="bg-transparent border-b border-rule focus:border-ink outline-none py-0.5 uppercase tracking-[0.18em] text-ink"
        >
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.name}
            </option>
          ))}
        </select>
      ) : books[0] ? (
        <span className="uppercase tracking-[0.18em]">{books[0].name}</span>
      ) : null}
      <button type="button" onClick={() => void signOut()} className="hover:text-accent">
        sign out
      </button>
    </div>
  );
}
