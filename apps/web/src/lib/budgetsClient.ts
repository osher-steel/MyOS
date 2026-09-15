import type { Budget, ErrorResponse, MonthYear } from "@myos/shared";

/**
 * Browser-side calls to the Next proxy at /api/budgets/[monthYear]. Safe to
 * import from client components — no secrets here; the proxy holds the key.
 */

export type BudgetDraft = Pick<Budget, "income" | "needs" | "wants" | "savings">;

export class BudgetClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    /** Cross-field rule messages from the API, when it sent any. */
    public readonly formErrors: string[] = [],
  ) {
    super(message);
    this.name = "BudgetClientError";
  }
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { data?: T } & Partial<ErrorResponse>;
  if (!res.ok) {
    const details = body.details as { formErrors?: string[] } | undefined;
    throw new BudgetClientError(
      body.error ?? `Request failed (${res.status})`,
      res.status,
      body.code ?? "internal_error",
      details?.formErrors ?? [],
    );
  }
  return body.data as T;
}

/** The month's budget, or null when none has been created yet. */
export async function fetchBudget(monthYear: MonthYear): Promise<Budget | null> {
  const res = await fetch(`/api/budgets/${monthYear}`);
  if (res.status === 404) return null;
  return unwrap<Budget>(res);
}

/** Create or replace the month's budget. The proxy picks POST or PATCH. */
export async function saveBudget(monthYear: MonthYear, draft: BudgetDraft): Promise<Budget> {
  const res = await fetch(`/api/budgets/${monthYear}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  return unwrap<Budget>(res);
}
