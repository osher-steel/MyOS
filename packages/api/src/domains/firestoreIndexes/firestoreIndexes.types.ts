import type { FirestoreIndexRequest } from "@myos/shared";
import type z from "zod";
import type { Equal, Expect, RecordOf } from "../../types/type-assertions.js";
import type { firestoreIndexQuerySchema } from "./firestoreIndexes.query.js";
import type { firestoreIndexPatchSchema, firestoreIndexRecordSchema } from "./firestoreIndexes.schemas.js";

export type FirestoreIndexPatch = z.infer<typeof firestoreIndexPatchSchema>;
export type FirestoreIndexRecord = z.infer<typeof firestoreIndexRecordSchema>;
export type FirestoreIndexQuery = z.infer<typeof firestoreIndexQuerySchema>;
export type FirestoreIndexEntity = FirestoreIndexRequest;

type _AssertRecordSchemaMatchesRecord = Expect<
  Equal<FirestoreIndexRecord, RecordOf<FirestoreIndexEntity>>
>;
