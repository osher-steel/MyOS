import assert from "node:assert/strict";
import test from "node:test";
import { LineEntryStatus, mergeLineEntries, PlaidTransactionStatus, type LineEntry, type PlaidTransaction } from "@myos/shared";
import { buildLineEntryCreateRecord, buildLineEntryPatchRecord } from "../../../src/domains/lineEntries/lineEntries.domain.js";
import { lineEntryQuerySchema } from "../../../src/domains/lineEntries/lineEntries.query.js";
import { lineEntryPatchSchema, lineEntryPostSchema } from "../../../src/domains/lineEntries/lineEntries.schemas.js";

const post = {
  id: "txn_1",
  name: "Publix",
  amount: 42.5,
  date: "2026-09-03",
  plaidStatus: PlaidTransactionStatus.POSTED,
};

function stored(overrides: Partial<LineEntry>): LineEntry {
  return {
    id: "txn_1",
    name: "Publix",
    amount: 42.5,
    date: "2026-09-03",
    monthYear: "2026-09",
    currency: "USD",
    plaidStatus: PlaidTransactionStatus.POSTED,
    osStatus: LineEntryStatus.NOT_LABELLED,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function live(overrides: Partial<PlaidTransaction>): PlaidTransaction {
  return { id: "txn_1", name: "Publix", amount: 42.5, date: "2026-09-03", currency: "USD", pending: false, ...overrides };
}

test("line entry create needs the Plaid id and a day date, and defaults currency", () => {
  const parsed = lineEntryPostSchema.parse(post);
  assert.equal(parsed.currency, "USD");
  assert.equal(lineEntryPostSchema.safeParse({ ...post, id: undefined }).success, false);
  assert.equal(lineEntryPostSchema.safeParse({ ...post, date: "2026-09" }).success, false);
  assert.equal(lineEntryPostSchema.safeParse({ ...post, osStatus: LineEntryStatus.LABELLED }).success, false);
});

test("create record derives month, os status, and timestamps", () => {
  const record = buildLineEntryCreateRecord(lineEntryPostSchema.parse(post));
  assert.equal(record.monthYear, "2026-09");
  assert.equal(record.osStatus, LineEntryStatus.NOT_LABELLED);
  assert.ok(!("id" in record));
  assert.ok(record.createdAt instanceof Date);

  const labelled = buildLineEntryCreateRecord(lineEntryPostSchema.parse({ ...post, label: "Groceries" }));
  assert.equal(labelled.osStatus, LineEntryStatus.LABELLED);
});

test("patch requires a field and relabelling updates os status unless given", () => {
  assert.equal(lineEntryPatchSchema.safeParse({}).success, false);
  assert.equal(buildLineEntryPatchRecord({ label: "Rent" }).osStatus, LineEntryStatus.LABELLED);
  assert.equal(
    buildLineEntryPatchRecord({ label: "Rent", osStatus: LineEntryStatus.MISLABELED }).osStatus,
    LineEntryStatus.MISLABELED,
  );
  assert.equal(buildLineEntryPatchRecord({ amount: 1 }).osStatus, undefined);
});

test("line entry list filters by month and sorts by id by default", () => {
  const parsed = lineEntryQuerySchema.parse({ monthYear: "2026-09" });
  assert.equal(parsed.sortField, "id");
  assert.deepEqual(parsed.monthYear, { eq: "2026-09" });
});

test("merge keeps stored labels, takes Plaid amount and status, and adds live-only rows", () => {
  const rows = mergeLineEntries(
    [stored({ label: "Groceries", osStatus: LineEntryStatus.LABELLED, amount: 40, plaidStatus: PlaidTransactionStatus.PENDING })],
    [live({ amount: 42.5 }), live({ id: "txn_2", name: "Shell", date: "2026-09-05", pending: true })],
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.label, row.amount, row.plaidStatus, row.osStatus]),
    [
      ["txn_2", undefined, 42.5, PlaidTransactionStatus.PENDING, LineEntryStatus.NOT_LABELLED],
      ["txn_1", "Groceries", 42.5, PlaidTransactionStatus.POSTED, LineEntryStatus.LABELLED],
    ],
  );
  assert.ok(!("createdAt" in rows[1]!));
});

test("merge moves a label from the stored pending id to the posted id", () => {
  const rows = mergeLineEntries(
    [stored({ id: "pend_1", label: "Fuel", osStatus: LineEntryStatus.LABELLED, plaidStatus: PlaidTransactionStatus.PENDING })],
    [live({ id: "post_1", pendingTransactionId: "pend_1" })],
  );
  assert.deepEqual(rows.map((row) => [row.id, row.label, row.pendingTransactionId]), [["post_1", "Fuel", "pend_1"]]);
});

test("merge leaves stored rows alone when Plaid returns nothing", () => {
  const rows = mergeLineEntries([stored({ label: "Rent", osStatus: LineEntryStatus.LABELLED })], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.label, "Rent");
});

test("grouping splits on label and totals count outflows only, per label with sign", async () => {
  const { groupLineEntries, totalLineEntries } = await import("@myos/shared");
  const rows = mergeLineEntries(
    [
      stored({ id: "a", label: "Groceries", osStatus: LineEntryStatus.LABELLED, amount: 40 }),
      stored({ id: "b", label: "Groceries", osStatus: LineEntryStatus.LABELLED, amount: -10 }),
    ],
    [live({ id: "c", amount: 25 }), live({ id: "d", name: "Payroll", amount: -3000 })],
  );
  const groups = groupLineEntries(rows);
  assert.deepEqual(
    [groups.all.length, groups.labelled.length, groups.unlabelled.length],
    [4, 2, 2],
  );
  const totals = totalLineEntries(groups);
  assert.deepEqual(totals, { spent: 65, spentLabelled: 40, spentUnlabelled: 25, usedByLabel: { Groceries: 30 } });
});
