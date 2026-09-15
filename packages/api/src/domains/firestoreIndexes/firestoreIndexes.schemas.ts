import { FirestoreIndexRequestStatus } from "@myos/shared";
import z from "zod";
import { nonEmptyString } from "../../validators/common.js";

export const firestoreIndexRecordSchema = z.object({
  url: nonEmptyString,
  status: z.enum(FirestoreIndexRequestStatus),
  createdAt: z.date(),
  numOccurences: z.number().int().min(0),
});

export const firestoreIndexPatchSchema = z.object({
  status: z.enum(FirestoreIndexRequestStatus),
  numOccurences: z.number().int().min(0),
}).partial().strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided.",
});
