import type { QueryValue, SortDir } from "./types.js";

function serializeValue(value: QueryValue): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/**
 * Fluent query builder for Personal OS list endpoints.
 *
 * Produces a flat key-value record using the backend's bracket-notation
 * filter format (e.g. `date[gte]=2024-06-01`).  Call `toQuery()` to get
 * the serialised params, then pass them through `toQueryString()` to build
 * a URL query string.
 */
export class RequestBuilder {
  private params: Record<string, string> = {};
  private filters: Record<string, Record<string, string>> = {};
  private inFilters: Record<string, string[]> = {};

  // -- equality / comparison ------------------------------------------------

  eq(field: string, value: QueryValue): this {
    return this.addFilter(field, "eq", value);
  }

  neq(field: string, value: QueryValue): this {
    return this.addFilter(field, "neq", value);
  }

  gt(field: string, value: QueryValue): this {
    return this.addFilter(field, "gt", value);
  }

  gte(field: string, value: QueryValue): this {
    return this.addFilter(field, "gte", value);
  }

  lt(field: string, value: QueryValue): this {
    return this.addFilter(field, "lt", value);
  }

  lte(field: string, value: QueryValue): this {
    return this.addFilter(field, "lte", value);
  }

  // -- string / array operators ---------------------------------------------

  prefix(field: string, value: string): this {
    return this.addFilter(field, "prefix", value);
  }

  arrayContains(field: string, value: string): this {
    return this.addFilter(field, "arrayContains", value);
  }

  in(field: string, values: string[]): this {
    if (values.length === 0) {
      throw new Error("in() requires at least one value.");
    }
    this.inFilters[field] = [...(this.inFilters[field] ?? []), ...values];
    return this;
  }

  // -- pagination / sorting -------------------------------------------------

  sort(field: string, direction: SortDir = "asc"): this {
    this.params.sortField = field;
    this.params.sortDir = direction;
    return this;
  }

  limit(value: number): this {
    this.params.limit = String(value);
    return this;
  }

  cursor(value: string): this {
    this.params.cursor = value;
    return this;
  }

  includeTotal(value = true): this {
    this.params.includeTotal = value ? "true" : "false";
    return this;
  }

  // -- output ---------------------------------------------------------------

  /**
   * Returns the built query as a flat key-value record.
   *
   * Filter keys use bracket notation (`field[op]`).  `in` filters produce
   * `field[in][]` entries whose values are string arrays.
   */
  toQuery(): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = { ...this.params };

    for (const [field, ops] of Object.entries(this.filters)) {
      for (const [op, val] of Object.entries(ops)) {
        result[`${field}[${op}]`] = val;
      }
    }

    for (const [field, values] of Object.entries(this.inFilters)) {
      if (values.length > 0) {
        result[`${field}[in][]`] = values;
      }
    }

    return result;
  }

  // -- internal -------------------------------------------------------------

  private addFilter(field: string, op: string, value: QueryValue): this {
    if (!this.filters[field]) {
      this.filters[field] = {};
    }
    this.filters[field][op] = serializeValue(value);
    return this;
  }
}
