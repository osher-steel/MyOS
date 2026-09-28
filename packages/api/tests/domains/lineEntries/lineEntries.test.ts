import assert from "node:assert/strict";
import test from "node:test";
import {
  groupLineEntries,
  LineEntryStatus,
  PlaidTransactionStatus,
  planSync,
  totalLineEntries,
  touchedMonths,
  type LineEntry,
  type PlaidSyncDelta,
  type PlaidTransaction,
} from "@myos/shared";
import { buildLineEntryCreateRecord, buildLineEntryPatchRecord } from "../../../src/domains/lineEntries/lineEntries.domain.js";
import { lineEntryQuerySchema } from "../../../src/domains/lineEntries/lineEntries.query.js";
import { lineEntryPatchSchema, lineEntryPostSchema } from "../../../src/domains/lineEntries/lineEntries.schemas.js";

const post = {
  id: "txn_1",
  name: "Publix",
  amount: 4250,
  date: "2026-09-03",
  plaidStatus: PlaidTransactionStatus.POSTED,
};

function stored(overrides: Partial<LineEntry>): LineEntry {
  return {
    id: "txn_1",
    name: "Publix",
    amount: 4250,
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
  return { id: "txn_1", name: "Publix", amount: 4250, date: "2026-09-03", currency: "USD", pending: false, ...overrides };
}

test("line entry create needs the Plaid id, a day date and whole cents, and defaults currency", () => {
  const parsed = lineEntryPostSchema.parse(post);
  assert.equal(lineEntryPostSchema.safeParse({ ...post, amount: 42.5 }).success, false);
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

const delta = (overrides: Partial<PlaidSyncDelta>): PlaidSyncDelta => ({ added: [], modified: [], removed: [], ...overrides });
const storedMap = (...rows: LineEntry[]) => new Map(rows.map((row) => [row.id, row]));

test("sync creates unlabelled rows for every new transaction, labelled or not", () => {
  const plan = planSync(delta({ added: [live({}), live({ id: "txn_2", name: "Payroll", amount: -300000 })] }), new Map());
  assert.deepEqual(
    plan.creates.map((row) => [row.id, row.monthYear, row.osStatus, row.label]),
    [
      ["txn_1", "2026-09", LineEntryStatus.NOT_LABELLED, undefined],
      ["txn_2", "2026-09", LineEntryStatus.NOT_LABELLED, undefined],
    ],
  );
  assert.deepEqual([plan.updates, plan.removed, plan.deletes], [[], [], []]);
});

test("sync keeps a manual label when Plaid modifies the transaction", () => {
  const labelled = stored({ label: "Groceries", osStatus: LineEntryStatus.LABELLED, amount: 4000 });
  const plan = planSync(delta({ modified: [live({ amount: 4250 })] }), storedMap(labelled));
  assert.equal(plan.creates.length, 0);
  assert.deepEqual(plan.updates, [
    {
      id: "txn_1",
      name: "Publix",
      amount: 4250,
      date: "2026-09-03",
      monthYear: "2026-09",
      currency: "USD",
      plaidStatus: PlaidTransactionStatus.POSTED,
    },
  ]);
  assert.ok(plan.updates.every((fields) => !("label" in fields) && !("osStatus" in fields)));
});

test("sync moves a label from the pending row to the posted one and deletes the pending row", () => {
  const pending = stored({ id: "pend_1", label: "Fuel", osStatus: LineEntryStatus.LABELLED, plaidStatus: PlaidTransactionStatus.PENDING });
  const plan = planSync(
    delta({ added: [live({ id: "post_1", pendingTransactionId: "pend_1" })], removed: ["pend_1"] }),
    storedMap(pending),
  );
  assert.deepEqual(plan.creates.map((row) => [row.id, row.label, row.osStatus, row.pendingTransactionId]), [
    ["post_1", "Fuel", LineEntryStatus.LABELLED, "pend_1"],
  ]);
  assert.deepEqual([plan.deletes, plan.removed], [["pend_1"], []]);
});

test("sync marks stored removals and ignores removals it never stored", () => {
  const plan = planSync(delta({ removed: ["txn_1", "never_seen"] }), storedMap(stored({})));
  assert.deepEqual(plan.removed, ["txn_1"]);
});

test("sync applies the latest version of a transaction added and modified in one run", () => {
  const plan = planSync(delta({ added: [live({ amount: 10, pending: true })], modified: [live({ amount: 12 })] }), new Map());
  assert.deepEqual(plan.creates.map((row) => [row.amount, row.plaidStatus]), [[12, PlaidTransactionStatus.POSTED]]);
});

test("sync skips a transaction added and removed in the same run", () => {
  const plan = planSync(delta({ added: [live({ id: "flash" })], removed: ["flash"] }), new Map());
  assert.deepEqual([plan.creates, plan.removed], [[], []]);
});

test("touched months include where removed and settled rows lived", () => {
  const plan = {
    creates: [{ ...stored({ id: "new" }), monthYear: "2026-09" }],
    updates: [],
    removed: ["old"],
    deletes: ["pend"],
  };
  const known = storedMap(stored({ id: "old", monthYear: "2026-07" }), stored({ id: "pend", monthYear: "2026-08" }));
  assert.deepEqual(touchedMonths(plan, known), ["2026-07", "2026-08", "2026-09"]);
});

test("grouping drops removed rows, splits on label, and totals outflows per label with sign", () => {
  const groups = groupLineEntries([
    stored({ id: "a", label: "Groceries", osStatus: LineEntryStatus.LABELLED, amount: 4000 }),
    stored({ id: "b", label: "Groceries", osStatus: LineEntryStatus.LABELLED, amount: -1000 }),
    stored({ id: "c", amount: 2500 }),
    stored({ id: "d", name: "Payroll", amount: -300000 }),
    stored({ id: "e", amount: 9900, plaidStatus: PlaidTransactionStatus.REMOVED }),
  ]);
  assert.deepEqual(
    [groups.all.length, groups.labelled.length, groups.unlabelled.length],
    [4, 2, 2],
  );
  const totals = totalLineEntries(groups);
  assert.deepEqual(totals, { spent: 6500, spentLabelled: 4000, spentUnlabelled: 2500, usedByLabel: { Groceries: 3000 } });
});
