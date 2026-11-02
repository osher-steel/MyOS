import { isBusinessBook } from "@myos/shared";
import Link from "next/link";
import { currentBook } from "@/lib/api";
import { BookSwitcher } from "./BookSwitcher";

export type Tab = "home" | "burn" | "allocations" | "reports" | "subscriptions" | "goals" | "settings";

const TABS: Array<{ id: Tab; label: string; short?: string; href: string }> = [
  { id: "home", label: "Home", href: "/" },
  { id: "reports", label: "Monthly Reports", short: "Reports", href: "/reports" },
  { id: "subscriptions", label: "Subscriptions", short: "Subs", href: "/subscriptions" },
  { id: "goals", label: "Goals", href: "/goals" },
  { id: "settings", label: "Settings", href: "/settings" },
];

// A business book runs on a monthly burn budget and allocations instead of the personal budget and goals
const BUSINESS_TABS: typeof TABS = [
  { id: "home", label: "Home", href: "/" },
  { id: "burn", label: "Monthly Burn", short: "Burn", href: "/burn" },
  { id: "allocations", label: "Allocations", href: "/allocations" },
];

export async function Masthead({ title, current }: { title: string; current: Tab }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const tabs = isBusinessBook(await currentBook()) ? BUSINESS_TABS : TABS;

  return (
    <header className="border-b border-ink pb-4 mb-12">
      <div className="flex items-baseline justify-between gap-4">
        <p className="entry-meta uppercase tracking-[0.18em]">{today}</p>
        <BookSwitcher />
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <h1 className="masthead">{title}</h1>
        <nav aria-label="Sections" className="flex flex-wrap gap-x-5 gap-y-2 sm:gap-x-7">
          {tabs.map((tab) => {
            const active = tab.id === current;
            return (
              <Link
                key={tab.id}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`entry-meta uppercase tracking-[0.18em] pb-1 border-b ${
                  active ? "border-ink text-ink" : "border-transparent hover:border-rule"
                }`}
              >
                {tab.short ? (
                  <>
                    <span className="sm:hidden">{tab.short}</span>
                    <span className="max-sm:hidden">{tab.label}</span>
                  </>
                ) : (
                  tab.label
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
