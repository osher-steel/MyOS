/**
 * resourceBuilder — per-verb handler builders for CRUD endpoints.
 *
 * Each builder returns a RequestHandler that validates input, resolves auth,
 * and conditionally runs the hooks declared in the endpoint flags.
 *
 * Usage:
 *
 *   import { defineHandlers } from "../../core/resourceBuilder.js";
 *   import { venueDomain } from "./venues.domain.js";
 *
 *   const { get, list, create, patch, delete: del } = defineHandlers({
 *     inner: venueDomain,
 *     endpoints: {
 *       get:    { permission: "none" },
 *       list:   { permission: "none" },
 *       create: { permission: "owner" },
 *       patch:  { permission: "owner" },
 *       delete: { permission: "owner" },
 *     },
 *   });
 *
 *   venuesRouter.get("/:id", get);
 *   venuesRouter.get("/",    list);
 *   venuesRouter.post("/",   create);
 *   venuesRouter.patch("/:id", patch);
 *   venuesRouter.delete("/:id", del);
 *
 * The endpoint flags are validated at module load — if a flag requires a hook
 * that isn't defined on the domain, the process crashes with a clear message.
 */

import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { processError } from "../errors/errorResponses.js";
import { ServiceForbiddenError, ServiceValidationError } from "../errors/errors.js";
import type { BaseListQuery } from "../firestore/firestoreQuery.js";
import { isOwner, resolvePermission } from "./resourceBuilder.auth.js";
import type {
  DomainInner,
  DomainHooks,
  EndpointFlags,
  VerbHandlerResult,
  ActionDefinition,
  ActionHandlerResult,
  Permission,
} from "./resourceBuilder.types.js";

// ── Schema validation helper ─────────────────────────────

export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ServiceValidationError(`Invalid ${label}.`, r.error.flatten());
  }
  return r.data;
}

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(msg);
}

// ── Default permission per verb ──────────────────────────

type Verb = "get" | "list" | "create" | "patch" | "delete";

const DEFAULT_PERMISSION: Record<Verb, Permission> = {
  get: "none",
  list: "none",
  create: "owner",
  patch: "owner",
  delete: "owner",
};

// ── Hook validation map ──────────────────────────────────
//
// The `ownership` flag only applies to get/list — those are the only verbs
// where public access makes sense (e.g. venues are public, bookings are not).
// For create/patch/delete the authorize* hook always runs when defined;
// no flag is needed to opt in.
//
// Ownership validation is bidirectional: the flag without the hook is a
// misconfiguration, and the hook without an explicit flag fails closed at
// boot — a domain that defines authorizeGet/authorizeList almost certainly
// wants it enforced, so silence is treated as a forgotten flag rather than
// an opt-out. Endpoints opt out with `ownership: false`.

const REQUIRED_HOOKS: Record<Verb, Record<string, keyof DomainHooks>> = {
  get:    { ownership: "authorizeGet",    transform: "transformEntity" },
  list:   { ownership: "authorizeList",   transform: "transformEntity" },
  create: {},
  patch:  {},
  delete: {},
};

function validateFlags(resourceName: string, verb: Verb, flags: EndpointFlags, hooks: DomainHooks) {
  for (const [flag, hook] of Object.entries(REQUIRED_HOOKS[verb])) {
    const flagValue = (flags as unknown as Record<string, boolean | undefined>)[flag as string];
    if (flagValue && !hooks[hook]) {
      throw new Error(
        `[resourceBuilder] "${resourceName}" endpoint "${verb}" flags ${flag}=true ` +
        `but inner.${hook} is not defined.`
      );
    }
    if (flag === "ownership" && hooks[hook] && flagValue === undefined) {
      throw new Error(
        `[resourceBuilder] "${resourceName}" defines inner.${hook} but endpoint "${verb}" ` +
        `does not declare ownership. Set ownership: true, or ownership: false to opt out.`
      );
    }
  }
}

// ── Handler builders ─────────────────────────────────────

function buildGetHandler(inner: DomainInner, flags: EndpointFlags): RequestHandler {
  validateFlags(inner.resourceName, "get", flags, inner);

  return async (req, res) => {
    const permission = flags.permission ?? DEFAULT_PERMISSION.get;

    try {
      const client = await resolvePermission(req, permission);
      let entity = await inner.repo.get(req.params.id as string);

      if (flags.ownership && inner.authorizeGet) {
        if(!client) throw new ServiceForbiddenError("Forbidden");
        if (!isOwner(client)) await inner.authorizeGet(entity, client);
      }
      if (flags.transform && inner.transformEntity) {
        entity = await inner.transformEntity(entity, client);
      }
      res.status(200).json({ data: entity });
    } catch (error) {
      processError(res, error, `Failed to fetch ${inner.resourceName}`);
    }
  };
}

function buildListHandler(inner: DomainInner, flags: EndpointFlags): RequestHandler {
  validateFlags(inner.resourceName, "list", flags, inner);
  assert(inner.schemas.query, `${inner.resourceName} list requires querySchema`);

  return async (req, res) => {
    const permission = flags.permission ?? DEFAULT_PERMISSION.list;

    try {
      const client = await resolvePermission(req, permission);
      let query = parseOrThrow(inner.schemas.query!, req.query, "query params") as BaseListQuery;

      if (flags.ownership && inner.authorizeList) {
        if(!client) throw new ServiceForbiddenError("Forbidden");
        if (!isOwner(client)) {
          query = await inner.authorizeList(
            query as unknown as Record<string, unknown>,
            client
          ) as unknown as BaseListQuery;
        }
      }

      const result = await inner.repo.list(query);

      if (flags.transform && inner.transformEntity) {
        result.data = await Promise.all(
          result.data.map((item) => inner.transformEntity!(item, client))
        ) as typeof result.data;
      }
      res.status(200).json({ data: result.data, cursor: result.cursor, total: result.total });
    } catch (error) {
      processError(res, error, `Failed to list ${inner.resourceName}s`);
    }
  };
}

function buildCreateHandler(inner: DomainInner, flags: EndpointFlags): RequestHandler {
  validateFlags(inner.resourceName, "create", flags, inner);
  assert(inner.schemas.create, `${inner.resourceName} create requires createSchema`);
  assert(inner.schemas.record, `${inner.resourceName} create requires recordSchema`);

  return async (req, res) => {
    const permission = flags.permission ?? DEFAULT_PERMISSION.create;

    try {
      const client = await resolvePermission(req, permission);
      const input = parseOrThrow(inner.schemas.create!, req.body, `${inner.resourceName} payload`);

      // buildCreateRecord owns the rest of the pipeline: fetch derived data,
      // check ownership (godmode-exempt) and business rules, assemble record.
      let final = input;
      if(inner.buildCreateRecord){
        final = await inner.buildCreateRecord(input, client);
      }

      const record = parseOrThrow(inner.schemas.record!, final, `${inner.resourceName} record`);
      const id = inner.createId?.(input, { uid: req.uid, client });
      const entity = await inner.repo.create(record, id);
      await inner.afterWrite?.({ id: entity.id, before: null, after: entity });
      res.status(201).json({ data: entity });
    } catch (error) {
      processError(res, error, `Failed to create ${inner.resourceName}`);
    }
  };
}

function buildPatchHandler(inner: DomainInner, flags: EndpointFlags): RequestHandler {
  validateFlags(inner.resourceName, "patch", flags, inner);
  assert(inner.schemas.patch, `${inner.resourceName} patch requires patchSchema`);

  return async (req, res) => {
    const permission = flags.permission ?? DEFAULT_PERMISSION.patch;

    try {
      const client = await resolvePermission(req, permission);
      if (!client) throw new ServiceForbiddenError("Forbidden");

      // Select schema based on caller type
      const schema = isOwner(client)
        ? (inner.schemas.adminPatch ?? inner.schemas.patch!)
        : inner.schemas.patch!;
      const patch = parseOrThrow(schema, req.body, `${inner.resourceName} patch`);

      const id = req.params.id as string;
      const existing = await inner.repo.get(id);

      if (!isOwner(client) && inner.authorizePatch) {
        await inner.authorizePatch!(existing, patch, client);
      }

      let final = patch;
      if(inner.buildPatchRecord){
        final = await inner.buildPatchRecord(existing, patch, client);
      }
      const entity = await inner.repo.patch(id, final as Record<string, unknown>);
      await inner.afterWrite?.({ id, before: existing, after: entity });
      res.status(200).json({ data: entity });
    } catch (error) {
      processError(res, error, `Failed to patch ${inner.resourceName}`);
    }
  };
}

function buildDeleteHandler(inner: DomainInner, flags: EndpointFlags): RequestHandler {
  validateFlags(inner.resourceName, "delete", flags, inner);

  return async (req, res) => {
    const permission = flags.permission ?? DEFAULT_PERMISSION.delete;

    try {
      const client = await resolvePermission(req, permission);
      if (!client) throw new ServiceForbiddenError("Forbidden");

      const id = req.params.id as string;
      const existing = inner.afterWrite ? await inner.repo.get(id) : null;
      await inner.repo.delete(id);
      await inner.afterWrite?.({ id, before: existing, after: null });
      res.status(204).send();
    } catch (error) {
      processError(res, error, `Failed to delete ${inner.resourceName}`);
    }
  };
}

// ── Action handler builder ──────────────────────────────

function buildActionHandler(
  inner: DomainInner,
  actionName: string,
  def: ActionDefinition
): RequestHandler {
  const fetchesEntity = def.path.includes(":id");

  return async (req, res) => {
    try {
      const client = await resolvePermission(req, def.permission);

      // Parse input body / query
      let input: unknown = undefined;
      if (def.inputSchema) {
        const source = def.method === "get" || def.method === "delete" ? req.query : req.body;
        input = parseOrThrow(def.inputSchema, source, `${inner.resourceName} action "${actionName}" input`);
      }

      // Fetch entity if the path references :id
      let existing: unknown = undefined;
      if (fetchesEntity) {
        existing = await inner.repo.get(req.params.id as string);
      }

      // Authorize
      if (def.authorize && existing !== undefined) {
        await def.authorize(existing, client);
      }

      // Rules
      if (def.rules) {
        await def.rules(existing, input, client);
      }

      // Run the action
      const result = await def.run({
        params: req.params as Record<string, string>,
        input,
        existing,
        client,
        repo: inner.repo,
      });

      res.status(result.status ?? 200).json(result.body);
    } catch (error) {
      processError(res, error, `Failed to execute ${inner.resourceName} action "${actionName}"`);
    }
  };
}

// ── Public API ───────────────────────────────────────────

const BUILDERS: Record<Verb, (inner: DomainInner, flags: EndpointFlags) => RequestHandler> = {
  get: buildGetHandler,
  list: buildListHandler,
  create: buildCreateHandler,
  patch: buildPatchHandler,
  delete: buildDeleteHandler,
};

/**
 * Define handlers for a resource's CRUD endpoints.
 * Validates at call time that every flagged endpoint has its hooks defined.
 * Returns an object with handlers for each declared endpoint.
 */
export function defineHandlers(config: {
  inner: DomainInner;
  endpoints: Partial<Record<Verb, EndpointFlags>>;
}): VerbHandlerResult {
  const { inner, endpoints } = config;
  const result: VerbHandlerResult = {};

  for (const [verb, flags] of Object.entries(endpoints)) {
    const v = verb as Verb;
    const build = BUILDERS[v];
    result[v] = build(inner, flags!);
  }

  return result;
}

/**
 * Define a resource's CRUD handlers + custom actions and return both the handlers
 * and a pre-configured router with all routes mounted.
 *
 * The returned router uses bare paths ("/:id", "/") so it is portable —
 * mount it at the desired base path, e.g.:
 *
 *   const booking = defineResource({
 *     inner: bookingDomain,
 *     endpoints: { get: …, list: … },
 *     actions: {
 *       cancel: {
 *         method: "post",
 *         path: "/:id/cancel",
 *         permission: "owner",
 *         …
 *       },
 *     },
 *   });
 *   router.use("/bookings", booking.router);
 *   // or access individual handlers: booking.handlers.get
 *   // or action handlers:      booking.handlers.cancel
 */
export function defineResource(config: {
  inner: DomainInner;
  endpoints: Partial<Record<Verb, EndpointFlags>>;
  actions?: Record<string, ActionDefinition>;
}): {
  handlers: VerbHandlerResult & ActionHandlerResult;
  router: Router;
} {
  const handlers = defineHandlers(config);
  const router = Router();
  // Router is mounted by the caller at the desired base path (e.g. "/bookings").
  // The routes below use bare paths ("/:id", "/") so the router is portable.

  // Mount custom actions first so static action paths like "/search"
  // aren't shadowed by the "/:id" CRUD routes below
  if (config.actions) {
    for (const [name, def] of Object.entries(config.actions)) {
      const handler = buildActionHandler(config.inner, name, def);
      (handlers as Record<string, RequestHandler>)[name] = handler;
      router[def.method](def.path, handler);
    }
  }

  if (handlers.get)     router.get("/:id", handlers.get);
  if (handlers.list)    router.get("/", handlers.list);
  if (handlers.create)  router.post("/", handlers.create);
  if (handlers.patch)   router.patch("/:id", handlers.patch);
  if (handlers.delete)  router.delete("/:id", handlers.delete);

  return { handlers: handlers as VerbHandlerResult & ActionHandlerResult, router };
}