import { LabelSource, LINE_ENTRIES_COLLECTION, LineEntryStatus, osStatusOf, type MonthYear } from "@myos/shared";
import { FieldValue } from "../../config/firebase.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner, WriteChange } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { learnFromManualEdit } from "../../services/autoLabel.js";
import { syncGoalSpends } from "../../services/goals.js";
import { regeneratePastReports } from "../../services/monthReports.js";
import { activeGoal } from "../goals/goals.domain.js";
import { assertKnownTags } from "../tags/tags.domain.js";
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

// A booked month equal to the date's month is no override, so it's cleared rather than stored
function bookingFields(bookedMonth: LineEntryPatch["bookedMonth"], existing?: Pick<LineEntryEntity, "date">): Record<string, unknown> {
  if (bookedMonth === undefined) return {};
  if (!existing) throw new Error("Booking a month needs the entry's date.");
  const dateMonth = existing.date.slice(0, 7);
  if (bookedMonth === null || bookedMonth === dateMonth) return { bookedMonth: FieldValue.delete(), monthYear: dateMonth };
  return { bookedMonth, monthYear: bookedMonth };
}

export function buildLineEntryPatchRecord(patch: LineEntryPatch, existing?: Pick<LineEntryEntity, "date">): Record<string, unknown> {
  const { bookedMonth, business, ...rest } = patch;
  const excluding = patch.osStatus === LineEntryStatus.EXCLUDED;
  const filing = patch.label !== undefined || patch.goalId !== undefined || excluding;
  const osStatus = filing && patch.osStatus === undefined ? osStatusOf(patch.label, patch.goalId) : patch.osStatus;
  return {
    ...rest,
    ...bookingFields(bookedMonth, existing),
    ...(business === undefined ? {} : business ? { business: true, goalId: FieldValue.delete() } : { business: FieldValue.delete() }),
    ...(patch.goalId || excluding ? { label: FieldValue.delete() } : {}),
    ...(patch.label || excluding ? { goalId: FieldValue.delete() } : {}),
    ...(filing ? { labelSource: LabelSource.MANUAL, ruleId: FieldValue.delete() } : {}),
    ...(patch.tags ? { tagSource: LabelSource.MANUAL } : {}),
    ...(patch.tags?.length === 0 ? { tags: FieldValue.delete() } : {}),
    ...(osStatus ? { osStatus } : {}),
    updatedAt: new Date(),
  };
}

async function buildGoalAwarePatchRecord(existing: LineEntryEntity, patch: LineEntryPatch): Promise<Record<string, unknown>> {
  if (patch.goalId) await activeGoal(patch.goalId);
  await assertKnownTags(patch.tags);
  return buildLineEntryPatchRecord(patch, existing);
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
  buildPatchRecord: (existing, patch) => buildGoalAwarePatchRecord(existing as LineEntryEntity, patch as LineEntryPatch),
  afterWrite: async (change) => {
    await syncGoalSpends([change.id]);
    const autoLabelled = await learnFromManualEdit(change);
    await regeneratePastReports([...changedMonths(change), ...autoLabelled]);
  },
};
