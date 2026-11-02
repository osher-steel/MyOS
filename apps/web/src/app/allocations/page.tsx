import { isBusinessBook } from "@myos/shared";
import { redirect } from "next/navigation";
import Allocations from "@/business/Allocations";
import { Masthead } from "@/components/masthead";
import { currentBook } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function AllocationsPage() {
  if (!isBusinessBook(await currentBook())) redirect("/");
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Allocations" current="allocations" />
      <Allocations />
    </main>
  );
}
