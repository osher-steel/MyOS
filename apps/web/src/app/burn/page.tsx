import { isBusinessBook } from "@myos/shared";
import { redirect } from "next/navigation";
import BurnBudget from "@/business/BurnBudget";
import { Masthead } from "@/components/masthead";
import { currentBook } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Burn() {
  if (!isBusinessBook(await currentBook())) redirect("/");
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Monthly Burn" current="burn" />
      <BurnBudget />
    </main>
  );
}
