import { isBusinessBook } from "@myos/shared";
import BusinessHome from "@/business/BusinessHome";
import { Masthead } from "@/components/masthead";
import HomeView from "@/finance/HomeView";
import { currentBook } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Home() {
  const business = isBusinessBook(await currentBook());
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title={business ? "DIBS" : "Hello Osher"} current="home" />
      {business ? <BusinessHome /> : <HomeView />}
    </main>
  );
}
