import assert from "node:assert/strict";
import test from "node:test";
import {
  groupLineEntries,
  IncomeSource,
  LabelRuleField,
  LabelRuleMatch,
  LabelRuleSource,
  LabelSource,
  labelRuleId,
  learnRule,
  learnTagRule,
  lineEntryBreakdowns,
  LineEntryStatus,
  matchRule,
  monthReport,
  normalizeDescription,
  PlaidTransactionStatus,
  planAutoLabels,
  planSync,
  ruleCorrection,
  type LineEntryView,
  type PlaidTransaction,
  type RuleMatcher,
} from "@myos/shared";
import { buildLabelRuleCreateRecord, buildLabelRulePatchRecord } from "../../../src/domains/labelRules/labelRules.domain.js";
import { labelRulePatchSchema, labelRulePostSchema } from "../../../src/domains/labelRules/labelRules.schemas.js";
import { buildLineEntryPatchRecord } from "../../../src/domains/lineEntries/lineEntries.domain.js";
import { lineEntryPatchSchema } from "../../../src/domains/lineEntries/lineEntries.schemas.js";
import { tagPostSchema } from "../../../src/domains/tags/tags.schemas.js";

const SHELL_ID = "8y7851JXryBnkOWOjW163yqzAB01oa8k6e1g9";

function entry(overrides: Partial<LineEntryView>): LineEntryView {
  const base: LineEntryView = {
    id: "txn",
    name: "Purchase",
    amount: 1000,
    date: "2026-09-01",
    monthYear: "2026-09",
    currency: "USD",
    plaidStatus: PlaidTransactionStatus.POSTED,
    osStatus: LineEntryStatus.NOT_LABELLED,
    ...overrides,
  };
  return { ...base, descriptionKey: overrides.descriptionKey ?? normalizeDescription(base.originalDescription ?? base.name) };
}

const manual = (overrides: Partial<LineEntryView>) =>
  entry({ osStatus: LineEntryStatus.LABELLED, labelSource: LabelSource.MANUAL, ...overrides });

const shell = (overrides: Partial<LineEntryView>) =>
  entry({
    name: "Shell",
    merchantName: "Shell",
    merchantEntityId: SHELL_ID,
    originalDescription: "SHELL OIL 57543869002 NORTH MIAMI FL 09/22",
    categoryPrimary: "TRANSPORTATION",
    categoryDetailed: "TRANSPORTATION_GAS",
    categoryConfidence: "VERY_HIGH",
    ...overrides,
  });

const exxon = (overrides: Partial<LineEntryView>) =>
  entry({
    name: "Exxon",
    merchantName: "Exxon",
    merchantEntityId: "exxon_entity",
    originalDescription: "EXXONMOBIL 4455 MIAMI FL 09/25",
    categoryPrimary: "TRANSPORTATION",
    categoryDetailed: "TRANSPORTATION_GAS",
    categoryConfidence: "HIGH",
    ...overrides,
  });

const rule = (overrides: Partial<RuleMatcher>): RuleMatcher => ({
  id: "rule",
  name: "Rule",
  field: LabelRuleField.DESCRIPTION,
  match: LabelRuleMatch.CONTAINS,
  value: "GAS",
  label: "Auto",
  source: LabelRuleSource.MANUAL,
  enabled: true,
  ...overrides,
});

test("descriptions drop dates, reference numbers and processor prefixes", () => {
  assert.equal(normalizeDescription("TST*BARRACUDA TAPHOUSE Miami FL 09/11"), "BARRACUDA TAPHOUSE MIAMI FL");
  assert.equal(normalizeDescription("SHELL OIL 57543869002 NORTH MIAMI FL 09/22"), "SHELL OIL NORTH MIAMI FL");
  assert.equal(normalizeDescription("ZELLE PAYMENT FROM ALFREDO GARCIA WFCT22PR8JLX"), "ZELLE PAYMENT FROM ALFREDO GARCIA");
  assert.equal(normalizeDescription("POS DEBIT MCDONALD'S F14164 MIAMI FL"), "MCDONALDS MIAMI FL");
  assert.equal(normalizeDescription("UBER * EATS PENDING WILMINGTON DE 09/18"), "UBER EATS WILMINGTON DE");
});

test("second visit to the same merchant learns a merchant rule and keeps the first label manual", () => {
  const first = shell({ id: "a", date: "2026-09-01", label: "Auto", ...manualFields() });
  const second = shell({ id: "b", date: "2026-09-20", originalDescription: "SHELL OIL 11111111111 MIAMI FL 09/20" });

  const plan = planAutoLabels([second], [], [first, second]);
  assert.equal(plan.learned.length, 1);
  assert.equal(plan.learned[0]!.field, LabelRuleField.MERCHANT_ENTITY_ID);
  assert.equal(plan.learned[0]!.value, SHELL_ID);
  assert.deepEqual(plan.learned[0]!.learnedFrom, ["a"]);
  assert.deepEqual(plan.assignments, [{ id: "b", monthYear: "2026-09", label: "Auto", ruleId: plan.learned[0]!.id }]);
});

test("a new gas station learns a category rule once two other stations share a manual label", () => {
  const shellVisit = shell({ id: "a", label: "Auto", ...manualFields() });
  const marathonVisit = exxon({
    id: "b",
    name: "Marathon",
    merchantName: "Marathon",
    merchantEntityId: "marathon",
    originalDescription: "POS DEBIT MARATHON 125724 MIAMI FL",
    label: "Auto",
    ...manualFields(),
  });
  const exxonVisit = exxon({ id: "c" });

  assert.equal(learnRule(exxonVisit, [shellVisit]), undefined);
  assert.equal(learnRule(exxonVisit, [shellVisit, shell({ id: "d", label: "Auto", ...manualFields() })]), undefined);

  const draft = learnRule(exxonVisit, [shellVisit, marathonVisit]);
  assert.equal(draft?.field, LabelRuleField.CATEGORY);
  assert.equal(draft?.value, "TRANSPORTATION_GAS");
  assert.equal(draft?.label, "Auto");
  assert.deepEqual(draft?.learnedFrom, ["a", "b"]);
});

test("low confidence, catch-all and transfer categories never learn a category rule", () => {
  const bar = { categoryPrimary: "FOOD_AND_DRINK", categoryDetailed: "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR" };
  const barracuda = manual({ id: "a", merchantName: "Barracuda Taphouse", label: "Fun", categoryConfidence: "LOW", ...bar });
  const lasRosas = entry({ id: "b", merchantName: "Las Rosas", categoryConfidence: "MEDIUM", ...bar });
  assert.equal(learnRule(lasRosas, [barracuda]), undefined);

  const other = { categoryPrimary: "GENERAL_SERVICES", categoryDetailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", categoryConfidence: "VERY_HIGH" };
  assert.equal(learnRule(entry({ id: "c", name: "Vercel", ...other }), [manual({ id: "d", name: "OpenAI", label: "Tools", ...other })]), undefined);

  const transfer = { categoryPrimary: "TRANSFER_OUT", categoryDetailed: "TRANSFER_OUT_ACCOUNT_TRANSFER", categoryConfidence: "VERY_HIGH" };
  assert.equal(
    learnRule(entry({ id: "e", name: "Apple Cash sent", ...transfer }), [
      manual({ id: "f", name: "Online transfer", label: "Rent", ...transfer }),
      manual({ id: "g", name: "Venmo payment", label: "Rent", ...transfer }),
    ]),
    undefined,
  );
});

test("merchant-less entries learn from a repeated description", () => {
  const first = manual({ id: "a", name: "GATE PETRO 0412 MIAMI FL 09/02", label: "Gas and Car Maintenance" });
  const second = entry({ id: "b", name: "GATE PETRO 0977 MIAMI FL 09/19" });

  const draft = learnRule(second, [first]);
  assert.equal(draft?.field, LabelRuleField.DESCRIPTION);
  assert.equal(draft?.value, "GATE PETRO MIAMI FL");
});

test("payment-app and bank transfers never learn a rule, but a rule you write still labels them", () => {
  const zelle = { counterparties: [{ name: "Zelle", type: "payment_app" }], categoryPrimary: "TRANSFER_OUT" };
  const first = manual({ id: "a", name: "ZELLE PAYMENT TO WILLAX 25962118", label: "Eating out", ...zelle });
  const second = entry({ id: "b", name: "ZELLE PAYMENT TO WILLAX 26003411", ...zelle });
  assert.equal(learnRule(second, [first]), undefined);

  const appleCash = { counterparties: [{ name: "Apple Cash", type: "payment_app" }] };
  const sent = manual({ id: "c", name: "APPLE CASH SENT MONE 1INFINITELOOP CA 09/18", label: "Misc", ...appleCash });
  assert.equal(learnRule(entry({ id: "d", name: "APPLE CASH SENT MONE 1INFINITELOOP CA 09/21", ...appleCash }), [sent]), undefined);

  const transfer = entry({ id: "e", name: "Online Transfer to CHK ...6362 transaction#: 30892803863", categoryPrimary: "TRANSFER_OUT" });
  assert.equal(learnRule(transfer, [manual({ id: "f", name: transfer.name, label: "Savings" })]), undefined);

  const mine = rule({ match: LabelRuleMatch.TOKENS, value: "ZELLE WILLAX", label: "Eating out" });
  assert.equal(planAutoLabels([second], [mine], [first]).assignments[0]?.ruleId, "rule");
});

test("conflicting manual labels for a merchant learn nothing", () => {
  const amazon = { merchantName: "Amazon", merchantEntityId: "amazon" };
  const history = [manual({ id: "a", label: "Household", ...amazon }), manual({ id: "b", label: "Gifts", ...amazon })];
  assert.equal(learnRule(entry({ id: "c", ...amazon }), history), undefined);
});

test("rule-labelled and goal-funded entries are not history, and labelled entries are not candidates", () => {
  const byRule = shell({ id: "a", label: "Auto", labelSource: LabelSource.RULE, osStatus: LineEntryStatus.LABELLED });
  assert.equal(learnRule(shell({ id: "b" }), [byRule]), undefined);

  const legacy = shell({ id: "c", label: "Auto", osStatus: LineEntryStatus.LABELLED });
  assert.equal(learnRule(shell({ id: "d" }), [legacy])?.label, "Auto");

  const shellRule = rule({ field: LabelRuleField.MERCHANT_NAME, match: LabelRuleMatch.EXACT, value: "SHELL" });
  const plan = planAutoLabels([shell({ id: "e", goalId: "car" }), shell({ id: "f", label: "Travel" })], [shellRule], []);
  assert.deepEqual(plan.assignments, []);
});

test("the most specific rule wins, and a person's rule beats a learned one", () => {
  const rules = [
    rule({ id: "category", field: LabelRuleField.CATEGORY, match: LabelRuleMatch.EXACT, value: "TRANSPORTATION_GAS", label: "Auto" }),
    rule({ id: "merchant", field: LabelRuleField.MERCHANT_NAME, match: LabelRuleMatch.EXACT, value: "SHELL", label: "Road trip" }),
  ];
  assert.equal(matchRule(shell({}), rules)?.id, "merchant");
  assert.equal(matchRule(exxon({}), rules)?.id, "category");

  const learned = rule({ id: "learned", field: LabelRuleField.DESCRIPTION, match: LabelRuleMatch.EXACT, value: "SHELL OIL NORTH MIAMI FL", source: LabelRuleSource.LEARNED });
  const mine = rule({ id: "mine", field: LabelRuleField.DESCRIPTION, match: LabelRuleMatch.CONTAINS, value: "SHELL" });
  assert.equal(matchRule(shell({}), [learned, mine])?.id, "mine");
  assert.equal(matchRule(shell({}), [{ ...mine, enabled: false }, learned])?.id, "learned");
});

test("contains matches whole words and tokens match in any order", () => {
  const contains = rule({ value: "GAS" });
  assert.equal(matchRule(entry({ name: "LAS VEGAS SOUVENIRS" }), [contains]), undefined);
  assert.ok(matchRule(entry({ name: "CITGO GAS 0042" }), [contains]));

  const tokens = rule({ match: LabelRuleMatch.TOKENS, value: "TAPHOUSE BARRACUDA" });
  assert.ok(matchRule(entry({ originalDescription: "TST*BARRACUDA TAPHOUSE Miami FL 09/11" }), [tokens]));
});

test("a disabled rule is never re-learned", () => {
  const first = shell({ id: "a", label: "Auto", ...manualFields() });
  const disabledId = labelRuleId(LabelRuleField.MERCHANT_ENTITY_ID, LabelRuleMatch.EXACT, SHELL_ID);
  const disabled = rule({ id: disabledId, field: LabelRuleField.MERCHANT_ENTITY_ID, match: LabelRuleMatch.EXACT, value: SHELL_ID, enabled: false });

  const plan = planAutoLabels([shell({ id: "b" })], [disabled], [first]);
  assert.deepEqual(plan, { assignments: [], tagAssignments: [], learned: [] });
});

test("a rule learned early in a batch labels later entries in the same batch", () => {
  const first = shell({ id: "a", date: "2026-08-01", label: "Auto", ...manualFields() });
  const plan = planAutoLabels([shell({ id: "c", date: "2026-09-10" }), shell({ id: "b", date: "2026-09-01" })], [], [first]);
  assert.equal(plan.learned.length, 1);
  assert.deepEqual(plan.assignments.map((row) => row.id), ["b", "c"]);
});

test("hand corrections retrain learned merchant rules and switch off learned category rules", () => {
  const merchant = rule({ field: LabelRuleField.MERCHANT_NAME, source: LabelRuleSource.LEARNED, label: "Dining" });
  assert.deepEqual(ruleCorrection(merchant, "Fun"), { label: "Fun" });
  assert.deepEqual(ruleCorrection({ ...merchant, field: LabelRuleField.CATEGORY }, "Fun"), { enabled: false });
  assert.equal(ruleCorrection({ ...merchant, source: LabelRuleSource.MANUAL }, "Fun"), undefined);
  assert.equal(ruleCorrection(merchant, "Dining"), undefined);
  assert.equal(ruleCorrection(merchant, undefined), undefined);
});

test("a posted transaction inherits the pending one's label source, rule and tags", () => {
  const pending = shell({
    id: "pending",
    label: "Auto",
    labelSource: LabelSource.RULE,
    ruleId: "r1",
    tags: ["travel"],
    tagSource: LabelSource.MANUAL,
    osStatus: LineEntryStatus.LABELLED,
    plaidStatus: PlaidTransactionStatus.PENDING,
  });
  const posted: PlaidTransaction = {
    id: "posted",
    name: "Shell",
    amount: 1000,
    date: "2026-09-02",
    currency: "USD",
    pending: false,
    pendingTransactionId: "pending",
    merchantName: "Shell",
    originalDescription: "SHELL OIL 57543869002 NORTH MIAMI FL 09/22",
    counterparties: [{ name: "Shell", type: "merchant" }],
  };

  const plan = planSync({ added: [posted], modified: [], removed: [] }, new Map([["pending", pending]]));
  const created = plan.creates[0]!;
  assert.equal(created.labelSource, LabelSource.RULE);
  assert.equal(created.ruleId, "r1");
  assert.deepEqual(created.tags, ["travel"]);
  assert.equal(created.tagSource, LabelSource.MANUAL);
  assert.equal(created.merchantName, "Shell");
  assert.equal(created.descriptionKey, "SHELL OIL NORTH MIAMI FL");
  assert.ok(!("categoryDetailed" in created));
});

test("breakdowns tally labels, tags, Plaid categories and merchants", () => {
  const rows = [
    shell({ id: "a", amount: 4000, label: "Auto" }),
    exxon({ id: "b", amount: 3000, label: "Auto" }),
    entry({ id: "c", amount: 2500, merchantName: "Barracuda Taphouse", tags: ["bar", "outing"] }),
    entry({ id: "d", amount: 1500, merchantName: "Barracuda Taphouse", tags: ["bar"], plaidStatus: PlaidTransactionStatus.REMOVED }),
    entry({ id: "e", amount: 112000, name: "Online Transfer to CHK ...8672", osStatus: LineEntryStatus.EXCLUDED }),
  ];
  const breakdowns = lineEntryBreakdowns(rows);
  assert.deepEqual(breakdowns.byLabel.Auto, { count: 2, amount: 7000 });
  assert.deepEqual(breakdowns.byCategory.TRANSPORTATION_GAS, { count: 2, amount: 7000 });
  assert.deepEqual(breakdowns.byTag.bar, { count: 1, amount: 2500 });
  assert.deepEqual(breakdowns.byMerchant["Barracuda Taphouse"], { count: 1, amount: 2500 });
});

test("rule create normalizes the value and only merchant text fields allow loose matches", () => {
  const parsed = labelRulePostSchema.parse({ field: "description", match: "contains", value: "shell oil!", label: "Auto" });
  const record = buildLabelRuleCreateRecord(parsed);
  assert.equal(record.value, "SHELL OIL");
  assert.equal(record.source, LabelRuleSource.MANUAL);
  assert.equal(record.enabled, true);
  assert.equal(labelRuleId(parsed.field, parsed.match, parsed.value), "description_contains_SHELL-OIL");

  assert.equal(labelRulePostSchema.safeParse({ field: "category", match: "contains", value: "GAS", label: "Auto" }).success, false);
  assert.equal(labelRulePostSchema.safeParse({ field: "description", value: "***", label: "Auto" }).success, false);
  assert.equal(labelRulePatchSchema.safeParse({ value: "EXXON" }).success, false);
});

test("a hand exclusion drops the label and goal and marks the entry manual", () => {
  const record = buildLineEntryPatchRecord(lineEntryPatchSchema.parse({ osStatus: "excluded" }));
  assert.equal(record.osStatus, LineEntryStatus.EXCLUDED);
  assert.equal(record.labelSource, LabelSource.MANUAL);
  assert.ok("label" in record && "goalId" in record && "ruleId" in record);
  assert.equal(lineEntryPatchSchema.safeParse({ osStatus: "excluded", label: "Rent" }).success, false);
});

test("a hand label marks the entry manual and clears its rule, and tags are normalized", () => {
  const record = buildLineEntryPatchRecord({ label: "Auto" });
  assert.equal(record.labelSource, LabelSource.MANUAL);
  assert.ok("ruleId" in record);
  assert.equal(buildLineEntryPatchRecord({ amount: 1 }).labelSource, undefined);

  assert.deepEqual(lineEntryPatchSchema.parse({ tags: ["Outing", "bar", " BAR "] }).tags, ["bar", "outing"]);
  assert.deepEqual(lineEntryPatchSchema.parse({ tags: ["Food Delivery"] }).tags, ["food_delivery"]);
  assert.equal(lineEntryPatchSchema.safeParse({ tags: ["!!!"] }).success, false);
  assert.ok("tags" in buildLineEntryPatchRecord({ tags: [] }));
  assert.equal(buildLineEntryPatchRecord({ tags: ["bar"] }).tagSource, LabelSource.MANUAL);
  assert.equal(lineEntryPatchSchema.safeParse({ labelSource: "rule" }).success, false);
});

const transferTo8672 = (overrides: Partial<LineEntryView>) =>
  entry({
    name: "Online Transfer to CHK ...8672 transaction#: 30751599929 09/02",
    amount: 112000,
    categoryPrimary: "TRANSFER_OUT",
    categoryDetailed: "TRANSFER_OUT_ACCOUNT_TRANSFER",
    ...overrides,
  });

const doordash = (overrides: Partial<LineEntryView>) =>
  entry({
    name: "DD *DOORDASH DENNYS CA 09/21",
    merchantName: "Denny's",
    merchantEntityId: "dennys",
    marketplace: "DoorDash",
    counterparties: [
      { name: "Denny's", type: "merchant" },
      { name: "DoorDash", type: "marketplace" },
    ],
    ...overrides,
  });

test("an exclusion rule files own-account transfers as excluded and they leave every total", () => {
  const ownAccount = rule({ id: "own", field: LabelRuleField.DESCRIPTION, match: LabelRuleMatch.TOKENS, value: "TRANSFER 8672", label: undefined, exclude: true });
  const out = transferTo8672({ id: "a" });
  const back = transferTo8672({ id: "b", name: "Online Transfer from CHK ...8672 transaction#: 1", amount: -50000 });
  const plan = planAutoLabels([out, back], [ownAccount], []);
  assert.deepEqual(plan.assignments.map((row) => row.exclude), [true, true]);
  assert.equal(matchRule(transferTo8672({ name: "Online Transfer to CHK ...6362" }), [ownAccount]), undefined);

  const excluded = [{ ...out, osStatus: LineEntryStatus.EXCLUDED }, { ...back, osStatus: LineEntryStatus.EXCLUDED }];
  const report = monthReport("2026-09", null, [...excluded, shell({ id: "c", amount: 4000, label: "Auto" })]);
  assert.equal(report.spent, 4000);
  assert.equal(report.entry, 0);
  assert.equal(groupLineEntries(excluded).unlabelled.length, 0);
});

test("tags from every matching rule add up, alongside the one rule that labels", () => {
  const rules = [
    rule({ id: "dennys", field: LabelRuleField.MERCHANT_NAME, match: LabelRuleMatch.EXACT, value: "DENNYS", label: "Eating out", tags: ["date"] }),
    rule({ id: "delivery", field: LabelRuleField.COUNTERPARTY, match: LabelRuleMatch.EXACT, value: "DOORDASH", label: undefined, tags: ["food_delivery"] }),
  ];
  const plan = planAutoLabels([doordash({ id: "a" })], rules, []);
  assert.deepEqual(plan.assignments, [{ id: "a", monthYear: "2026-09", ruleId: "dennys", label: "Eating out" }]);
  assert.deepEqual(plan.tagAssignments, [{ id: "a", monthYear: "2026-09", tags: ["date", "food_delivery"], ruleIds: ["dennys", "delivery"] }]);
});

test("rule tags reach labelled entries but never override tags picked by hand, and drop when no rule matches", () => {
  const delivery = rule({ id: "delivery", field: LabelRuleField.COUNTERPARTY, match: LabelRuleMatch.EXACT, value: "DOORDASH", label: undefined, tags: ["food_delivery"] });
  const labelled = doordash({ id: "a", label: "Eating out", ...manualFields() });
  assert.deepEqual(planAutoLabels([labelled], [delivery], []).tagAssignments[0]?.tags, ["food_delivery"]);

  const handTagged = doordash({ id: "b", tags: ["date"], tagSource: LabelSource.MANUAL });
  assert.deepEqual(planAutoLabels([handTagged], [delivery], []).tagAssignments, []);

  const stale = shell({ id: "c", tags: ["food_delivery"], tagSource: LabelSource.RULE });
  assert.deepEqual(planAutoLabels([stale], [delivery], []).tagAssignments[0]?.tags, []);
});

test("tagging one delivery order by hand teaches every order from that app", () => {
  const first = doordash({ id: "a", tags: ["food_delivery", "date"], tagSource: LabelSource.MANUAL });
  const other = doordash({ id: "b", name: "DD *DOORDASH WORLDFAM CA", merchantName: "Worldfam", merchantEntityId: "worldfam" });

  const draft = learnTagRule(other, [first]);
  assert.equal(draft?.field, LabelRuleField.COUNTERPARTY);
  assert.equal(draft?.name, "DoorDash");
  assert.deepEqual(draft?.tags, ["date", "food_delivery"]);

  const second = doordash({ id: "c", name: "DD *DOORDASH TACO", merchantName: "Taco", merchantEntityId: "taco", tags: ["food_delivery"], tagSource: LabelSource.MANUAL });
  assert.deepEqual(learnTagRule(other, [first, second])?.tags, ["food_delivery"]);

  const uber = { merchantName: "Uber", merchantEntityId: "uber" };
  const ride = manual({ id: "d", label: "Fun", tags: ["rideshare"], tagSource: LabelSource.MANUAL, ...uber });
  assert.equal(learnTagRule(entry({ id: "e", ...uber }), [ride])?.field, LabelRuleField.MERCHANT_ENTITY_ID);
});

test("a tag learned for a merchant joins that merchant's learned label rule", () => {
  const barracuda = { merchantName: "Barracuda Taphouse", categoryPrimary: "FOOD_AND_DRINK" };
  const learned = rule({ id: labelRuleId(LabelRuleField.MERCHANT_NAME, LabelRuleMatch.EXACT, "BARRACUDA TAPHOUSE"), field: LabelRuleField.MERCHANT_NAME, match: LabelRuleMatch.EXACT, value: "BARRACUDA TAPHOUSE", label: "Fun", source: LabelRuleSource.LEARNED });
  const tagged = manual({ id: "a", label: "Fun", tags: ["bar"], tagSource: LabelSource.MANUAL, ...barracuda });
  const next = entry({ id: "b", ...barracuda });

  const plan = planAutoLabels([next], [learned], [tagged]);
  assert.equal(plan.learned.length, 1);
  assert.equal(plan.learned[0]!.id, learned.id);
  assert.equal(plan.learned[0]!.label, "Fun");
  assert.deepEqual(plan.learned[0]!.tags, ["bar"]);
  assert.deepEqual(plan.tagAssignments[0]?.tags, ["bar"]);
});

test("income labels learn from credits and only ever land on credits", () => {
  const ach = "ORIG CO NAME:DIBS PARKING INC ORIG ID:1234567890 DESC DATE:250901 CO ENTRY DESCR:TRANSFER";
  const paid = manual({ id: "a", name: ach, amount: -250000, label: IncomeSource.DIBS_PAY, categoryPrimary: "INCOME" });
  const nextPay = entry({ id: "b", name: ach.replace("250901", "250915"), amount: -250000, categoryPrimary: "INCOME" });
  assert.equal(learnRule(nextPay, [paid])?.label, IncomeSource.DIBS_PAY);

  const debit = entry({ id: "c", name: ach, amount: 1500 });
  assert.equal(learnRule(debit, [paid]), undefined);
  const dibs = rule({ field: LabelRuleField.DESCRIPTION, match: LabelRuleMatch.CONTAINS, value: "DIBS PARKING INC", label: IncomeSource.DIBS_PAY });
  assert.equal(matchRule(debit, [dibs]), undefined);
  assert.equal(matchRule(nextPay, [dibs])?.label, IncomeSource.DIBS_PAY);
});

test("month reports break down by label, tag and category and count what is unlabelled, budget or not", () => {
  const rows = [
    shell({ id: "a", amount: 4000, label: "Auto" }),
    entry({ id: "b", amount: 2500, merchantName: "Barracuda Taphouse", label: "Fun", tags: ["bar"] }),
    entry({ id: "c", amount: 1200, name: "Unknown shop" }),
    entry({ id: "d", amount: -250000, name: "DIBS ACH", label: IncomeSource.DIBS_PAY }),
  ];
  const report = monthReport("2026-08", null, rows);
  assert.equal(report.unlabelledCount, 1);
  assert.equal(report.unlabelledSpent, 1200);
  assert.deepEqual(report.breakdowns.byLabel.Fun, { count: 1, amount: 2500 });
  assert.deepEqual(report.breakdowns.byLabel[IncomeSource.DIBS_PAY], { count: 1, amount: -250000 });
  assert.deepEqual(report.breakdowns.byTag.bar, { count: 1, amount: 2500 });
  assert.deepEqual(report.breakdowns.byCategory.TRANSPORTATION_GAS, { count: 1, amount: 4000 });
});

test("rules need a label, exclude or tags, and a readable name", () => {
  const record = buildLabelRuleCreateRecord(labelRulePostSchema.parse({ field: "counterparty", value: "DoorDash", tags: ["food_delivery"] }));
  assert.equal(record.name, "DOORDASH");
  assert.deepEqual(record.tags, ["food_delivery"]);
  assert.equal(record.label, undefined);

  assert.equal(labelRulePostSchema.safeParse({ field: "counterparty", value: "DoorDash" }).success, false);
  assert.equal(labelRulePostSchema.safeParse({ field: "description", value: "8672", label: "Rent", exclude: true }).success, false);
  assert.equal(labelRulePostSchema.parse({ name: "Chase ...8672", field: "description", match: "tokens", value: "transfer 8672", exclude: true }).exclude, true);

  const existing = { ...record, id: "x", tags: ["food_delivery"] };
  assert.throws(() => buildLabelRulePatchRecord(existing, labelRulePatchSchema.parse({ tags: [] })));
  const relabelled = buildLabelRulePatchRecord(existing, labelRulePatchSchema.parse({ label: "Eating out" }));
  assert.equal(relabelled.label, "Eating out");
  assert.equal(relabelled.source, LabelRuleSource.MANUAL);
});

function manualFields(): Partial<LineEntryView> {
  return { labelSource: LabelSource.MANUAL, osStatus: LineEntryStatus.LABELLED };
}

test("new tags are stored under their normalized name", () => {
  assert.equal(tagPostSchema.parse({ name: "Food Delivery" }).name, "food_delivery");
  assert.equal(tagPostSchema.parse({ name: " date-night! " }).name, "date_night");
  assert.equal(tagPostSchema.safeParse({ name: "!!" }).success, false);
});
