import assert from "node:assert/strict";
import test from "node:test";
import { budgetId, nextMonthYear, previousMonthYear, PrincipalKind, toMonthYear } from "@myos/shared";
import { ServiceValidationError } from "../../../src/core/errors/errors.js";
import {
  budgetDomain,
  budgetUserId,
  buildBudgetCreateRecord,
  buildBudgetPatchRecord,
} from "../../../src/domains/budgets/budgets.domain.js";
import type { BudgetEntity } from "../../../src/domains/budgets/budgets.types.js";

const owner = { id: "u123", kind: PrincipalKind.OWNER };
const apiKey = { id: "system", kind: PrincipalKind.API_KEY };
const thisMonth = toMonthYear();
const base = { income: 4000, needs: {}, wants: {}, savings: {} };

/** Business-rule failures carry their message in details.formErrors, not in the Error message. */
function throwsRule(fn: () => unknown, pattern: RegExp) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ServiceValidationError);
    const { formErrors } = error.details as { formErrors: string[] };
    assert.match(formErrors.join("\n"), pattern);
    return true;
  });
}

function existingFor(monthYear: string): BudgetEntity {
  return {
    id: budgetId("u123", monthYear),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    income: 1000,
    needs: { Groceries: 500 },
    wants: {},
    savings: {},
  };
}

test("budget id comes from the caller and the requested month", () => {
  const id = budgetDomain.createId!({ ...base, monthYear: "2026-09" }, { client: owner });
  assert.equal(id, "u123_2026-09");
});

test("the API key files budgets under the configured owner", () => {
  process.env.MYOS_OWNER_UID = "owner-uid";
  assert.equal(budgetUserId(apiKey), "owner-uid");
  assert.equal(budgetUserId(owner), "u123");

  delete process.env.MYOS_OWNER_UID;
  assert.throws(() => budgetUserId(apiKey), ServiceValidationError);
});

test("create stamps timestamps, keeps income, and drops monthYear from the record", () => {
  const record = buildBudgetCreateRecord({ ...base, monthYear: thisMonth, needs: { Rent: 1 } });
  assert.ok(record.createdAt instanceof Date);
  assert.equal(record.createdAt, record.updatedAt);
  assert.equal("monthYear" in record, false);
  assert.equal(record.income, 4000);
  assert.deepEqual(record.needs, { Rent: 1 });
});

test("only the current or an upcoming month can be created or patched", () => {
  assert.ok(buildBudgetCreateRecord({ ...base, monthYear: nextMonthYear(thisMonth) }));
  throwsRule(() => buildBudgetCreateRecord({ ...base, monthYear: previousMonthYear(thisMonth) }), /in the past/);
  throwsRule(() => buildBudgetPatchRecord(existingFor(previousMonthYear(thisMonth)), { income: 5000 }), /in the past/);
});

test("patch bumps updatedAt and applies the cross-field rules to the merged budget", () => {
  const existing = existingFor(thisMonth);

  const patched = buildBudgetPatchRecord(existing, { wants: { Travel: 300 } });
  assert.deepEqual(patched.wants, { Travel: 300 });
  assert.ok(patched.updatedAt.getTime() > 0);
  assert.equal("createdAt" in patched, false);

  throwsRule(() => buildBudgetPatchRecord(existing, { wants: { Groceries: 1 } }), /more than one group/);
  throwsRule(() => buildBudgetPatchRecord(existing, { wants: { Travel: 600 } }), /exceed income \(1000\)/);
  throwsRule(() => buildBudgetPatchRecord(existing, { income: 400 }), /exceed income \(400\)/);
});
