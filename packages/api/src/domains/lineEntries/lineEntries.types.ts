import type { LineEntry } from "@myos/shared";
import type z from "zod";
import type { Equal, Expect, Override, RecordOf } from "../../types/type-assertions.js";
import type { lineEntryQuerySchema } from "./lineEntries.query.js";
import type { lineEntryPatchSchema, lineEntryPostSchema, lineEntryRecordSchema } from "./lineEntries.schemas.js";

export type LineEntryPost = z.infer<typeof lineEntryPostSchema>;
export type LineEntryPatch = z.infer<typeof lineEntryPatchSchema>;
export type LineEntryRecord = z.infer<typeof lineEntryRecordSchema>;
export type LineEntryQuery = z.infer<typeof lineEntryQuerySchema>;

export type LineEntryEntity = Override<LineEntry, { createdAt: Date; updatedAt: Date }>;

type _AssertLineEntryRecordSchemaMatchesRecord = Expect<
  Equal<LineEntryRecord, RecordOf<LineEntryEntity>>
>;
