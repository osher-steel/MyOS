import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

const monthReportQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "monthYear", type: "stringFilter" },
  { key: "generatedAt", type: "date", sortable: true },
] as const);

export const monthReportQuerySchema = monthReportQuery.schema;
export const monthReportQueryFilterFields = monthReportQuery.filterFields;
