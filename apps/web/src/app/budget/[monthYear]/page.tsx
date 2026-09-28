import { isMonthYear } from "@myos/shared";
import { notFound } from "next/navigation";
import { Masthead } from "@/components/masthead";
import BudgetEditor from "../BudgetEditor";

export const dynamic = "force-dynamic";

/** The month is the URL; everything else is client state in BudgetEditor. */
export default async function EditBudget({ params }: PageProps<"/finance/edit/[monthYear]">) {
  const { monthYear } = await params;
  if (!isMonthYear(monthYear)) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Finance" current="finance" />
      <div className="grid gap-x-[var(--gutter)] gap-y-12 md:grid-cols-2">
        <BudgetEditor monthYear={monthYear} />
      </div>
    </main>
  );
}
