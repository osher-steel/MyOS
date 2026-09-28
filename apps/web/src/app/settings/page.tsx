import { Masthead } from "@/components/masthead";
import RulesSettings from "@/finance/RulesSettings";

export const dynamic = "force-dynamic";

export default function Settings() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Settings" current="settings" />
      <RulesSettings />
    </main>
  );
}
