import { Masthead } from "@/components/masthead";
import GoalsView from "@/finance/GoalsView";

export const dynamic = "force-dynamic";

export default function Goals() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Goals" current="goals" />
      <GoalsView />
    </main>
  );
}
