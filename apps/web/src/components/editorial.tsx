import type { ReactNode } from "react";

/** A titled block with a hairline rule — the only structural unit on the page. */
export function Section({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <section className="break-inside-avoid">
      <h2 className="section-label">
        <span>{label}</span>
        {aside ? <span className="normal-case tracking-normal">{aside}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** One row: a title, optional supporting meta, optional right-aligned figure. */
export function Entry({
  title,
  meta,
  figure,
  href,
}: {
  title: string;
  meta?: string;
  figure?: string;
  href?: string;
}) {
  return (
    <div className="entry flex gap-4 items-baseline justify-between">
      <div className="min-w-0">
        <div className="entry-title">
          {href ? (
            <a className="entry-link" href={href} target="_blank" rel="noreferrer">
              {title}
            </a>
          ) : (
            title
          )}
        </div>
        {meta ? <div className="entry-meta mt-0.5">{meta}</div> : null}
      </div>
      {figure ? <div className="figure shrink-0">{figure}</div> : null}
    </div>
  );
}

/** Shown in place of a section's contents when its upstream API fails. */
export function SourceError({ message }: { message: string }) {
  return (
    <p className="entry-meta" style={{ color: "var(--accent)" }}>
      Source unavailable — {message}
    </p>
  );
}

/**
 * Renders a section from an async source, degrading to a note instead of
 * taking the whole page down when one API is unreachable.
 */
export async function load<T>(
  fetcher: () => Promise<T>,
  render: (data: T) => ReactNode,
): Promise<ReactNode> {
  try {
    return render(await fetcher());
  } catch (error) {
    return <SourceError message={(error as Error).message.slice(0, 160)} />;
  }
}
