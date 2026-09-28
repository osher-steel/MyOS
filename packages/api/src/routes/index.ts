import { Router } from "express";
import { z } from "zod";
import { defineResource } from "../core/resourceBuilder/resourceBuilder.js";
import { budgetDomain } from "../domains/budgets/budgets.domain.js";
import { monthYearSchema } from "../domains/budgets/budgets.schemas.js";
import { firestoreIndexDomain } from "../domains/firestoreIndexes/firestoreIndexes.domain.js";
import { lineEntryDomain } from "../domains/lineEntries/lineEntries.domain.js";
import { monthReportDomain } from "../domains/monthReports/monthReports.domain.js";
import { refreshLedger } from "../services/ledgerRefresh.js";
import { generateMonthReport } from "../services/monthReports.js";

export const router = Router();

// ── Firestore index requests ──────────────────────────────
// Written by FirestoreRepo.list when Firestore rejects a query for a missing
// composite index (the caller sees 500 missing_index). Read them here to find
// the console URL that creates the index, then patch status once it's built.

const firestoreIndex = defineResource({
  inner: firestoreIndexDomain,
  endpoints: {
    get: { permission: "owner" },
    list: { permission: "owner" },
    patch: { permission: "owner" },
    delete: { permission: "owner" },
  },
});

// ── Budgets ───────────────────────────────────────────────
// One document per user-month, id `${userId}_${YYYY-MM}`. Timestamps are
// server-set; `id`, `createdAt` and `updatedAt` are filterable and sortable.

const budget = defineResource({
  inner: budgetDomain,
  endpoints: {
    get: { permission: "owner" },
    list: { permission: "owner" },
    create: { permission: "owner" },
    patch: { permission: "owner" },
    delete: { permission: "owner" },
  },
});

// ── Line entries ──────────────────────────────────────────
// One document per Plaid transaction, id = Plaid transaction_id. POST /syncs
// pulls every change since the stored cursor, keeps manual labels, and
// regenerates the stored reports of any finished month it touched.

const lineEntry = defineResource({
  inner: lineEntryDomain,
  endpoints: {
    get: { permission: "owner" },
    list: { permission: "owner" },
    create: { permission: "owner" },
    patch: { permission: "owner" },
    delete: { permission: "owner" },
  },
  actions: {
    sync: {
      method: "post",
      path: "/syncs",
      permission: "owner",
      run: async () => ({ body: { data: await refreshLedger() } }),
    },
  },
});

// ── Month reports ─────────────────────────────────────────
// One per finished month, id `${userId}_${YYYY-MM}` like budgets. Written only
// by generation, which reruns whenever that month's line entries change.

const monthReport = defineResource({
  inner: monthReportDomain,
  endpoints: {
    get: { permission: "owner" },
    list: { permission: "owner" },
  },
  actions: {
    generate: {
      method: "post",
      path: "/generations",
      permission: "owner",
      inputSchema: z.object({ monthYear: monthYearSchema }).strict(),
      run: async ({ input }) => ({
        status: 201,
        body: { data: await generateMonthReport((input as { monthYear: string }).monthYear) },
      }),
    },
  },
});

// ── Mounts ────────────────────────────────────────────────
// One line per resource. Add new domains above and mount them here.

router.use("/budgets", budget.router);
router.use("/firestore-index-requests", firestoreIndex.router);
router.use("/line-entries", lineEntry.router);
router.use("/month-reports", monthReport.router);
