import { FIRESTORE_INDEX_REQUESTS_COLLECTION } from "@myos/shared";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { firestoreIndexQueryFilterFields, firestoreIndexQuerySchema } from "./firestoreIndexes.query.js";
import { firestoreIndexPatchSchema } from "./firestoreIndexes.schemas.js";
import type {
  FirestoreIndexEntity,
  FirestoreIndexPatch,
  FirestoreIndexQuery,
  FirestoreIndexRecord,
} from "./firestoreIndexes.types.js";

export const firestoreIndexRepo = new FirestoreRepo<
  FirestoreRepoTypeSet<FirestoreIndexEntity, FirestoreIndexRecord, FirestoreIndexQuery, FirestoreIndexPatch>
>(FIRESTORE_INDEX_REQUESTS_COLLECTION, firestoreIndexQueryFilterFields);

export const firestoreIndexDomain: DomainInner = {
  resourceName: "firestoreIndexRequest",
  repo: firestoreIndexRepo,
  schemas: {
    query: firestoreIndexQuerySchema,
    patch: firestoreIndexPatchSchema,
  },
};
