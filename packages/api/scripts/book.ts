import { DEFAULT_BOOK } from "@myos/shared";
import { isBookId, useBook } from "../src/core/books/bookContext.js";

export function scriptBook(): string {
  const bookId = process.env.MYOS_BOOK ?? DEFAULT_BOOK;
  if (!isBookId(bookId)) throw new Error(`MYOS_BOOK="${bookId}" isn't a book id.`);
  useBook(bookId);
  console.log(`book: ${bookId}`);
  return bookId;
}
