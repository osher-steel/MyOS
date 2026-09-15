import { ServiceForbiddenError } from "../errors/errors.js";

type ListQuery = Record<string, unknown>;

/**
 * Extract the `eq` value from a parsed string filter, rejecting every other
 * operator. Ownership filters must be exact-match — `neq`, `prefix`, and `in`
 * would let a caller widen the result set past their own records
 * (e.g. `?userId[neq]=me` matches everyone else's rows).
 */
export function requireEqFilter(query: ListQuery, field: string): string {
  const filter = query[field];
  if (typeof filter === "string") return filter;
  if (filter && typeof filter === "object") {
    const eq = (filter as Record<string, unknown>).eq;
    if (typeof eq === "string") return eq;
  }
  throw new ServiceForbiddenError("Forbidden");
}

/** Require the field to be an exact-match filter on the client's own id. */
export function assertOwnEqFilter(query: ListQuery, field: string, ownerId: string): void {
  if (requireEqFilter(query, field) !== ownerId) {
    throw new ServiceForbiddenError("Forbidden");
  }
}

/**
 * Scope a list query to the client's own records: if the ownership field is
 * present it must be an exact match on the client's id; if absent it is
 * injected so an unfiltered list never leaks other users' records.
 */
export function scopeQueryToOwner(query: ListQuery, field: string, ownerId: string): ListQuery {
  if (query[field] === undefined) {
    return { ...query, [field]: { eq: ownerId } };
  }
  assertOwnEqFilter(query, field, ownerId);
  return query;
}
