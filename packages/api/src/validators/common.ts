import { z } from "zod";

export const FIRESTORE_IN_MAX = 30;

export const isoDatetimeToDate = z.iso.datetime().transform((value) => new Date(value));


export const dateSchema = z.preprocess(
  (value) => {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === "string" || typeof value === "number") {
      const parsedDate = new Date(value);

      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    }

    return value;
  },
  z.date().refine((value) => !Number.isNaN(value.getTime()), "Invalid date.")
);

export const booleanFromString = z
  .enum(["true", "false"])
  .transform((val) => val === "true");

export const booleanEqFilter = z.union([
  booleanFromString.transform((value) => ({ eq: value })),
  z.object({
    eq: booleanFromString.optional(),
    neq: booleanFromString.optional(),
  }).strict(),
]);



export const dateFilter = z.union([
  dateSchema.transform((value) => ({ eq: value })),
  z.object({
    eq: dateSchema.optional(),
    neq: dateSchema.optional(),
    gt: dateSchema.optional(),
    gte: dateSchema.optional(),
    lt: dateSchema.optional(),
    lte: dateSchema.optional(),
  }).strict(),
]);

export const numFilter = z.union([
  z.coerce.number().transform((value) => ({ eq: value })),
  z.object({
    eq: z.coerce.number().optional(),
    neq: z.coerce.number().optional(),
    gt: z.coerce.number().optional(),
    gte: z.coerce.number().optional(),
    lt: z.coerce.number().optional(),
    lte: z.coerce.number().optional(),
  }).strict(),
]);

// A query string carries one value per key, so `field[in]=a,b,c` arrives as a
// single comma-separated string. Accept that as well as a real array, so
// programmatic callers passing an array are unaffected.
const inList = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
      : value,
  z.array(z.string().trim().min(1)).min(1).max(FIRESTORE_IN_MAX)
);

export const stringFilter = z.union([
  z.string().trim().min(1).transform((value) => ({ eq: value })),
  z.object({
    eq: z.string().trim().min(1).optional(),
    neq: z.string().trim().min(1).optional(),
    prefix: z.string().trim().min(1).optional(),
    in: inList.optional(),
  })
    .strict()
    .refine(
      (value) => (value.eq ? 1 : 0) + (value.neq ? 1 : 0) + (value.prefix ? 1 : 0) + (value.in ? 1 : 0) === 1,
      "Provide exactly one of eq, neq, prefix, or in."
    ),
]);

export const arrayContainsFilter = z.union([
  z.string().trim().min(1).transform((value) => ({ arrayContains: value })),
  z.object({
    arrayContains: z.string().trim().min(1),
  }).strict(),
]);

export const nonEmptyString = z.string().trim().min(1);

// Valid IANA timezone identifier (e.g. "America/New_York"), verified against
// the runtime's timezone database rather than a pattern.
export const ianaTimezone = z.string().trim().min(1, "Timezone is required.").refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Must be a valid IANA timezone (e.g. America/New_York).");


export function nonEmptyStringWith(message: string) {
  return z.string().trim().min(1, message);
}

export type BooleanFilter = z.infer<typeof booleanEqFilter>;
export type DateFilter = z.infer<typeof dateFilter>;
export type NumberFilter = z.infer<typeof numFilter>;
export type StringFilter = z.infer<typeof stringFilter>;
export type ArrayContainsFilter = z.infer<typeof arrayContainsFilter>;
