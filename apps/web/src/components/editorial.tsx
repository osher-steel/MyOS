import type { ReactNode } from "react";

/** A titled block with a hairline rule — the only structural unit on the page. */
export function Section({
  label,
  aside,
  children,
}: {
  label: string;
  aside?: ReactNode;
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

/** One row: a title, optional supporting meta, an optional label slot, and a right-aligned figure. */
export function Entry({
  title,
  meta,
  metaAside,
  figure,
  positive,
  href,
  label,
  onOpen,
  className,
}: {
  title: string;
  meta?: ReactNode;
  metaAside?: ReactNode;
  figure?: string;
  positive?: boolean;
  href?: string;
  label?: ReactNode;
  onOpen?: () => void;
  className?: string;
}) {
  const heading = (
    <div className="entry-title truncate">
      {href ? (
        <a className="entry-link" href={href} target="_blank" rel="noreferrer">
          {title}
        </a>
      ) : (
        title
      )}
    </div>
  );
  const metaLine = meta ? <span className="entry-meta truncate leading-normal">{meta}</span> : null;

  return (
    <div className={`entry group flex items-center gap-4 ${className ?? ""}`}>
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block max-w-full cursor-pointer text-left hover:text-accent">
            {heading}
          </button>
        ) : (
          heading
        )}
        {metaLine || metaAside ? (
          <div className="mt-[3px] flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            {onOpen && metaLine ? (
              <button type="button" tabIndex={-1} onClick={onOpen} className="min-w-0 max-w-full cursor-pointer truncate text-left">
                {metaLine}
              </button>
            ) : (
              metaLine
            )}
            {metaAside}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 md:flex-row md:items-center md:gap-4">
        {figure ? <div className={`figure order-first text-right md:order-last md:w-[110px] ${positive ? "text-positive" : ""}`}>{figure}</div> : null}
        {label}
      </div>
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
