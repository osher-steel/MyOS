import { createHash, timingSafeEqual } from "node:crypto";
import { PrincipalKind, type Principal } from "@myos/shared";
import type { NextFunction, Request, Response } from "express";
import type { DecodedIdToken } from "firebase-admin/auth";
import { auth } from "../../config/firebase.js";
import { sendErrorResponse } from "../errors/errorResponses.js";
import { ServiceForbiddenError, ServiceUnauthorizedError } from "../errors/errors.js";
import type { Permission } from "./resourceBuilder.types.js";

const SYSTEM_KEY_PREFIX = "myos_";

// Never throws. Constant-time comparison of the presented key against the
// configured one, via hashes so length differences don't short-circuit.
function apiKeyMatches(presented: string): boolean {
  const configured = process.env.MYOS_API_KEY;
  if (!configured) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

// Never throws. Returns undefined when the Authorization header is missing or
// not in "Bearer <token>" form.
function getBearerToken(h: string | undefined): string | undefined {
  if (!h) return;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim();
}

// Never throws, never writes to `res`. Returns undefined for a missing or
// invalid token — callers decide whether that means "anonymous" or "denied".
// Side effect: sets req.uid on success.
async function verifyToken(req: Request): Promise<DecodedIdToken | undefined> {
  const token = getBearerToken(req.header("Authorization"));
  if (!token) {
    return;
  }
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    return decoded;
  } catch {
    return;
  }
}

// Pure. The one human: their Firebase uid must equal MYOS_OWNER_UID.
function principalFromToken(decoded: DecodedIdToken): Principal | undefined {
  const ownerUid = process.env.MYOS_OWNER_UID;
  if (!ownerUid || decoded.uid !== ownerUid) return undefined;
  return {
    id: decoded.uid,
    kind: PrincipalKind.OWNER,
    ...(decoded.email ? { email: decoded.email } : {}),
  };
}

const API_KEY_PRINCIPAL: Principal = { id: "system", kind: PrincipalKind.API_KEY };

// Pure predicate — never throws. The API key and the owner uid both count as
// the owner: there is nobody else the key could belong to.
export function isOwner(client: Principal | undefined): boolean {
  return client?.kind === PrincipalKind.OWNER || client?.kind === PrincipalKind.API_KEY;
}

// resourceBuilder contract: THROWS ServiceForbiddenError on every denial path
// and never writes to `res` — every resourceBuilder handler wraps calls in
// try/catch and maps thrown ServiceErrors to responses via processError().
// Returns the resolved principal (or undefined for anonymous access when the
// permission level allows it). Supports two auth paths: the `myos_`-prefixed
// API key and Firebase bearer tokens.
export async function resolvePermission(req: Request, permission: Permission): Promise<Principal | undefined> {
  let client: Principal | undefined;
  let decoded: DecodedIdToken | undefined;

  const token = getBearerToken(req.header("Authorization"));

  if (token?.startsWith(SYSTEM_KEY_PREFIX)) {
    if (!apiKeyMatches(token)) throw new ServiceForbiddenError("Forbidden");
    client = API_KEY_PRINCIPAL;
    req.client = client;
  } else {
    decoded = await verifyToken(req);
    if (decoded) {
      client = principalFromToken(decoded);
      if (client) req.client = client;
      else {
        console.error(
          `[auth] verified uid ${decoded.uid} is not MYOS_OWNER_UID — a valid token from a different account was rejected.`,
        );
      }
    } else if (req.header("Authorization")) {
      // A token was sent and did not verify. Almost always minted by a
      // different Firebase project than the one this API verifies against.
      console.error(
        `[auth] bearer token present but failed verification — this API verifies against project "${process.env.APP_FIREBASE_PROJECT_ID}".`,
      );
    }
  }

  switch (permission) {
    case "none":
      return client;
    case "auth": {
      if (decoded ?? client) return client;
      throw new ServiceForbiddenError("Forbidden");
    }
    case "owner": {
      if (isOwner(client)) return client;
      throw new ServiceForbiddenError("Forbidden");
    }
  }
}

// ── Express middlewares ──────────────────────────────────
// Contract: NEVER throw — write the error response to `res` and stop the
// chain (return without calling next). There is no global error-handling
// middleware, so a throw here would surface as Express's bare default 500
// instead of a JSON error body.

// Never throws. Sends a 401 and returns undefined for a missing or invalid
// token; returns the decoded token (and sets req.uid) on success.
async function verifyAuthToken(req: Request, res: Response): Promise<DecodedIdToken | undefined> {
  const idToken = getBearerToken(req.header("Authorization"));

  if (!idToken) {
    sendErrorResponse(res, new ServiceUnauthorizedError("Missing bearer token."));
    return undefined;
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    return decodedToken;
  } catch {
    sendErrorResponse(res, new ServiceUnauthorizedError("Invalid or expired token."));
    return undefined;
  }
}

// Requires a valid Firebase bearer token or the API key. Does not require the
// owner. On failure the 401 has already been sent — the chain just stops.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req.header("Authorization"));
  if (token?.startsWith(SYSTEM_KEY_PREFIX)) {
    if (!apiKeyMatches(token)) {
      return sendErrorResponse(res, new ServiceForbiddenError("Forbidden"));
    }
    req.client = API_KEY_PRINCIPAL;
    return next();
  }

  const decodedToken = await verifyAuthToken(req, res);
  if (!decodedToken) return;

  return next();
}

// Requires the owner (owner uid or API key). Sets req.client.
// On failure the 401/403 has already been sent — the chain just stops.
export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  const token = getBearerToken(req.header("Authorization"));
  if (token?.startsWith(SYSTEM_KEY_PREFIX)) {
    if (!apiKeyMatches(token)) {
      return sendErrorResponse(res, new ServiceForbiddenError("Forbidden"));
    }
    req.client = API_KEY_PRINCIPAL;
    return next();
  }

  const decodedToken = await verifyAuthToken(req, res);
  if (!decodedToken) return;

  const client = principalFromToken(decodedToken);
  if (!client) {
    return sendErrorResponse(res, new ServiceForbiddenError("Forbidden"));
  }

  req.client = client;
  return next();
}
