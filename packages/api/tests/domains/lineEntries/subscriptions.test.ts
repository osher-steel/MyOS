import assert from "node:assert/strict";
import test from "node:test";
import { detectSubscriptions, LineEntryStatus, PlaidTransactionStatus, SubscriptionStatus, type LineEntryView } from "@myos/shared";

let seq = 0;
function charge(merchantName: string, amount: number, date: string, fields: Partial<LineEntryView> = {}): LineEntryView {
  seq += 1;
  return {
    id: `c${seq}`,
    name: merchantName,
    merchantName,
    amount,
    date,
    monthYear: date.slice(0, 7),
    currency: "USD",
    plaidStatus: PlaidTransactionStatus.POSTED,
    osStatus: LineEntryStatus.LABELLED,
    ...fields,
  };
}

const byName = (summary: ReturnType<typeof detectSubscriptions>) =>
  Object.fromEntries(summary.subscriptions.map((s) => [`${s.name} ${s.amount}`, s]));

test("monthly charges at a steady price are subscriptions; a merchant's parallel plans stay apart", () => {
  const summary = detectSubscriptions(
    [
      charge("Apple", 299, "2026-08-11"),
      charge("Apple", 499, "2026-08-08"),
      charge("Apple", 299, "2026-09-11"),
      charge("Apple", 499, "2026-09-08"),
      charge("Figma", 2000, "2026-09-07"),
      charge("Figma", 2000, "2026-10-07"),
    ],
    "2026-10",
  );
  const found = byName(summary);
  assert.equal(found["Apple 299"]!.status, SubscriptionStatus.NOT_CHARGED_YET);
  assert.equal(found["Apple 499"]!.status, SubscriptionStatus.NOT_CHARGED_YET);
  assert.equal(found["Figma 2000"]!.status, SubscriptionStatus.ACTIVE);
  assert.equal(summary.monthlyTotal, 299 + 499 + 2000);
});

test("a plan that moved to a new price is one subscription marked changed", () => {
  const summary = detectSubscriptions(
    [
      charge("Vercel", 4000, "2026-07-28"),
      charge("Vercel", 4000, "2026-08-28"),
      charge("Vercel", 6000, "2026-09-28"),
      charge("Vercel", 6000, "2026-10-28"),
    ],
    "2026-10",
  );
  assert.equal(summary.subscriptions.length, 1);
  assert.equal(summary.subscriptions[0]!.months, 4);
  const raised = detectSubscriptions(
    [charge("Vercel", 4000, "2026-08-28"), charge("Vercel", 4000, "2026-09-28"), charge("Vercel", 6000, "2026-10-28")],
    "2026-10",
  );
  assert.deepEqual([raised.subscriptions[0]!.status, raised.subscriptions[0]!.previousAmount], [SubscriptionStatus.CHANGED, 4000]);
});

test("everyday spots, transfers, one-offs and cent drifts aren't flagged; marked charges always are", () => {
  const summary = detectSubscriptions(
    [
      charge("Taco Stand", 1079, "2026-08-29", { categoryPrimary: "FOOD_AND_DRINK" }),
      charge("Taco Stand", 1132, "2026-09-24", { categoryPrimary: "FOOD_AND_DRINK" }),
      charge("Walmart", 20087, "2026-08-02"),
      charge("Walmart", 2405, "2026-09-29"),
      charge("Anthropic", 10070, "2026-09-01"),
      charge("Anthropic", 10000, "2026-10-01"),
      charge("Strava", 7999, "2026-09-30", { label: "Work", tags: ["subscription"] }),
      charge("Biz tool", 5000, "2026-09-03", { business: true, label: "Subscriptions" }),
    ],
    "2026-10",
  );
  const found = byName(summary);
  assert.deepEqual(Object.keys(found).sort(), ["Anthropic 10000", "Strava 7999"]);
  assert.equal(found["Anthropic 10000"]!.status, SubscriptionStatus.ACTIVE);
  assert.equal(found["Strava 7999"]!.status, SubscriptionStatus.NEW);
});
