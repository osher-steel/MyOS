import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentErrors,
  GoalAllocationReason,
  LineEntryStatus,
  monthReport,
  monthSavingsShares,
  PlaidTransactionStatus,
  savingsSummary,
  transferErrors,
  type Budget,
  type LineEntryView,
} from "@myos/shared";
import { goalAllocationPostSchema, goalTransferSchema } from "../../../src/domains/goalAllocations/goalAllocations.schemas.js";
import { goalPatchSchema, goalPostSchema } from "../../../src/domains/goals/goals.schemas.js";

const budget: Budget = {
  id: "u_2026-10",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  income: 500000,
  needs: { Rent: 200000 },
  wants: { Fun: 100000 },
  savings: { Emergency: 150000, Travel: 50000 },
};

function row(amount: number, fields: Partial<LineEntryView>): LineEntryView {
  return {
    id: `${fields.label ?? fields.goalId}-${amount}`,
    name: "x",
    amount,
    date: "2026-10-10",
    monthYear: "2026-10",
    currency: "USD",
    plaidStatus: PlaidTransactionStatus.POSTED,
    osStatus: LineEntryStatus.LABELLED,
    ...fields,
  };
}

test("the savings result is planned savings moved by the spending variance, and can go negative", () => {
  const under = monthReport("2026-10", budget, [row(200000, { label: "Rent" }), row(80000, { label: "Fun" })]);
  assert.equal(under.savingsResult, 220000);
  const over = monthReport("2026-10", budget, [row(200000, { label: "Rent" }), row(350000, { label: "Fun" })]);
  assert.equal(over.savingsResult, -50000);
  assert.deepEqual(monthSavingsShares(over), []);
});

test("a goal purchase shows in the report but doesn't make the month overspent", () => {
  const report = monthReport("2026-10", budget, [
    row(200000, { label: "Rent" }),
    row(100000, { label: "Fun" }),
    row(1500000, { goalId: "g_car" }),
  ]);
  assert.equal(report.goalSpent, 1500000);
  assert.equal(report.spent, 1800000);
  assert.equal(report.variance, 0);
  assert.equal(report.savingsResult, 200000);
});

test("a month assignment must match the month's sign and not exceed what's left", () => {
  const base = { goalName: "Car", goalBalance: 30000, unassigned: 0 };
  assert.deepEqual(assignmentErrors({ ...base, amount: 20000, monthRemaining: 50000 }), []);
  assert.match(assignmentErrors({ ...base, amount: 60000, monthRemaining: 50000 })[0]!, /Only \$500\.00 of this month/);
  assert.match(assignmentErrors({ ...base, amount: 100, monthRemaining: -5000 })[0]!, /overspent/);
  assert.deepEqual(assignmentErrors({ ...base, amount: -5000, monthRemaining: -5000 }), []);
  assert.match(assignmentErrors({ ...base, amount: -40000, monthRemaining: -50000 })[0]!, /Car only holds \$300\.00/);
  assert.match(assignmentErrors({ ...base, amount: 100, monthRemaining: 0 })[0]!, /fully assigned/);
});

test("moving from unassigned savings is limited to what is unassigned", () => {
  const base = { goalName: "Car", goalBalance: 0 };
  assert.deepEqual(assignmentErrors({ ...base, amount: 5000, unassigned: 5000 }), []);
  assert.match(assignmentErrors({ ...base, amount: 5001, unassigned: 5000 })[0]!, /Only \$50\.00 of savings is unassigned/);
});

test("a transfer needs two goals, a positive amount and enough in the source", () => {
  const base = { fromName: "Travel", fromBalance: 10000, sameGoal: false };
  assert.deepEqual(transferErrors({ ...base, amount: 10000 }), []);
  assert.match(transferErrors({ ...base, amount: 10001 })[0]!, /Travel only holds \$100\.00/);
  assert.equal(transferErrors({ ...base, sameGoal: true, amount: 1 }).length, 1);
});

test("the summary counts months from the start, nets transfers and spends, and tracks what's left to assign", () => {
  const state = { startMonth: "2026-10", opening: { amount: 1000000, balance: 1500000, allocated: 500000, computedAt: new Date() } };
  const reports = [
    { monthYear: "2026-09", savingsResult: 999999 },
    { monthYear: "2026-10", savingsResult: 200000 },
    { monthYear: "2026-11", savingsResult: -50000 },
  ];
  const allocations = [
    { reason: GoalAllocationReason.ASSIGNMENT, monthYear: "2026-10", amount: 150000 },
    { reason: GoalAllocationReason.ASSIGNMENT, amount: 300000 },
    { reason: GoalAllocationReason.TRANSFER, monthYear: "2026-10", amount: -40000 },
    { reason: GoalAllocationReason.TRANSFER, monthYear: "2026-10", amount: 40000 },
    { reason: GoalAllocationReason.GOAL_SPEND, monthYear: "2026-11", amount: -100000 },
  ];
  const summary = savingsSummary(state, reports, allocations, [400000, -50000]);

  assert.deepEqual(summary.months, [
    { monthYear: "2026-10", result: 200000, assigned: 150000, remaining: 50000 },
    { monthYear: "2026-11", result: -50000, assigned: 0, remaining: -50000 },
  ]);
  assert.equal(summary.unassigned, 1000000 + 200000 - 50000 - 150000 - 300000);
  assert.equal(summary.inGoals, 350000);
  assert.equal(summary.total, 1000000 + 200000 - 50000 - 100000);
});

test("assignments are the only allocation created directly, and goal names can't change", () => {
  const post = { goalId: "g1", monthYear: "2026-10", amount: -500 };
  assert.equal(goalAllocationPostSchema.safeParse(post).success, true);
  assert.equal(goalAllocationPostSchema.safeParse({ goalId: "g1", amount: 500 }).success, true);
  assert.equal(goalAllocationPostSchema.safeParse({ ...post, reason: GoalAllocationReason.TRANSFER }).success, false);
  assert.equal(goalAllocationPostSchema.safeParse({ ...post, amount: 0 }).success, false);
  assert.equal(goalTransferSchema.safeParse({ fromGoalId: "a", toGoalId: "b", amount: -1, monthYear: "2026-10" }).success, false);
  assert.equal(goalPostSchema.safeParse({ name: "Car", targetAmount: 2000000 }).success, true);
  assert.equal(goalPatchSchema.safeParse({ name: "Truck" }).success, false);
});
