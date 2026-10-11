import { Masthead } from "@/components/masthead";
import SubscriptionsView from "@/finance/SubscriptionsView";

export const dynamic = "force-dynamic";

export default function Subscriptions() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Subscriptions" current="subscriptions" />
      <SubscriptionsView />
    </main>
  );
}
