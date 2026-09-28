import { toMonthYear } from "@myos/shared";
import { Router } from "express";
import { z } from "zod";
import { processError } from "../core/errors/errorResponses.js";
import { resolvePermission } from "../core/resourceBuilder/resourceBuilder.auth.js";
import { defineResource, parseOrThrow } from "../core/resourceBuilder/resourceBuilder.js";
import { budgetDomain } from "../domains/budgets/budgets.domain.js";
import { monthYearSchema } from "../domains/budgets/budgets.schemas.js";
import { firestoreIndexDomain } from "../domains/firestoreIndexes/firestoreIndexes.domain.js";
import { goalAllocationDomain, reverseAllocation } from "../domains/goalAllocations/goalAllocations.domain.js";
import { goalTransferSchema } from "../domains/goalAllocations/goalAllocations.schemas.js";
import type { GoalAllocationEntity, GoalTransferPost } from "../domains/goalAllocations/goalAllocations.types.js";
import { goalDomain } from "../domains/goals/goals.domain.js";
import { labelRuleDomain } from "../domains/labelRules/labelRules.domain.js";
import { labelRuleApplicationSchema } from "../domains/labelRules/labelRules.schemas.js";
import { lineEntryDomain } from "../domains/lineEntries/lineEntries.domain.js";
import { monthReportDomain } from "../domains/monthReports/monthReports.domain.js";
import { tagDomain } from "../domains/tags/tags.domain.js";
import { autoLabelAll } from "../services/autoLabel.js";
import { breakdownsBetween } from "../services/breakdowns.js";
import { completeGoal, transferBetweenGoals } from "../services/goals.js";
import { refreshLedger } from "../services/ledgerRefresh.js";
import { generateMonthReport } from "../services/monthReports.js";
import { computeOpening, loadSavingsSummary, startSavings } from "../services/savings.js";

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
// pulls every change since the stored cursor, keeps manual labels, runs label
// rules over what is still unlabelled, and regenerates the stored reports of
// any finished month it touched. GET /breakdowns tallies a month range by
// label, tag, Plaid category and merchant.

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
    breakdowns: {
      method: "get",
      path: "/breakdowns",
      permission: "owner",
      inputSchema: z
        .object({ from: monthYearSchema.optional(), to: monthYearSchema.optional() })
        .strict()
        .refine(({ from, to }) => !from || !to || from <= to, "from must not be after to."),
      run: async ({ input }) => {
        const { from, to } = input as { from?: string; to?: string };
        const until = to ?? toMonthYear();
        return { body: { data: await breakdownsBetween(from ?? until, until) } };
      },
    },
  },
});

// ── Label rules ───────────────────────────────────────────
// Id is `${field}_${match}_${value}`. A rule labels or excludes what is still
// unfiled (the most specific match wins) and adds tags to anything not tagged
// by hand (every match adds up). Learned rules come from a merchant's second
// sighting. Any rule write reruns every entry, and relabelling a rule moves the
// entries it labelled. POST /applications reruns, or previews with dryRun.

const labelRule = defineResource({
  inner: labelRuleDomain,
  endpoints: {
    get: { permission: "owner" },
    list: { permission: "owner" },
    create: { permission: "owner" },
    patch: { permission: "owner" },
    delete: { permission: "owner" },
  },
  actions: {
    apply: {
      method: "post",
      path: "/applications",
      permission: "owner",
      inputSchema: labelRuleApplicationSchema,
      run: async ({ input }) => ({ body: { data: await autoLabelAll(input as { dryRun: boolean }) } }),
    },
  },
});

// ── Tags ──────────────────────────────────────────────────
// The closed set of secondary tokens. Id is the normalized name ("Food
// delivery" -> food_delivery); entries and rules may only carry these.

const tag = defineResource({
  inner: tagDomain,
  endpoints: {
    list: { permission: "owner" },
    create: { permission: "owner" },
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
      inputSchema: z
        .object({
          monthYear: monthYearSchema.refine((month) => month < toMonthYear(), "Only finished months have a report."),
        })
        .strict(),
      run: async ({ input }) => ({
        status: 201,
        body: { data: await generateMonthReport((input as { monthYear: string }).monthYear) },
      }),
    },
  },
});

// ── Goals ─────────────────────────────────────────────────
// Goals are buckets inside savings. amountSaved sums the goal's ledger:
// month-end assignments (made by hand), transfers between goals (dated to any
// month, never touching month reports), spends from goal-labelled
// transactions, and the release of leftovers when a goal is completed.

const goal = defineResource({
  inner: goalDomain,
  endpoints: {
    get: { permission: "owner" },
    list: { permission: "owner" },
    create: { permission: "owner" },
    patch: { permission: "owner" },
  },
  actions: {
    complete: {
      method: "post",
      path: "/:id/completions",
      permission: "owner",
      run: async ({ params }) => ({ status: 201, body: { data: await completeGoal(params.id!) } }),
    },
  },
});

const goalAllocation = defineResource({
  inner: goalAllocationDomain,
  endpoints: {
    get: { permission: "owner" },
    list: { permission: "owner" },
    create: { permission: "owner" },
  },
  actions: {
    transfer: {
      method: "post",
      path: "/transfers",
      permission: "owner",
      inputSchema: goalTransferSchema,
      run: async ({ input }) => ({
        status: 201,
        body: { data: { transferId: await transferBetweenGoals(input as GoalTransferPost) } },
      }),
    },
    reverse: {
      method: "delete",
      path: "/:id",
      permission: "owner",
      run: async ({ existing }) => {
        await reverseAllocation(existing as GoalAllocationEntity);
        return { status: 204, body: undefined };
      },
    },
  },
});

// ── Savings ───────────────────────────────────────────────
// The parent of all goals. Not a stored resource: the summary is derived from
// the opening, finished month reports and the goal ledger.

const savings = Router();
const startSchema = z.object({ startMonth: monthYearSchema }).strict();

savings.get("/", async (req, res) => {
  try {
    await resolvePermission(req, "owner");
    res.json({ data: await loadSavingsSummary() });
  } catch (error) {
    processError(res, error, "Failed to load savings");
  }
});

savings.post("/starts", async (req, res) => {
  try {
    await resolvePermission(req, "owner");
    const { startMonth } = parseOrThrow(startSchema, req.body, "savings start");
    res.status(201).json({ data: await startSavings(startMonth) });
  } catch (error) {
    processError(res, error, "Failed to start savings");
  }
});

savings.post("/openings", async (req, res) => {
  try {
    await resolvePermission(req, "owner");
    res.status(201).json({ data: await computeOpening() });
  } catch (error) {
    processError(res, error, "Failed to compute the opening");
  }
});

// ── Mounts ────────────────────────────────────────────────
// One line per resource. Add new domains above and mount them here.

router.use("/budgets", budget.router);
router.use("/firestore-index-requests", firestoreIndex.router);
router.use("/goal-allocations", goalAllocation.router);
router.use("/goals", goal.router);
router.use("/label-rules", labelRule.router);
router.use("/line-entries", lineEntry.router);
router.use("/month-reports", monthReport.router);
router.use("/savings", savings);
router.use("/tags", tag.router);
