import Link from "next/link";

export type Tab = "home" | "finance";

const TABS: Array<{ id: Tab; label: string; href: string }> = [
  { id: "home", label: "Today", href: "/" },
  { id: "finance", label: "Finance", href: "/finance" },
];

/** Page header: date line, title, and the tab rail shared by every page. */
export function Masthead({ title, current }: { title: string; current: Tab }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="border-b border-ink pb-4 mb-10">
      <p className="entry-meta uppercase tracking-[0.18em]">{today}</p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h1 className="masthead">{title}</h1>
        <nav aria-label="Sections" className="flex gap-6">
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
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
