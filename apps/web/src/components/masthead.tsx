import Link from "next/link";

export type Tab = "home" | "reports" | "goals" | "settings";

const TABS: Array<{ id: Tab; label: string; short?: string; href: string }> = [
  { id: "home", label: "Home", href: "/" },
  { id: "reports", label: "Monthly Reports", short: "Reports", href: "/reports" },
  { id: "goals", label: "Goals", href: "/goals" },
  { id: "settings", label: "Settings", href: "/settings" },
];

export function Masthead({ title, current }: { title: string; current: Tab }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="border-b border-ink pb-4 mb-12">
      <p className="entry-meta uppercase tracking-[0.18em]">{today}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <h1 className="masthead">{title}</h1>
        <nav aria-label="Sections" className="flex flex-wrap gap-x-5 gap-y-2 sm:gap-x-7">
          {TABS.map((tab) => {
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
