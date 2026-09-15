// See current budget and buckets

// Main categories --> needs, wants, saving (hard coded)
// Budget should be monthly stamped
// For budget we have the categories -->

import { Masthead } from "@/components/masthead";
import BudgetPanel from "./BudgetPanel";

export const dynamic = "force-dynamic";

export default function Finance() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Finance" current="finance" />

      <div className="grid gap-x-[var(--gutter)] gap-y-12 md:grid-cols-2">
        <BudgetPanel />
      </div>
    </main>
  );
}
