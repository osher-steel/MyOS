import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

// Ids are `${userId}_${YYYY-MM}`, so `id[prefix]=u123_2026` lists one user's
// year and the default id sort is chronological within a user.
const budgetQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "createdAt", type: "date", sortable: true },
  { key: "updatedAt", type: "date", sortable: true },
] as const);

export const budgetQuerySchema = budgetQuery.schema;
export const budgetQueryFilterFields = budgetQuery.filterFields;
