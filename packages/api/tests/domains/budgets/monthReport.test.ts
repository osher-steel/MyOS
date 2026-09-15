import assert from "node:assert/strict";
import test from "node:test";
import {
  LineEntryStatus,
  MonthOutcome,
  monthReport,
  PlaidTransactionStatus,
  type Budget,
  type LineEntryView,
} from "@myos/shared";

const budget: Budget = {
  id: "u_2026-08",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  income: 4200,
  needs: { Rent: 1800 },
  wants: { Fun: 1400 },
  savings: { Emergency: 1000 },
};

let seq = 0;
function row(amount: number, label?: string): LineEntryView {
  seq += 1;
  return {
    id: `r${seq}`,
    name: label ?? "credit",
    amount,
    date: "2026-08-10",
    monthYear: "2026-08",
    currency: "USD",
    ...(label ? { label } : {}),
    plaidStatus: PlaidTransactionStatus.POSTED,
    osStatus: label ? LineEntryStatus.LABELLED : LineEntryStatus.NOT_LABELLED,
  };
}

test("under allocation adds the surplus to savings", () => {
  const report = monthReport("2026-08", budget, [row(-4200), row(1500, "Rent"), row(1200, "Fun")]);
  assert.equal(report.entry, 4200);
  assert.equal(report.spent, 2700);
  assert.equal(report.variance, 500);
  assert.equal(report.savingsActual, 1500);
  assert.equal(report.outcome, MonthOutcome.UNDER);
  assert.equal(report.incomeShortfall, 0);
});

test("over allocation is taken out of savings, unlabelled spend included", () => {
  const report = monthReport("2026-08", budget, [row(-4200), row(1800, "Rent"), row(1400, "Fun"), row(500)]);
  assert.equal(report.unlabelledSpent, 500);
  assert.equal(report.variance, -500);
  assert.equal(report.savingsActual, 500);
  assert.equal(report.balanceDeduction, 0);
  assert.equal(report.outcome, MonthOutcome.OVER);
});

test("far over allocation leaves no savings and deducts the balance", () => {
  const report = monthReport("2026-08", budget, [row(-3800), row(1800, "Rent"), row(2900, "Fun")]);
  assert.equal(report.savingsActual, 0);
  assert.equal(report.balanceDeduction, 500);
  assert.equal(report.outcome, MonthOutcome.DEFICIT);
  assert.equal(report.incomeShortfall, 400);
  assert.equal(report.net, -900);
});

test("a month without a budget still reports entry and spend", () => {
  const report = monthReport("2026-07", null, [row(-1000), row(300)]);
  assert.equal(report.hasBudget, false);
  assert.equal(report.outcome, null);
  assert.deepEqual([report.entry, report.spent, report.net], [1000, 300, 700]);
});
