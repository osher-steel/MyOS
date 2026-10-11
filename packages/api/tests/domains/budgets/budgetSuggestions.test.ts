import assert from "node:assert/strict";
import test from "node:test";
import { BudgetGroup, budgetSuggestions, DEFAULT_CATEGORIES, toMonthYear, type Budget } from "@myos/shared";

const month = (id: string, needs: Record<string, number>): Budget => ({
  id,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  income: 0,
  needs,
  wants: {},
  savings: {},
});

test("suggestions use the newest amount for each past name, then unused defaults", () => {
  const suggestions = budgetSuggestions(
    [month("u_2026-09", { Rent: 50000, Healthcare: 27800 }), month("u_2026-10", { Rent: 60000, Dog: 4000 })],
    BudgetGroup.NEEDS,
  );
  assert.deepEqual(suggestions.slice(0, 3), [
    { name: "Rent", amount: 60000 },
    { name: "Dog", amount: 4000 },
    { name: "Healthcare", amount: 27800 },
  ]);
  assert.equal(suggestions.filter(({ name }) => name === "Rent").length, 1);
  assert.equal(suggestions.length, 3 + DEFAULT_CATEGORIES[BudgetGroup.NEEDS].length - 2);
});

test("the open month follows New York time, not the server's", () => {
  assert.equal(toMonthYear(new Date("2026-11-01T03:30:00Z")), "2026-10");
  assert.equal(toMonthYear(new Date("2026-11-01T05:00:00Z")), "2026-11");
});
