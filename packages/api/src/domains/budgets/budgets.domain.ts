import { budgetId, parseBudgetId, PrincipalKind, toMonthYear, type Principal } from "@myos/shared";
import { ServiceValidationError } from "../../core/errors/errors.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { budgetQueryFilterFields, budgetQuerySchema } from "./budgets.query.js";
import { budgetPatchSchema, budgetPostSchema, budgetRecordSchema, budgetRuleErrors } from "./budgets.schemas.js";
import type { BudgetEntity, BudgetPatch, BudgetPost, BudgetQuery, BudgetRecord } from "./budgets.types.js";

export const budgetRepo = new FirestoreRepo<
  FirestoreRepoTypeSet<BudgetEntity, BudgetRecord, BudgetQuery, BudgetPatch>
>("budgets", budgetQueryFilterFields);

/**
 * The user segment of the budget id. The owner's token carries their uid; the
 * API key is "system", so it writes on behalf of the configured owner.
 */
export function budgetUserId(client?: Principal): string {
  if (client?.kind === PrincipalKind.OWNER) return client.id;
  const ownerUid = process.env.MYOS_OWNER_UID;
  if (!ownerUid) {
    throw new ServiceValidationError("MYOS_OWNER_UID is not configured.", {
      userId: ["No owner to file the budget under."],
    });
  }
  return ownerUid;
}

function rulesError(formErrors: string[]): ServiceValidationError {
  return new ServiceValidationError("Invalid budget.", { formErrors, fieldErrors: {} });
}

/** Past months are history: only the current or an upcoming month may change. */
export function assertEditableMonth(monthYear: string | undefined): void {
  if (monthYear !== undefined && monthYear < toMonthYear()) {
    throw rulesError([`${monthYear} is in the past and can no longer be edited.`]);
  }
}

export function buildBudgetCreateRecord(input: BudgetPost): BudgetRecord {
  assertEditableMonth(input.monthYear);
  const now = new Date();
  const { monthYear: _monthYear, ...rest } = input;
  return { ...rest, createdAt: now, updatedAt: now };
}

export function buildBudgetPatchRecord(existing: BudgetEntity, patch: BudgetPatch): BudgetPatch & { updatedAt: Date } {
  assertEditableMonth(parseBudgetId(existing.id)?.monthYear);

  const merged = {
    income: existing.income,
    needs: existing.needs,
    wants: existing.wants,
    savings: existing.savings,
    ...patch,
  };
  const errors = budgetRuleErrors(merged);
  if (errors.length > 0) throw rulesError(errors);

  return { ...patch, updatedAt: new Date() };
}

export const budgetDomain: DomainInner = {
  resourceName: "budget",
  repo: budgetRepo,
  schemas: {
    query: budgetQuerySchema,
    create: budgetPostSchema,
    patch: budgetPatchSchema,
    record: budgetRecordSchema,
  },

  // `${userId}_${YYYY-MM}` — a second POST for the same month hits the
  // repo's create-only write and comes back 409 conflict.
  createId: (input, { client }) => budgetId(budgetUserId(client), (input as BudgetPost).monthYear),

  buildCreateRecord: (input) => buildBudgetCreateRecord(input as BudgetPost),

  buildPatchRecord: (existing, patch) => buildBudgetPatchRecord(existing as BudgetEntity, patch as BudgetPatch),
};
