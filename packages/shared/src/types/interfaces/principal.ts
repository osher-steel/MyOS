/**
 * Who is calling the API. A signed-in Google user is a MEMBER of the books
 * that list their email; a book key acts inside the one book it was minted
 * for; the system key (MYOS_API_KEY) is trusted automation across all books.
 */
export enum PrincipalKind {
  MEMBER = "member",
  BOOK_KEY = "bookKey",
  API_KEY = "apiKey",
}

export enum BookRole {
  OWNER = "owner",
  MEMBER = "member",
}

export type Principal = {
  id: string;
  kind: PrincipalKind;
  email?: string;
  bookId?: string;
  role?: BookRole;
};

export type BookMember = { email: string; role: BookRole };

export interface Book {
  id: string;
  name: string;
  members: BookMember[];
  memberEmails: string[]; // lowercased emails from members, for array-contains lookups
  apiKeyHashes?: string[]; // sha256 of each book key; the keys themselves are shown once
}

export type BookView = Omit<Book, "apiKeyHashes"> & { role?: BookRole };
