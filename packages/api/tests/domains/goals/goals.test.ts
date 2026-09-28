import assert from "node:assert/strict";
import test from "node:test";
import {
  deficitCoverErrors,
  GoalAllocationReason,
  LineEntryStatus,
  monthReport,
  monthSavingsShares,
  PlaidTransactionStatus,
  uncoveredDeficit,
  type Budget,
  type LineEntryView,
} from "@myos/shared";
import { goalAllocationPostSchema } from "../../../src/domains/goalAllocations/goalAllocations.schemas.js";
import { goalPatchSchema, goalPostSchema } from "../../../src/domains/goals/goals.schemas.js";

const budget: Budget = {
  id: "u_2026-08",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  income: 500000,
  needs: { Rent: 200000 },
  wants: { Fun: 100000 },
  savings: { Emergency: 150000, Travel: 50000 },
};

function spend(amount: number, label: string): LineEntryView {
  return {
    id: `${label}-${amount}`,
    name: label,
    amount,
    date: "2026-08-10",
    monthYear: "2026-08",
    currency: "USD",
    label,
    plaidStatus: PlaidTransactionStatus.POSTED,
    osStatus: LineEntryStatus.LABELLED,
  };
}

test("month savings shares split what was kept across savings categories in whole cents", () => {
  const report = monthReport("2026-08", budget, [spend(200000, "Rent"), spend(133333, "Fun")]);
  const shares = monthSavingsShares(report);
  assert.deepEqual(shares, [
    { name: "Emergency", amount: 125000 },
    { name: "Travel", amount: 41667 },
  ]);
  assert.equal(shares.reduce((sum, share) => sum + share.amount, 0), 200000 - 33333);
});

test("a month that eats all its savings has no shares and reports the uncovered deficit", () => {
  const report = monthReport("2026-08", budget, [spend(200000, "Rent"), spend(350000, "Fun")]);
  assert.deepEqual(monthSavingsShares(report), []);
  assert.equal(report.balanceDeduction, 50000);
  assert.equal(uncoveredDeficit(report, 20000), 30000);
  assert.equal(uncoveredDeficit(report, 90000), 0);
});

test("a deficit cover must draw, fit in the goal, and not exceed what is uncovered", () => {
  const base = { monthYear: "2026-08", goalSaved: 40000, uncovered: 30000 };
  assert.deepEqual(deficitCoverErrors({ ...base, amount: -30000 }), []);
  assert.equal(deficitCoverErrors({ ...base, amount: 100 }).length, 1);
  assert.match(deficitCoverErrors({ ...base, amount: -35000 })[0]!, /only has \$300\.00 of deficit/);
  assert.match(deficitCoverErrors({ ...base, goalSaved: 1000, amount: -2000 })[0]!, /only holds \$10\.00/);
});

test("allocations can't be written as month savings or for zero, and goal names can't change", () => {
  const post = { goalId: "g1", monthYear: "2026-08", amount: -500, reason: GoalAllocationReason.DEFICIT_COVER };
  assert.equal(goalAllocationPostSchema.safeParse(post).success, true);
  assert.equal(goalAllocationPostSchema.safeParse({ ...post, reason: GoalAllocationReason.MONTH_SAVINGS }).success, false);
  assert.equal(goalAllocationPostSchema.safeParse({ ...post, amount: 0 }).success, false);
  assert.equal(goalAllocationPostSchema.safeParse({ ...post, amount: 1.5 }).success, false);

  assert.equal(goalPostSchema.safeParse({ name: "Travel", targetAmount: 300000 }).success, true);
  assert.equal(goalPatchSchema.safeParse({ name: "Trips" }).success, false);
});
