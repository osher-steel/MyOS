import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

const goalAllocationQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "goalId", type: "stringFilter" },
  { key: "monthYear", type: "stringFilter" },
  { key: "reason", type: "stringFilter" },
  { key: "transferId", type: "stringFilter" },
  { key: "createdAt", type: "date", sortable: true },
] as const);

export const goalAllocationQuerySchema = goalAllocationQuery.schema;
export const goalAllocationQueryFilterFields = goalAllocationQuery.filterFields;
