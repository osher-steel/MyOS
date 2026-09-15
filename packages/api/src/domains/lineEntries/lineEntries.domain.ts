import { LINE_ENTRIES_COLLECTION, osStatusOf } from "@myos/shared";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner } from "../../core/resourceBuilder/resourceBuilder.types.js";
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

export function buildLineEntryPatchRecord(patch: LineEntryPatch): LineEntryPatch & { updatedAt: Date } {
  const osStatus = "label" in patch && patch.osStatus === undefined ? osStatusOf(patch.label) : patch.osStatus;
  return { ...patch, ...(osStatus ? { osStatus } : {}), updatedAt: new Date() };
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
  buildPatchRecord: (_existing, patch) => buildLineEntryPatchRecord(patch as LineEntryPatch),
};
