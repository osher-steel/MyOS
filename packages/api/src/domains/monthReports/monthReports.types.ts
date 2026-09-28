import type { StoredMonthReport } from "@myos/shared";
import type z from "zod";
import type { Override } from "../../types/type-assertions.js";
import type { monthReportQuerySchema } from "./monthReports.query.js";

export type MonthReportQuery = z.infer<typeof monthReportQuerySchema>;
export type MonthReportEntity = Override<StoredMonthReport, { generatedAt: Date }>;
export type MonthReportRecord = Omit<MonthReportEntity, "id">;
