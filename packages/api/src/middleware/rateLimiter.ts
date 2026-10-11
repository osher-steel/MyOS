import { createHash } from "node:crypto";
import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// ── Tiers ────────────────────────────────────────────────

const TIERS = {
  /** Anonymous requests, keyed by IP. */
  public: { windowMs: 60_000, max: 120 },
  /** Requests carrying a session or bearer token, keyed by its hash. */
  authenticated: { windowMs: 60_000, max: 1_000 },
} as const;

const credentialOf = (req: Request) =>
  req.header("X-Session") ?? req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();

function getTier(req: Request): keyof typeof TIERS {
  return credentialOf(req) ? "authenticated" : "public";
}

// ── Key generation ───────────────────────────────────────

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// Web traffic all arrives from the host's IPs, so a credential, not the IP, is the caller
function getClientKey(req: Request): string {
  const credential = credentialOf(req);
  if (credential) return `tok:${hash(credential)}`;

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
