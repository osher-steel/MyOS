import type { FireTimestampLike } from "../types/index.js";

function isFirestoreTimestampLike(
  value: FireTimestampLike,
): value is { _seconds: number; _nanoseconds: number } | { seconds: number; nanoseconds: number } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const convertToDate = (value: FireTimestampLike): Date => {
  if (value instanceof Date) {
    return value;
  }

  if (isFirestoreTimestampLike(value)) {
    const seconds = "_seconds" in value ? value._seconds : value.seconds;
    const nanoseconds = "_nanoseconds" in value ? value._nanoseconds : value.nanoseconds;

    return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
  }

  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed;
  return new Date(0); // fallback
};

// Formatters take an optional IANA timezone so server-side callers can render
// wall-clock times in a fixed zone. Omitted/invalid timezone falls back to
// runtime-local, which is the right default for on-device rendering.

export const formatDateMDY = (date: Date, timezone?: string): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "N/A";

  if (timezone) {
    try {
      return date.toLocaleString("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      // invalid identifier — fall back to runtime-local
    }
  }

  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
};

export const formatTime12h = (date: Date, timezone?: string): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "N/A";

  if (timezone) {
    try {
      return date.toLocaleString("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      // invalid identifier — fall back to runtime-local
    }
  }

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${ampm}`;
};

export const formatDateTimeMDY = (date: Date, timezone?: string): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "N/A";
  return `${formatDateMDY(date, timezone)} at ${formatTime12h(date, timezone)}`;
};
