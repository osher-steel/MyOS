import { MONTH_REPORTS_COLLECTION } from "@myos/shared";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { monthReportQueryFilterFields, monthReportQuerySchema } from "./monthReports.query.js";
import type { MonthReportEntity, MonthReportQuery, MonthReportRecord } from "./monthReports.types.js";

export const monthReportRepo = new FirestoreRepo<
  FirestoreRepoTypeSet<MonthReportEntity, MonthReportRecord, MonthReportQuery, MonthReportRecord>
>(MONTH_REPORTS_COLLECTION, monthReportQueryFilterFields);

export const monthReportDomain: DomainInner = {
  resourceName: "monthReport",
  repo: monthReportRepo,
  schemas: { query: monthReportQuerySchema },
};
