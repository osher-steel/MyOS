import assert from "node:assert/strict";
import test from "node:test";
import { defineListQuery } from "../../src/core/firestore/firestoreQuery.js";
import { dateFilter, numFilter, stringFilter } from "../../src/validators/common.js";

test("string filter accepts shorthand and bracket forms", () => {
  assert.deepEqual(stringFilter.parse("open"), { eq: "open" });
  assert.deepEqual(stringFilter.parse({ prefix: "gro" }), { prefix: "gro" });
  assert.deepEqual(stringFilter.parse({ in: "a, b,c" }), { in: ["a", "b", "c"] });
  assert.equal(stringFilter.safeParse({ eq: "a", neq: "b" }).success, false);
});

test("number and date filters coerce query-string values", () => {
  assert.deepEqual(numFilter.parse("42"), { eq: 42 });
  assert.deepEqual(numFilter.parse({ gte: "1", lt: "10" }), { gte: 1, lt: 10 });
  const parsed = dateFilter.parse({ gte: "2026-03-01" });
  assert.ok(parsed.gte instanceof Date);
});

test("defineListQuery derives sortable fields and rejects unknown keys", () => {
  const { schema, filterFields } = defineListQuery([
    { key: "monthYear", type: "stringFilter", sortable: true },
    { key: "amount", type: "number" },
  ] as const);

  const parsed = schema.parse({ monthYear: "2026-03", amount: { gt: "0" } });
  assert.equal(parsed.sortField, "monthYear");
  assert.equal(parsed.sortDir, "asc");
  assert.equal(parsed.limit, 1000);
  assert.deepEqual(parsed.amount, { gt: 0 });
  assert.deepEqual(filterFields.map((f) => f.key), ["monthYear", "amount"]);

  assert.equal(schema.safeParse({ bogus: "x" }).success, false);
  assert.equal(schema.safeParse({ sortField: "amount" }).success, false);
});
