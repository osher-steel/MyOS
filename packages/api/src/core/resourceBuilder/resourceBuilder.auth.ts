import { createHash, timingSafeEqual } from "node:crypto";
import { BookRole, PrincipalKind, type Book, type Principal } from "@myos/shared";
import type { NextFunction, Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { auth } from "../../config/firebase.js";
import { books, isBookId, maybeBookId, withBook } from "../books/bookContext.js";
import { sendErrorResponse } from "../errors/errorResponses.js";
import { ServiceForbiddenError, ServiceValidationError } from "../errors/errors.js";
import type { Permission } from "./resourceBuilder.types.js";

const KEY_PREFIX = "myos_";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// Never throws. Constant-time comparison of the presented key against the
// configured one, via hashes so length differences don't short-circuit.
function systemKeyMatches(presented: string): boolean {
  const configured = process.env.MYOS_API_KEY;
  if (!configured) return false;
  return timingSafeEqual(createHash("sha256").update(presented).digest(), createHash("sha256").update(configured).digest());
}

// Book keys read `myos_<bookId>_<secret>`; book ids never contain "_"
export function bookFromKey(key: string): string | undefined {
  if (!key.startsWith(KEY_PREFIX)) return undefined;
  const rest = key.slice(KEY_PREFIX.length);
  const bookId = rest.slice(0, rest.indexOf("_"));
  return isBookId(bookId) ? bookId : undefined;
}

function getBearerToken(h: string | undefined): string | undefined {
  if (!h) return;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

export async function loadBook(bookId: string): Promise<Book | undefined> {
  const doc = await books().doc(bookId).get();
  return doc.exists ? ({ ...(doc.data() as Omit<Book, "id">), id: doc.id }) : undefined;
}

async function verifyToken(req: Request, token: string): Promise<DecodedIdToken | undefined> {
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    return decoded;
  } catch {
    console.error(`[auth] bearer token failed verification — this API verifies against project "${process.env.APP_FIREBASE_PROJECT_ID}".`);
    return undefined;
  }
}

async function bookKeyPrincipal(token: string, bookId: string | undefined): Promise<Principal> {
  const keyBook = bookFromKey(token);
  if (!keyBook || keyBook !== bookId) throw new ServiceForbiddenError("Forbidden");
  const book = await loadBook(keyBook);
  if (!book?.apiKeyHashes?.includes(hashKey(token))) throw new ServiceForbiddenError("Forbidden");
  return { id: `key:${keyBook}`, kind: PrincipalKind.BOOK_KEY, bookId: keyBook };
}

// Only a verified email counts: membership is granted by email before the person ever signs in
async function memberPrincipal(decoded: DecodedIdToken, bookId: string | undefined): Promise<Principal> {
  const email = decoded.email_verified ? decoded.email?.toLowerCase() : undefined;
  const signedIn: Principal = { id: decoded.uid, kind: PrincipalKind.MEMBER, ...(email ? { email } : {}) };
  if (!bookId || !email) return signedIn;
  const member = (await loadBook(bookId))?.members.find((candidate) => candidate.email.toLowerCase() === email);
  return member ? { ...signedIn, bookId, role: member.role } : signedIn;
}

async function resolveClient(req: Request): Promise<Principal | undefined> {
  const token = getBearerToken(req.header("Authorization"));
  if (!token) return undefined;
  const bookId = maybeBookId();
  if (token.startsWith(KEY_PREFIX)) {
    if (systemKeyMatches(token)) return { id: "system", kind: PrincipalKind.API_KEY, ...(bookId ? { bookId } : {}) };
    return bookKeyPrincipal(token, bookId);
  }
  const decoded = await verifyToken(req, token);
  return decoded ? memberPrincipal(decoded, bookId) : undefined;
}

// Pure. True when the client may act on everything in the request's book.
export function isOwner(client: Principal | undefined): boolean {
  if (!client) return false;
  if (client.kind === PrincipalKind.API_KEY) return true;
  const bookId = maybeBookId();
  return bookId !== undefined && client.bookId === bookId;
}

const isBookOwner = (client: Principal | undefined) =>
  client?.kind === PrincipalKind.API_KEY || (isOwner(client) && client?.role === BookRole.OWNER);

// resourceBuilder contract: THROWS ServiceForbiddenError on every denial path
// and never writes to `res`; handlers map thrown ServiceErrors to responses.
export async function resolvePermission(req: Request, permission: Permission): Promise<Principal | undefined> {
  const client = await resolveClient(req);
  if (client) req.client = client;

  switch (permission) {
    case "none":
      return client;
    case "auth":
      if (client) return client;
      throw new ServiceForbiddenError("Forbidden");
    case "owner":
      if (isOwner(client)) return client;
      throw new ServiceForbiddenError("Forbidden");
    case "bookOwner":
      if (isBookOwner(client)) return client;
      throw new ServiceForbiddenError("Forbidden");
  }
}

// Never throws. Binds the request to the book named by X-Book, or by the book key it carries,
// so every repo and service below reads and writes under that book.
export function bookScope(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req.header("Authorization"));
  const named = req.header("X-Book") ?? (token && !systemKeyMatches(token) ? bookFromKey(token) : undefined);
  if (named === undefined) return next();
  if (!isBookId(named)) {
    return sendErrorResponse(res, new ServiceValidationError("Invalid book.", { formErrors: [`"${named}" isn't a book id.`], fieldErrors: {} }));
  }
  return withBook(named, next);
}
