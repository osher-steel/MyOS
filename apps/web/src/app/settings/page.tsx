import { isBusinessBook } from "@myos/shared";
import { redirect } from "next/navigation";
import { currentBook } from "@/lib/api";
import { Masthead } from "@/components/masthead";
import RulesSettings from "@/finance/RulesSettings";

export const dynamic = "force-dynamic";

export default async function Settings() {
  if (isBusinessBook(await currentBook())) redirect("/burn");
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Settings" current="settings" />
      <RulesSettings />
    </main>
  );
}
