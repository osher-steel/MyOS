import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

// Sorting stays on the document id: an equality filter plus an orderBy on
// another field needs a composite index, and callers sort by date in memory.
const lineEntryQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "monthYear", type: "stringFilter" },
  { key: "date", type: "stringFilter" },
  { key: "label", type: "stringFilter" },
  { key: "plaidStatus", type: "stringFilter" },
  { key: "osStatus", type: "stringFilter" },
  { key: "createdAt", type: "date", sortable: true },
  { key: "updatedAt", type: "date", sortable: true },
] as const);

export const lineEntryQuerySchema = lineEntryQuery.schema;
export const lineEntryQueryFilterFields = lineEntryQuery.filterFields;
