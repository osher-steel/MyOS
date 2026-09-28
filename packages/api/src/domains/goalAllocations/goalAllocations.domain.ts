import {
  deficitCoverErrors,
  GOAL_ALLOCATIONS_COLLECTION,
  GoalAllocationReason,
  monthReportId,
  uncoveredDeficit,
} from "@myos/shared";
import { ServiceNotFoundError, ServiceValidationError } from "../../core/errors/errors.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner, WriteChange } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { recomputeGoalBalances } from "../../services/goals.js";
import { regeneratePastReports } from "../../services/monthReports.js";
import { budgetUserId } from "../budgets/budgets.domain.js";
import { goalRepo } from "../goals/goals.domain.js";
import type { GoalEntity } from "../goals/goals.types.js";
import { monthReportRepo } from "../monthReports/monthReports.domain.js";
import type { MonthReportEntity } from "../monthReports/monthReports.types.js";
import { goalAllocationQueryFilterFields, goalAllocationQuerySchema } from "./goalAllocations.query.js";
import { goalAllocationPostSchema, goalAllocationRecordSchema } from "./goalAllocations.schemas.js";
import type {
  GoalAllocationEntity,
  GoalAllocationPost,
  GoalAllocationQuery,
  GoalAllocationRecord,
} from "./goalAllocations.types.js";

export const goalAllocationRepo = new FirestoreRepo<
  FirestoreRepoTypeSet<GoalAllocationEntity, GoalAllocationRecord, GoalAllocationQuery, GoalAllocationRecord>
>(GOAL_ALLOCATIONS_COLLECTION, goalAllocationQueryFilterFields);

function rulesError(formErrors: string[]): ServiceValidationError {
  return new ServiceValidationError("Invalid goal allocation.", { formErrors, fieldErrors: {} });
}

async function getOr<T>(load: () => Promise<unknown>, missing: string): Promise<T> {
  try {
    return (await load()) as T;
  } catch (error) {
    if (error instanceof ServiceNotFoundError) throw rulesError([missing]);
    throw error;
  }
}

export async function buildGoalAllocationCreateRecord(input: GoalAllocationPost): Promise<GoalAllocationRecord> {
  const goal = await getOr<GoalEntity>(() => goalRepo.get(input.goalId), "Unknown goal.");

  if (input.reason === GoalAllocationReason.MANUAL && goal.amountSaved + input.amount < 0) {
    throw rulesError([`${goal.name} can't go below zero.`]);
  }

  if (input.reason === GoalAllocationReason.DEFICIT_COVER) {
    const report = await getOr<MonthReportEntity>(
      () => monthReportRepo.get(monthReportId(budgetUserId(), input.monthYear)),
      `${input.monthYear} has no finished report to cover.`,
    );
    const errors = deficitCoverErrors({
      monthYear: input.monthYear,
      amount: input.amount,
      goalSaved: goal.amountSaved,
      uncovered: uncoveredDeficit(report, report.deficitCovered),
    });
    if (errors.length > 0) throw rulesError(errors);
  }

  return { ...input, createdAt: new Date() };
}

export function assertReversible(allocation: GoalAllocationEntity): void {
  if (allocation.reason === GoalAllocationReason.MONTH_SAVINGS) {
    throw rulesError(["Month savings follow the month's report; change the month's transactions instead."]);
  }
}

export async function afterGoalAllocationWrite({ before, after }: WriteChange): Promise<void> {
  const allocation = (after ?? before) as GoalAllocationEntity;
  await recomputeGoalBalances([allocation.goalId]);
  if (allocation.reason === GoalAllocationReason.DEFICIT_COVER) await regeneratePastReports([allocation.monthYear]);
}

export const goalAllocationDomain: DomainInner = {
  resourceName: "goalAllocation",
  repo: goalAllocationRepo,
  schemas: { query: goalAllocationQuerySchema, create: goalAllocationPostSchema, record: goalAllocationRecordSchema },
  buildCreateRecord: (input) => buildGoalAllocationCreateRecord(input as GoalAllocationPost),
  afterWrite: afterGoalAllocationWrite,
};
