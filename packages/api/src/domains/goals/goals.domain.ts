import { GOALS_COLLECTION } from "@myos/shared";
import { ServiceConflictError } from "../../core/errors/errors.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { goalQueryFilterFields, goalQuerySchema } from "./goals.query.js";
import { goalPatchSchema, goalPostSchema, goalRecordSchema } from "./goals.schemas.js";
import type { GoalEntity, GoalPatch, GoalPost, GoalQuery, GoalRecord } from "./goals.types.js";

export const goalRepo = new FirestoreRepo<FirestoreRepoTypeSet<GoalEntity, GoalRecord, GoalQuery, GoalPatch>>(
  GOALS_COLLECTION,
  goalQueryFilterFields,
);

export function newGoalRecord(input: GoalPost): GoalRecord {
  const now = new Date();
  return { ...input, amountSaved: 0, createdAt: now, updatedAt: now };
}

async function buildGoalCreateRecord(input: GoalPost): Promise<GoalRecord> {
  const taken = await goalRepo.list(goalQuerySchema.parse({ name: input.name, limit: 1 }));
  if (taken.data.length > 0) throw new ServiceConflictError(`A goal named "${input.name}" already exists.`);
  return newGoalRecord(input);
}

export const goalDomain: DomainInner = {
  resourceName: "goal",
  repo: goalRepo,
  schemas: { query: goalQuerySchema, create: goalPostSchema, patch: goalPatchSchema, record: goalRecordSchema },
  buildCreateRecord: (input) => buildGoalCreateRecord(input as GoalPost),
  buildPatchRecord: (_existing, patch) => ({ ...(patch as GoalPatch), updatedAt: new Date() }),
};
