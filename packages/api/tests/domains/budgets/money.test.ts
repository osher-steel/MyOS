import assert from "node:assert/strict";
import test from "node:test";
import { splitProportionally, toCents } from "@myos/shared";

test("toCents rounds float dollars from Plaid to whole cents", () => {
  assert.equal(toCents(42.5), 4250);
  assert.equal(toCents(0.1 + 0.2), 30);
  assert.equal(toCents(-19.99), -1999);
});

test("a proportional split always sums to the total in whole cents", () => {
  assert.deepEqual(splitProportionally(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(splitProportionally(1000, [150000, 85000]), [638, 362]);
  assert.deepEqual(splitProportionally(500, [0, 0]), [0, 0]);
  const parts = splitProportionally(123457, [3, 7, 11, 13]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 123457);
  assert.ok(parts.every(Number.isInteger));
});
