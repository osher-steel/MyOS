import { Timestamp } from "../../config/firebase.js";

/**
 * Recursively converts Firestore Timestamps to native JS Dates.
 * Handles nested objects and arrays. Returns primitive values unchanged.
 */
export function convertTimestampsToDates<T>(value: T): T {
  if (value instanceof Timestamp) {
    return value.toDate() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => convertTimestampsToDates(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = convertTimestampsToDates(val);
    }
    return result as unknown as T;
  }
  return value;
}
