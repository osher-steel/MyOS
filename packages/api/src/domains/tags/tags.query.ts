import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

const tagQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "createdAt", type: "date", sortable: true },
] as const);

export const tagQuerySchema = tagQuery.schema;
export const tagQueryFilterFields = tagQuery.filterFields;
