/**
 * Serialise a query record into a URL-encoded query string.
 *
 * Accepts the output of `RequestBuilder.toQuery()` or any flat record of
 * `string | string[]` values.  Keys that use bracket notation
 * (e.g. `date[gte]`) are preserved as-is.
 */
export function toQueryString(query: Record<string, string | string[]>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`,
        );
      }
    } else {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      );
    }
  }

  return parts.join("&");
}
