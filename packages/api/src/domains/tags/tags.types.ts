import type { TagDefinition } from "@myos/shared";
import type z from "zod";
import type { Equal, Expect, Override, RecordOf } from "../../types/type-assertions.js";
import type { tagQuerySchema } from "./tags.query.js";
import type { tagPostSchema, tagRecordSchema } from "./tags.schemas.js";

export type TagPost = z.infer<typeof tagPostSchema>;
export type TagRecord = z.infer<typeof tagRecordSchema>;
export type TagQuery = z.infer<typeof tagQuerySchema>;

export type TagEntity = Override<TagDefinition, { createdAt: Date }>;

type _AssertTagRecordSchemaMatchesRecord = Expect<Equal<TagRecord, RecordOf<TagEntity>>>;
