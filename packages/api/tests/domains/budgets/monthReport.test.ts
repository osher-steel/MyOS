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

test("savings is entry minus spending, beating the plan when both income and spending land", () => {
  const report = monthReport("2026-08", budget, [row(-4200), row(1500, "Rent"), row(1200, "Fun")]);
  assert.equal(report.entry, 4200);
  assert.equal(report.spent, 2700);
  assert.equal(report.variance, 500);
  assert.equal(report.savingsActual, 1500);
  assert.equal(report.outcome, MonthOutcome.AHEAD);
  assert.equal(report.incomeShortfall, 0);
});

test("underspending doesn't count as saved when entry fell short", () => {
  const report = monthReport("2026-08", budget, [row(-2500), row(1500, "Rent"), row(400, "Fun"), row(100)]);
  assert.equal(report.unlabelledSpent, 100);
  assert.equal(report.variance, 1200);
  assert.equal(report.savingsResult, 500);
  assert.equal(report.outcome, MonthOutcome.SHORT);
  assert.equal(report.incomeShortfall, 1700);
});

test("spending past entry is a negative result to take out of goals", () => {
  const report = monthReport("2026-08", budget, [row(-3800), row(1800, "Rent"), row(2900, "Fun")]);
  assert.equal(report.savingsResult, -900);
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

test("an open month projects savings from budgeted income until entry passes it", () => {
  const rows = [row(-1000), row(1800, "Rent"), row(400, "Fun")];
  const projected = monthReport("2026-08", budget, rows, { projected: true });
  assert.equal(projected.savingsResult, 2000);
  assert.equal(projected.outcome, MonthOutcome.AHEAD);
  assert.equal(projected.incomeShortfall, 3200);
  assert.equal(monthReport("2026-08", budget, rows).savingsResult, -1200);
  const overEarned = monthReport("2026-08", budget, [row(-5000), ...rows.slice(1)], { projected: true });
  assert.equal(overEarned.savingsResult, 2800);
});
