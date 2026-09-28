import { LINE_ENTRIES_COLLECTION, osStatusOf, type MonthYear } from "@myos/shared";
import { FieldValue } from "../../config/firebase.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner, WriteChange } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { syncGoalSpends } from "../../services/goals.js";
import { regeneratePastReports } from "../../services/monthReports.js";
import { activeGoal } from "../goals/goals.domain.js";
import { lineEntryQueryFilterFields, lineEntryQuerySchema } from "./lineEntries.query.js";
import { lineEntryPatchSchema, lineEntryPostSchema, lineEntryRecordSchema } from "./lineEntries.schemas.js";
import type { LineEntryEntity, LineEntryPatch, LineEntryPost, LineEntryQuery, LineEntryRecord } from "./lineEntries.types.js";

export const lineEntryRepo = new FirestoreRepo<
  FirestoreRepoTypeSet<LineEntryEntity, LineEntryRecord, LineEntryQuery, LineEntryPatch>
>(LINE_ENTRIES_COLLECTION, lineEntryQueryFilterFields);

export function buildLineEntryCreateRecord(input: LineEntryPost): LineEntryRecord {
  const now = new Date();
  const { id: _id, ...rest } = input;
  return {
    ...rest,
    monthYear: input.date.slice(0, 7),
    osStatus: osStatusOf(input.label),
    createdAt: now,
    updatedAt: now,
  };
}

export function buildLineEntryPatchRecord(patch: LineEntryPatch): Record<string, unknown> {
  const labelling = patch.label !== undefined || patch.goalId !== undefined;
  const osStatus = labelling && patch.osStatus === undefined ? osStatusOf(patch.label, patch.goalId) : patch.osStatus;
  return {
    ...patch,
    ...(patch.goalId ? { label: FieldValue.delete() } : {}),
    ...(patch.label ? { goalId: FieldValue.delete() } : {}),
    ...(osStatus ? { osStatus } : {}),
    updatedAt: new Date(),
  };
}

async function buildGoalAwarePatchRecord(patch: LineEntryPatch): Promise<Record<string, unknown>> {
  if (patch.goalId) await activeGoal(patch.goalId);
  return buildLineEntryPatchRecord(patch);
}

function changedMonths({ before, after }: WriteChange): MonthYear[] {
  return [before, after].flatMap((entry) => (entry ? [(entry as LineEntryEntity).monthYear] : []));
}

export const lineEntryDomain: DomainInner = {
  resourceName: "lineEntry",
  repo: lineEntryRepo,
  schemas: {
    query: lineEntryQuerySchema,
    create: lineEntryPostSchema,
    patch: lineEntryPatchSchema,
    record: lineEntryRecordSchema,
  },
  createId: (input) => (input as LineEntryPost).id,
  buildCreateRecord: (input) => buildLineEntryCreateRecord(input as LineEntryPost),
  buildPatchRecord: (_existing, patch) => buildGoalAwarePatchRecord(patch as LineEntryPatch),
  afterWrite: async (change) => {
    await syncGoalSpends([change.id]);
    await regeneratePastReports(changedMonths(change));
  },
};
