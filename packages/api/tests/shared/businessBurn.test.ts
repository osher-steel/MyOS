import assert from "node:assert/strict";
import test from "node:test";
import { burnVsBudget, isBusinessBook, LineEntryStatus, monthBurn, PlaidTransactionStatus, type LineEntryView } from "@myos/shared";

const entry = (amount: number, label?: string, fields: Partial<LineEntryView> = {}): LineEntryView => ({
  id: `${amount}-${label}`,
  name: "x",
  amount,
  date: "2026-10-01",
  monthYear: "2026-10",
  currency: "USD",
  label,
  plaidStatus: PlaidTransactionStatus.POSTED,
  osStatus: label ? LineEntryStatus.LABELLED : LineEntryStatus.NOT_LABELLED,
  ...fields,
});

test("investment and internal transfers never touch burn", () => {
  const burn = monthBurn(
    [entry(1000, "Ads"), entry(-50000, "Investment"), entry(700, "Internal transfer"), entry(-700, "Internal transfer", { id: "b" })],
    "2026-10",
  );
  assert.equal(burn.grossBurn, 1000);
  assert.equal(burn.netBurn, 1000);
  assert.equal(burn.financing, 50000);
  assert.equal(burn.internal, 0);
});

test("revenue offsets net burn only, and a refund reduces its own category", () => {
  const burn = monthBurn([entry(1000, "Ads"), entry(-200, "Ads", { id: "refund" }), entry(-300, "Lysted payouts")], "2026-10");
  assert.equal(burn.grossBurn, 800);
  assert.equal(burn.revenue, 300);
  assert.equal(burn.netBurn, 500);
});

test("a net-positive month has negative net burn", () => {
  assert.equal(monthBurn([entry(100, "Rent"), entry(-500, "Stripe payouts")], "2026-10").netBurn, -400);
});

test("any label that isn't revenue, financing or internal is a burn line", () => {
  const burn = monthBurn([entry(100), entry(200, "Office snacks")], "2026-10");
  assert.equal(burn.grossBurn, 200);
  assert.deepEqual(burn.expenses, [{ name: "Office snacks", amount: 200, count: 1 }]);
  assert.equal(burn.unclassified.length, 1);
});

test("other months, removed and excluded entries are ignored", () => {
  const burn = monthBurn(
    [
      entry(1, "Ads", { monthYear: "2026-09" }),
      entry(2, "Ads", { plaidStatus: PlaidTransactionStatus.REMOVED }),
      entry(4, undefined, { osStatus: LineEntryStatus.EXCLUDED }),
    ],
    "2026-10",
  );
  assert.equal(burn.grossBurn, 0);
  assert.equal(burn.unclassified.length, 0);
});

test("only DIBS is a business book", () => {
  assert.equal(isBusinessBook("dibs"), true);
  assert.equal(isBusinessBook("personal"), false);
});

test("allocation spending stays out of monthly burn and keeps its labels", () => {
  const burn = monthBurn(
    [
      entry(100, "Ads"),
      entry(300, "Flyer distribution", { goalId: "venue" }),
      entry(200, "Flyer distribution", { goalId: "venue", id: "second" }),
      entry(50, undefined, { goalId: "venue" }),
    ],
    "2026-10",
  );
  assert.equal(burn.grossBurn, 100);
  assert.deepEqual(burn.pools, [
    {
      goalId: "venue",
      amount: 550,
      count: 3,
      lines: [
        { name: "Flyer distribution", amount: 500, count: 2 },
        { name: "Uncategorized", amount: 50, count: 1 },
      ],
    },
  ]);
  assert.equal(burn.unclassified.length, 0);
});

test("budget vs burn flags categories that went over", () => {
  const burn = monthBurn([entry(700, "Ads"), entry(100, "Rent"), entry(50, "Travel")], "2026-10");
  const result = burnVsBudget({ Ads: 500, Rent: 200 }, burn);
  assert.deepEqual(
    result.lines.map(({ name, left }) => [name, left]),
    [
      ["Ads", -200],
      ["Rent", 100],
      ["Travel", -50],
    ],
  );
  assert.equal(result.budgeted, 700);
  assert.equal(result.actual, 850);
  assert.equal(result.left, -150);
  assert.equal(result.overCount, 2);
});
