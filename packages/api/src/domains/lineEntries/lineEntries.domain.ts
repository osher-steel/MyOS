import { isBusinessBook, LabelSource, LINE_ENTRIES_COLLECTION, LineEntryStatus, osStatusOf, type MonthYear } from "@myos/shared";
import { currentBookId } from "../../core/books/bookContext.js";
import { ServiceValidationError } from "../../core/errors/errors.js";
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

/**
 * A personal transaction is paid from a category or a goal, so filing it under one clears the other.
 * A business transaction keeps both: the label says what it was, the goal which allocation paid for it.
 */
export function buildLineEntryPatchRecord(
  patch: LineEntryPatch,
  existing?: Pick<LineEntryEntity, "date" | "label" | "goalId">,
  { combined = false }: { combined?: boolean } = {},
): Record<string, unknown> {
  const { bookedMonth, business, goalId, ...rest } = patch;
  const excluding = patch.osStatus === LineEntryStatus.EXCLUDED;
  const labelling = patch.label !== undefined;
  const filing = labelling || goalId !== undefined || excluding;
  const label = combined && !labelling ? existing?.label : patch.label;
  const goal = goalId === null ? undefined : combined && goalId === undefined ? existing?.goalId : goalId;
  const osStatus = filing && patch.osStatus === undefined ? osStatusOf(label, goal) : patch.osStatus;
  const clearsLabel = excluding || (!combined && Boolean(goalId));
  const clearsGoal = excluding || goalId === null || (!combined && Boolean(patch.label));
  return {
    ...rest,
    ...(goalId ? { goalId } : {}),
    ...bookingFields(bookedMonth, existing),
    ...(business === undefined ? {} : business ? { business: true, goalId: FieldValue.delete() } : { business: FieldValue.delete() }),
    ...(clearsLabel ? { label: FieldValue.delete() } : {}),
    ...(clearsGoal ? { goalId: FieldValue.delete() } : {}),
    // Moving a business transaction between allocations doesn't make its label a hand label
    ...((combined ? labelling || excluding : filing) ? { labelSource: LabelSource.MANUAL, ruleId: FieldValue.delete() } : {}),
    ...(patch.tags ? { tagSource: LabelSource.MANUAL } : {}),
    ...(patch.tags?.length === 0 ? { tags: FieldValue.delete() } : {}),
    ...(osStatus ? { osStatus } : {}),
    updatedAt: new Date(),
  };
}

async function buildGoalAwarePatchRecord(existing: LineEntryEntity, patch: LineEntryPatch): Promise<Record<string, unknown>> {
  const combined = isBusinessBook(currentBookId());
  if (!combined && patch.label && patch.goalId) {
    throw new ServiceValidationError("A transaction is paid from a category or a goal, not both.", {
      formErrors: ["A transaction is paid from a category or a goal, not both."],
      fieldErrors: {},
    });
  }
  if (patch.goalId) await activeGoal(patch.goalId);
  await assertKnownTags(patch.tags);
  return buildLineEntryPatchRecord(patch, existing, { combined });
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
