import { createHash } from "node:crypto";
import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// ── Tiers ────────────────────────────────────────────────

const TIERS = {
  /** Anonymous requests, keyed by IP. */
  public: { windowMs: 60_000, max: 120 },
  /** Requests carrying a bearer token, keyed by the hashed token. */
  authenticated: { windowMs: 60_000, max: 1_000 },
} as const;

function getTier(req: Request): keyof typeof TIERS {
  return req.headers.authorization ? "authenticated" : "public";
}

// ── Key generation ───────────────────────────────────────

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function getClientKey(req: Request): string {
  const auth = req.headers.authorization;

  if (auth) {
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      // The API key and Firebase JWTs are both opaque bearer tokens —
      // hashing them gives a stable key.
      return `tok:${hash(token)}`;
    }
  }

  // ipKeyGenerator applies IPv6 subnet masking so one subnet can't bypass it.
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

// ── Exported middleware (matches the app's error response shape) ────

export const rateLimiter = rateLimit({
  windowMs: 60_000,
  limit: (req) => TIERS[getTier(req)].max,
  keyGenerator: getClientKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later.", code: "rate_limit_exceeded" },
  statusCode: 429,
});
