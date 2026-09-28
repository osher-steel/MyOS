import { defineListQuery } from "../../core/firestore/firestoreQuery.js";

const labelRuleQuery = defineListQuery([
  { key: "id", type: "stringFilter", useDocumentId: true, sortable: true },
  { key: "field", type: "stringFilter" },
  { key: "label", type: "stringFilter" },
  { key: "source", type: "stringFilter" },
  { key: "enabled", type: "boolean" },
  { key: "matchCount", type: "number", sortable: true },
  { key: "createdAt", type: "date", sortable: true },
] as const);

export const labelRuleQuerySchema = labelRuleQuery.schema;
export const labelRuleQueryFilterFields = labelRuleQuery.filterFields;
