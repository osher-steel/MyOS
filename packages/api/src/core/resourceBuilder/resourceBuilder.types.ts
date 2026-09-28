import type { Principal } from "@myos/shared";
import type { RequestHandler } from "express";
import type { z } from "zod";
import type { FirestoreRepo } from "../firestore/firestoreRepo.js";

// ── Permission levels ────────────────────────────────────
//
// Personal OS has one human, so the monorepo's per-domain PermissionMap
// collapses to three levels:
//
//   none   anonymous allowed (client may still be resolved if a token is sent)
//   auth   any verified Firebase ID token, or the myos_ API key
//   owner  the Firebase uid in MYOS_OWNER_UID, or the myos_ API key

export type Permission = "none" | "auth" | "owner";

// ── Endpoint configuration ───────────────────────────────

export type EndpointFlags = {
  permission: Permission;
  /**
   * Check ownership via the authorizeGet/authorizeList hook (get/list only).
   * When the domain defines the hook, this flag is mandatory: leave it unset
   * and the builder throws at boot; pass `ownership: false` to explicitly
   * opt the endpoint out. Owner clients always bypass the hook.
   */
  ownership?: boolean;
  /** transform entity before returning (get / list only) */
  transform?: boolean;
};

export type Schemas = {
  query?: z.ZodType;
  create?: z.ZodType;
  patch?: z.ZodType;
  /** Wider patch surface for the owner; falls back to `patch` when absent. */
  adminPatch?: z.ZodType;
  record?: z.ZodType;
};

// ── Domain hooks ─────────────────────────────────────────

type MaybePromise<T> = T | Promise<T>;

export type DomainHooks = {
  authorizeGet?: (existing: unknown, client: Principal) => MaybePromise<void>;
  /**
   * Validate or scope a list query to what the client may see, and return the
   * (possibly modified) query. Throw to reject outright. Runs only for
   * non-owner clients on endpoints that declare `ownership: true`.
   */
  authorizeList?: (query: Record<string, unknown>, client: Principal) => MaybePromise<Record<string, unknown>>;
  authorizePatch?: (existing: unknown, patch: unknown, client: Principal) => MaybePromise<void>;
  authorizeDelete?: (existing: unknown, client: Principal) => MaybePromise<void>;
  /**
   * Fetch parent/derived data, check business rules, and assemble the final
   * record. Throw typed Service* errors for each failure.
   * `client` is undefined only when the endpoint permission is "none".
   */
  buildCreateRecord?: (input: unknown, client?: Principal) => MaybePromise<Record<string, unknown>>;
  /**
   * Provide an explicit Firestore document ID for create, instead of an
   * auto-generated one. Return `undefined` to fall back to a random ID.
   * Used when the doc ID must equal a natural key — e.g. a budget keyed by
   * its `YYYY-MM` so "the budget for March" is a direct get, not a query.
   */
  createId?: (input: unknown, ctx: { uid?: string; client?: Principal }) => string | undefined;
  buildPatchRecord?: (existing: unknown, patch: unknown, client?: Principal) => MaybePromise<Record<string, unknown>>;
  /** transform entity before returning based on client (get / list only) */
  transformEntity?: (entity: unknown, client?: Principal) => MaybePromise<unknown>;
  /** Runs after a successful create / patch / delete, in the Firestore trigger shape. */
  afterWrite?: (change: WriteChange) => Promise<void>;
};

export type WriteChange = { id: string; before: unknown | null; after: unknown | null };

export type DomainInner = {
  resourceName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  repo: FirestoreRepo<any>;
  schemas: Schemas;
} & DomainHooks;

export type VerbHandlerResult = {
  get?: RequestHandler;
  list?: RequestHandler;
  create?: RequestHandler;
  patch?: RequestHandler;
  delete?: RequestHandler;
};

// ── Action endpoint (custom / non-CRUD) ─────────────────

/**
 * Definition for a single custom action endpoint on a resource.
 *
 * The resource builder wraps `run` with auth, schema validation,
 * entity fetching, and error handling — same pipeline as CRUD endpoints.
 *
 *   const budget = defineResource({
 *     inner: budgetDomain,
 *     endpoints: { get: …, list: … },
 *     actions: {
 *       close: {
 *         method: "post",
 *         path: "/:id/close",
 *         permission: "owner",
 *         rules: async (existing) => { … },
 *         run: async ({ id, existing, repo }) => {
 *           const updated = await repo.patch(id, { … });
 *           return { status: 200, body: { data: updated } };
 *         },
 *       },
 *     },
 *   });
 */
export type ActionDefinition = {
  /** HTTP method */
  method: "post" | "patch" | "delete" | "get";
  /** Express path pattern, e.g. "/:id/close" or "/current" */
  path: string;
  /** Minimum auth level required */
  permission: Permission;
  /** Zod schema for request body (POST/PATCH) or query (GET/DELETE) */
  inputSchema?: z.ZodType;
  /**
   * Authorize the action for the current client + entity.
   * Only called when `path` contains `:id` (entity is auto-fetched).
   * Throw to reject. Return void to allow.
   */
  authorize?: (existing: unknown, client?: Principal) => MaybePromise<void>;
  /**
   * Check business rules before running the action.
   * Receives the parsed input and the existing entity (if :id in path).
   * Throw to reject.
   */
  rules?: (existing: unknown, input: unknown, client?: Principal) => MaybePromise<void>;
  /**
   * Execute the action logic.
   * Return `{ status, body }` — the builder sends `res.status(status).json(body)`.
   */
  run: (params: {
    /** All URL params from Express (e.g. id, monthYear, …) */
    params: Record<string, string>;
    /** Parsed request body (POST/PATCH) or query (GET/DELETE) */
    input?: unknown;
    /** The entity fetched via `:id` (only when path includes `:id`) */
    existing?: unknown;
    client?: Principal;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo: FirestoreRepo<any>;
  }) => Promise<{ status?: number; body: unknown }>;
};

export type ActionHandlerResult = Record<string, RequestHandler>;
