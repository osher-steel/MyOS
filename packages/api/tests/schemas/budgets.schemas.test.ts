import assert from "node:assert/strict";
import test from "node:test";
import { budgetQuerySchema } from "../../src/domains/budgets/budgets.query.js";
import { budgetPatchSchema, budgetPostSchema, budgetRecordSchema } from "../../src/domains/budgets/budgets.schemas.js";

const groups = {
  income: 4000,
  needs: { Rent: 1800, Groceries: 500 },
  wants: { "Eating out": 250 },
  savings: { Emergency: 400 },
};

test("budget create accepts income, groups, and an optional month", () => {
  assert.ok(budgetPostSchema.safeParse(groups).success);
  const parsed = budgetPostSchema.parse({ ...groups, monthYear: "2026-09" });
  assert.equal(parsed.monthYear, "2026-09");
  assert.equal(parsed.income, 4000);
});

test("budget create rejects bad months, negative amounts, unknown keys, and missing income", () => {
  assert.equal(budgetPostSchema.safeParse({ ...groups, monthYear: "09-2026" }).success, false);
  assert.equal(budgetPostSchema.safeParse({ ...groups, needs: { Rent: -1 } }).success, false);
  assert.equal(budgetPostSchema.safeParse({ ...groups, id: "x" }).success, false);
  assert.equal(budgetPostSchema.safeParse({ ...groups, createdAt: new Date() }).success, false);
  const { income: _income, ...noIncome } = groups;
  assert.equal(budgetPostSchema.safeParse(noIncome).success, false);
});

test("budget create rejects duplicate categories and allocations above income", () => {
  const dup = budgetPostSchema.safeParse({ ...groups, wants: { Groceries: 100 } });
  assert.equal(dup.success, false);
  assert.match(JSON.stringify(dup.error?.issues), /more than one group: Groceries/);

  const over = budgetPostSchema.safeParse({ ...groups, income: 2000 });
  assert.equal(over.success, false);
  assert.match(JSON.stringify(over.error?.issues), /Allocations \(2950\) exceed income \(2000\)/);
});

test("budget patch requires at least one field and nothing else", () => {
  assert.equal(budgetPatchSchema.safeParse({}).success, false);
  assert.equal(budgetPatchSchema.safeParse({ updatedAt: new Date() }).success, false);
  assert.ok(budgetPatchSchema.safeParse({ wants: { Travel: 300 } }).success);
  assert.ok(budgetPatchSchema.safeParse({ income: 5000 }).success);
});

test("budget record requires server timestamps and income", () => {
  assert.equal(budgetRecordSchema.safeParse(groups).success, false);
  assert.ok(budgetRecordSchema.safeParse({ ...groups, createdAt: new Date(), updatedAt: new Date() }).success);
});

test("budget list query sorts by id by default and accepts timestamp ranges", () => {
  const parsed = budgetQuerySchema.parse({});
  assert.equal(parsed.sortField, "id");

  const ranged = budgetQuerySchema.parse({
    id: { prefix: "u123_2026" },
    updatedAt: { gte: "2026-01-01" },
    sortField: "updatedAt",
    sortDir: "desc",
  });
  assert.deepEqual(ranged.id, { prefix: "u123_2026" });
  assert.ok(ranged.updatedAt && "gte" in ranged.updatedAt && ranged.updatedAt.gte instanceof Date);

  assert.equal(budgetQuerySchema.safeParse({ sortField: "needs" }).success, false);
});
