import { TAGS_COLLECTION, type Tag } from "@myos/shared";
import { db } from "../../config/firebase.js";
import { ServiceValidationError } from "../../core/errors/errors.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { tagQueryFilterFields, tagQuerySchema } from "./tags.query.js";
import { tagPostSchema, tagRecordSchema } from "./tags.schemas.js";
import type { TagEntity, TagPost, TagQuery, TagRecord } from "./tags.types.js";

export const tagRepo = new FirestoreRepo<FirestoreRepoTypeSet<TagEntity, TagRecord, TagQuery, TagRecord>>(
  TAGS_COLLECTION,
  tagQueryFilterFields,
);

/** Tags are a closed set: an entry or rule may only carry tags created through POST /tags. */
export async function assertKnownTags(tags: Tag[] | undefined): Promise<void> {
  if (!tags?.length) return;
  const docs = await db.getAll(...tags.map((tag) => db.collection(TAGS_COLLECTION).doc(tag)));
  const unknown = tags.filter((_, i) => !docs[i]!.exists);
  if (unknown.length > 0) {
    throw new ServiceValidationError("Unknown tags.", { formErrors: [], fieldErrors: { tags: unknown.map((tag) => `No tag "${tag}". Create it first.`) } });
  }
}

export const tagDomain: DomainInner = {
  resourceName: "tag",
  repo: tagRepo,
  schemas: { query: tagQuerySchema, create: tagPostSchema, record: tagRecordSchema },
  createId: (input) => (input as TagPost).name,
  buildCreateRecord: () => ({ createdAt: new Date() }),
};
