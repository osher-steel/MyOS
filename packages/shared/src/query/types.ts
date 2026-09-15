/** Operators the backend supports in query params. */
export type QueryFilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "prefix"
  | "arrayContains"
  | "in"
  | "queryParam";

/** A single filter applied to a list query. */
export type ResourceQueryFilter = {
  field: string;
  operator: QueryFilterOperator;
  value: string;
};

/** The full query shape used by ResourcePage controls. */
export type ResourceQuery = {
  filters: ResourceQueryFilter[];
  limit: number;
  sortDir: "asc" | "desc";
  sortField: string;
};

/** Sort direction for list queries. */
export type SortDir = "asc" | "desc";

/** Serialisable value types for query filters. */
export type QueryValue = string | number | boolean | Date | string[];
