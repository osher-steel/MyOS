import { AsyncLocalStorage } from "node:async_hooks";
import { BOOKS_COLLECTION } from "@myos/shared";
import { db } from "../../config/firebase.js";
import { ServiceValidationError } from "../errors/errors.js";

const BOOK_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

const store = new AsyncLocalStorage<{ bookId: string }>();

export const isBookId = (value: string) => BOOK_ID.test(value);

export function withBook<T>(bookId: string, run: () => T): T {
  return store.run({ bookId }, run);
}

// For scripts: binds the rest of the process to one book
export function useBook(bookId: string): void {
  store.enterWith({ bookId });
}

export function maybeBookId(): string | undefined {
  return store.getStore()?.bookId;
}

export function currentBookId(): string {
  const bookId = maybeBookId();
  if (!bookId) {
    throw new ServiceValidationError("No book selected.", { formErrors: ["Send the book to act on in the X-Book header."], fieldErrors: {} });
  }
  return bookId;
}

export const books = () => db.collection(BOOKS_COLLECTION);

export const bookCollection = (name: string) => books().doc(currentBookId()).collection(name);
