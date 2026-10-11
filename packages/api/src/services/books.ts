import { randomBytes } from "node:crypto";
import { BookRole, PrincipalKind, type Book, type BookView, type Principal } from "@myos/shared";
import { FieldValue } from "../config/firebase.js";
import { books, currentBookId, withBook } from "../core/books/bookContext.js";
import { hashKey } from "../core/resourceBuilder/resourceBuilder.auth.js";

function toView(book: Book, email?: string): BookView {
  const { apiKeyHashes: _hashes, ...view } = book;
  const role = email ? book.members.find((member) => member.email.toLowerCase() === email)?.role : undefined;
  return { ...view, ...(role ? { role } : {}) };
}

async function visibleDocs(client: Principal): Promise<FirebaseFirestore.DocumentSnapshot[]> {
  if (client.kind === PrincipalKind.API_KEY) return (await books().get()).docs;
  if (client.kind === PrincipalKind.BOOK_KEY) return [await books().doc(client.bookId!).get()];
  if (!client.email) return [];
  return (await books().where("memberEmails", "array-contains", client.email).get()).docs;
}

export async function booksFor(client: Principal): Promise<BookView[]> {
  const docs = (await visibleDocs(client)).filter((doc) => doc.exists);
  return docs.map((doc) => toView({ ...(doc.data() as Omit<Book, "id">), id: doc.id }, client.email));
}

/** The key is returned once and only its hash is kept, so a lost key is replaced, not recovered. */
export async function mintBookKey(): Promise<{ bookId: string; key: string }> {
  const bookId = currentBookId();
  const key = `myos_${bookId}_${randomBytes(24).toString("base64url")}`;
  await books().doc(bookId).update({ apiKeyHashes: FieldValue.arrayUnion(hashKey(key)) });
  return { bookId, key };
}

export async function forEachBook<T>(run: (bookId: string) => Promise<T>): Promise<Array<{ bookId: string; result: T }>> {
  const results: Array<{ bookId: string; result: T }> = [];
  for (const doc of (await books().get()).docs) {
    results.push({ bookId: doc.id, result: await withBook(doc.id, () => run(doc.id)) });
  }
  return results;
}

export function bookRecord(id: string, name: string, members: Array<{ email: string; role: BookRole }>): Omit<Book, "id"> {
  const normalized = members.map((member) => ({ ...member, email: member.email.toLowerCase() }));
  return { name, members: normalized, memberEmails: normalized.map((member) => member.email) };
}
