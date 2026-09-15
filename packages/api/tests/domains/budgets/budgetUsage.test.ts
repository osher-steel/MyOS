import assert from "node:assert/strict";
import test from "node:test";
import { BudgetGroup, budgetUsage, type Budget } from "@myos/shared";

const budget: Budget = {
  id: "u_2026-09",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  income: 5000,
  needs: { Rent: 1500, Groceries: 400 },
  wants: { "Eating out": 200 },
  savings: { Emergency: 600, Travel: 400 },
};

const byGroup = (usage: ReturnType<typeof budgetUsage>, group: BudgetGroup) =>
  usage.groups.find((g) => g.group === group)!;

test("spending groups sum category usage and savings stays at its allocation mid-month", () => {
  const usage = budgetUsage(budget, { Rent: 1500, Groceries: 350 });
  assert.equal(usage.allocated, 3100);
  assert.equal(usage.unallocated, 1900);
  assert.deepEqual(
    byGroup(usage, BudgetGroup.NEEDS).categories.map((c) => [c.name, c.used, c.allocated]),
    [["Rent", 1500, 1500], ["Groceries", 350, 400]],
  );
  assert.equal(byGroup(usage, BudgetGroup.NEEDS).used, 1850);
  assert.equal(usage.variance, 250);
  assert.equal(byGroup(usage, BudgetGroup.SAVINGS).used, 1000);
});

test("overspend, including unlabelled outflows, eats savings in proportion to its categories", () => {
  const usage = budgetUsage(budget, { Rent: 1500, Groceries: 500, "Eating out": 200 }, { unlabelledSpent: 100 });
  assert.equal(usage.variance, -200);
  const savings = byGroup(usage, BudgetGroup.SAVINGS);
  assert.equal(savings.used, 800);
  assert.deepEqual(savings.categories.map((c) => [c.name, c.used]), [["Emergency", 480], ["Travel", 320]]);
});

test("savings never goes below zero", () => {
  const usage = budgetUsage(budget, { Rent: 1000, "Eating out": 2500 });
  assert.equal(byGroup(usage, BudgetGroup.SAVINGS).used, 0);
});

test("at close, underspend flows into savings", () => {
  const usage = budgetUsage(budget, { Rent: 1500, Groceries: 350 }, { closing: true });
  assert.equal(byGroup(usage, BudgetGroup.SAVINGS).used, 1250);
});
