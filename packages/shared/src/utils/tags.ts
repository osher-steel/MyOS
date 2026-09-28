import type { Tag } from "../types/interfaces/finance.js";

export const DEFAULT_TAGS: readonly Tag[] = [
  "food_delivery",
  "bar",
  "coffee",
  "kava",
  "outing",
  "date",
  "gas",
  "rideshare",
  "parking",
  "gym",
  "streaming",
  "software",
  "business",
  "travel",
  "gift",
];

export const MAX_TAG_LENGTH = 32;

// "Food Delivery" -> "food_delivery"
export function normalizeTag(text: string): Tag {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

export function tagLabel(tag: Tag): string {
  return tag.replace(/_/g, " ");
}
