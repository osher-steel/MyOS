import { MAX_TAG_LENGTH, normalizeTag } from "@myos/shared";
import z from "zod";

export const tagName = z
  .string()
  .max(MAX_TAG_LENGTH * 2)
  .transform(normalizeTag)
  .pipe(z.string().min(1, "A tag needs a letter or digit."));

export const tagPostSchema = z.object({ name: tagName }).strict();

export const tagRecordSchema = z.object({ createdAt: z.date() }).strict();
