import assert from "node:assert/strict";
import test from "node:test";
import { monthRange } from "@myos/shared";

test("month range spans a year boundary and is empty when reversed", () => {
  assert.deepEqual(monthRange("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(monthRange("2026-09", "2026-09"), ["2026-09"]);
  assert.deepEqual(monthRange("2026-09", "2026-08"), []);
});
