import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

const firestoreIndexQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "status", type: "stringFilter", sortable: true },
  { key: "createdAt", type: "date", sortable: true },
  { key: "numOccurences", type: "number", sortable: true },
] as const);

export const firestoreIndexQuerySchema = firestoreIndexQuery.schema;
export const firestoreIndexQueryFilterFields = firestoreIndexQuery.filterFields;
