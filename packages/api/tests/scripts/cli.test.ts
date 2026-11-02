import assert from "node:assert/strict";
import test from "node:test";
import { LineEntryStatus, PlaidTransactionStatus, type LineEntryView } from "@myos/shared";
import { hasSelector, matchIds, money, nextTags, sameTags, selectEntries } from "../../scripts/cli-lib.js";

const entry = (id: string, fields: Partial<LineEntryView> = {}): LineEntryView => ({
  id,
  name: "Uber",
  amount: 1000,
  date: "2026-10-01",
  monthYear: "2026-10",
  currency: "USD",
  plaidStatus: PlaidTransactionStatus.POSTED,
  osStatus: LineEntryStatus.NOT_LABELLED,
  ...fields,
});

test("an id prefix must name exactly one entry", () => {
  const entries = [entry("abc1"), entry("abc2")];
  assert.equal(matchIds(entries, ["abc1"])[0]!.id, "abc1");
  assert.throws(() => matchIds(entries, ["abc"]), /matches 2/);
  assert.throws(() => matchIds(entries, ["zzz"]), /No transaction/);
});

test("selectors narrow together and skip removed entries", () => {
  const entries = [
    entry("a", { label: "Rides", tags: ["work"] }),
    entry("b", { label: "Rides", name: "Lyft" }),
    entry("c", { plaidStatus: PlaidTransactionStatus.REMOVED }),
    entry("d"),
  ];
  assert.deepEqual(selectEntries(entries, { search: "uber", label: "rides" }).map((e) => e.id), ["a"]);
  assert.deepEqual(selectEntries(entries, { tag: "Work" }).map((e) => e.id), ["a"]);
  assert.deepEqual(selectEntries(entries, { unlabelled: true }).map((e) => e.id), ["d"]);
});

test("unlabelled leaves out goal and excluded entries", () => {
  const entries = [entry("a", { goalId: "g" }), entry("b", { osStatus: LineEntryStatus.EXCLUDED })];
  assert.deepEqual(selectEntries(entries, { unlabelled: true }), []);
});

test("a write needs a selector", () => {
  assert.equal(hasSelector({}), false);
  assert.equal(hasSelector({}, "2026-10"), true);
  assert.equal(hasSelector({ ids: [] }), false);
});

test("tag changes normalize names and keep lists sorted", () => {
  assert.deepEqual(nextTags(["work"], "add", ["Food Delivery"]), ["food_delivery", "work"]);
  assert.deepEqual(nextTags(["a", "b"], "remove", ["A"]), ["b"]);
  assert.deepEqual(nextTags(["a"], "set", []), []);
  assert.equal(sameTags(["b", "a"], ["a", "b"]), true);
  assert.equal(sameTags(undefined, []), true);
});

test("money shows inflows with a plus", () => {
  assert.equal(money(1234), "$12.34");
  assert.equal(money(-500), "+$5.00");
});
