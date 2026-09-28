import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

const goalQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "name", type: "stringFilter", sortable: true },
  { key: "status", type: "stringFilter" },
  { key: "createdAt", type: "date", sortable: true },
] as const);

export const goalQuerySchema = goalQuery.schema;
export const goalQueryFilterFields = goalQuery.filterFields;
