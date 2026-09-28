"use client";

import { BudgetGroup, toMonthYear, type Budget, type MonthYear } from "@myos/shared";
import { useEffect, useState } from "react";
import { BudgetClientError, fetchBudget, saveBudget, type BudgetDraft } from "@/lib/budgetsClient";

export type EditErrors = Record<BudgetGroup | "income" | "main", string | null>;

const NO_ERRORS: EditErrors = { income: null, needs: null, wants: null, savings: null, main: null };

/** The single savings bucket used until the month is split into categories. */
export const DEFAULT_SAVINGS = "Savings";

const EMPTY_DRAFT: BudgetDraft = { income: 0, needs: {}, wants: {}, savings: { [DEFAULT_SAVINGS]: 0 } };

type Loaded = { monthYear: MonthYear; existing: Budget | null; error: string | null };

function toDraft(budget: Budget | null): BudgetDraft {
  if (!budget) return EMPTY_DRAFT;
  const { income, needs, wants, savings } = budget;
  return { income, needs, wants, savings };
}

const sum = (allocations: Record<string, number>) =>
  Object.values(allocations).reduce((total, amount) => total + amount, 0);

export function totalAllocated(draft: BudgetDraft): number {
  return Object.values(BudgetGroup).reduce((total, group) => total + sum(draft[group]), 0);
}

/** Income left after needs and wants — what a single savings bucket absorbs. */
export function remainderForSavings(draft: BudgetDraft): number {
  return draft.income - sum(draft.needs) - sum(draft.wants);
}

/** A stored month counts as split when it has more than one savings category. */
function isSplit(budget: Budget | null): boolean {
  return budget !== null && Object.keys(budget.savings).length > 1;
}

/**
 * The draft as it will be saved. With savings unsplit, the one bucket is
 * derived — it takes whatever needs and wants leave — so the stored month is
 * always fully allocated.
 */
export function effectiveDraft(draft: BudgetDraft, splitSavings: boolean): BudgetDraft {
  if (splitSavings) return draft;
  const name = Object.keys(draft.savings)[0] ?? DEFAULT_SAVINGS;
  return { ...draft, savings: { [name]: Math.max(0, remainderForSavings(draft)) } };
}

/**
 * Draft state for one month's budget. The month comes from the URL; the
 * existing budget (if any) seeds the draft, and `existing === null` after
 * loading means save will create rather than replace. Only the current or
 * an upcoming month is editable — the API enforces the same rule.
 *
 * Savings is one derived bucket by default: it absorbs whatever income is
 * left after needs and wants, so the only possible error is overallocation.
 * Once split into categories every dollar must be placed by hand, and both
 * over- and under-allocation are errors.
 */
export function useFinanceEdit(monthYear: MonthYear) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<BudgetDraft>(EMPTY_DRAFT);
  const [splitSavings, setSplitSavingsState] = useState(false);
  const [errors, setErrors] = useState<EditErrors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let ignore = false;

    fetchBudget(monthYear)
      .then((existing) => ({ existing, error: null }))
      .catch((err: Error) => ({ existing: null, error: err.message }))
      .then((result) => {
        if (ignore) return;
        setLoaded({ monthYear, ...result });
        setDraft(toDraft(result.existing));
        setSplitSavingsState(isSplit(result.existing));
        setErrors(NO_ERRORS);
      });

    return () => {
      ignore = true;
    };
  }, [monthYear]);

  const current = loaded?.monthYear === monthYear ? loaded : null;
  const editable = monthYear >= toMonthYear();

  // ── Draft edits ─────────────────────────────────────────

  function setIncome(income: number) {
    setDraft((old) => ({ ...old, income }));
  }

  function setAllocation(group: BudgetGroup, name: string, amount: number) {
    setDraft((old) => ({ ...old, [group]: { ...old[group], [name]: amount } }));
  }

  /**
   * Toggling either way starts from the single derived bucket: turning the
   * split off collapses savings to it, turning it on seeds the first category
   * with it so the month is fully allocated until categories are carved out.
   */
  function setSplitSavings(split: boolean) {
    setSplitSavingsState(split);
    setDraft((old) => effectiveDraft(old, false));
  }

  function removeAllocation(group: BudgetGroup, name: string) {
    setDraft((old) => ({
      ...old,
      [group]: Object.fromEntries(Object.entries(old[group]).filter(([key]) => key !== name)),
    }));
  }

  // ── Rules ───────────────────────────────────────────────

  function validate(): boolean {
    const next: EditErrors = { ...NO_ERRORS };

    if (!(draft.income > 0)) next.income = "Enter the month's expected income.";
    if (Object.keys(draft.needs).length === 0) next.needs = "Add at least one category.";
    if (Object.keys(draft.wants).length === 0) next.wants = "Add at least one category.";

    const seen = new Map<string, BudgetGroup>();
    for (const group of Object.values(BudgetGroup)) {
      for (const name of Object.keys(draft[group])) {
        const other = seen.get(name);
        if (other) next.main = `"${name}" is in both ${other} and ${group}.`;
        seen.set(name, group);
      }
    }

    if (!next.main) {
      if (splitSavings) {
        const allocated = totalAllocated(draft);
        if (allocated > draft.income) {
          next.main = `Overallocated by ${allocated - draft.income}: allocations total ${allocated} against income of ${draft.income}.`;
        } else if (allocated < draft.income) {
          next.main = `Underallocated by ${draft.income - allocated}: assign the rest to a savings category.`;
        }
      } else {
        const remainder = remainderForSavings(draft);
        if (remainder < 0) {
          next.main = `Overallocated by ${-remainder}: needs and wants exceed income, leaving nothing for savings.`;
        }
      }
    }

    setErrors(next);
    return Object.values(next).every((message) => message === null);
  }

  async function save(): Promise<Budget | null> {
    if (!editable || !validate()) return null;
    setSaving(true);
    try {
      const budget = await saveBudget(monthYear, effectiveDraft(draft, splitSavings));
      setLoaded({ monthYear, existing: budget, error: null });
      setDraft(toDraft(budget));
      setSplitSavingsState(isSplit(budget));
      setSavedAt(new Date());
      return budget;
    } catch (err) {
      const message =
        err instanceof BudgetClientError && err.formErrors.length > 0
          ? err.formErrors.join(" ")
          : (err as Error).message;
      setErrors((old) => ({ ...old, main: message }));
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    monthYear,
    editable,
    loading: current === null,
    loadError: current?.error ?? null,
    /** null once loaded means this save will create the month. */
    existing: current?.existing ?? null,
    draft,
    splitSavings,
    errors,
    saving,
    savedAt,
    setIncome,
    setAllocation,
    removeAllocation,
    setSplitSavings,
    save,
  };
}
