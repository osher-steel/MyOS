"use client";

import { tagLabel, type LineEntryView, type Tag } from "@myos/shared";
import { useState } from "react";
import type { TagVocabulary } from "./useTags";

export function TagEditor({
  entry,
  vocabulary,
  onTags,
  revealOnHover = false,
}: {
  entry: LineEntryView;
  vocabulary: TagVocabulary;
  onTags: (entry: LineEntryView, tags: Tag[]) => void;
  revealOnHover?: boolean;
}) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = entry.tags ?? [];
  const available = vocabulary.tags.filter((tag) => !current.includes(tag));

  const save = (tags: Tag[]) => onTags(entry, [...new Set(tags)].sort());

  async function createAndAdd() {
    if (!draft.trim()) return setNaming(false);
    try {
      save([...current, await vocabulary.create(draft)]);
      setDraft("");
      setNaming(false);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const controls = naming ? (
    <input
      autoFocus
      aria-label="New tag"
      value={draft}
      placeholder="new tag"
      title={error ?? undefined}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void createAndAdd()}
      onKeyDown={(event) => {
        if (event.key === "Enter") void createAndAdd();
        if (event.key === "Escape") {
          setDraft("");
          setNaming(false);
        }
      }}
      className={`entry-meta w-24 bg-transparent border-b outline-none ${error ? "border-accent text-accent" : "border-ink text-ink"}`}
    />
  ) : (
    <span
      className={`inline-flex items-baseline gap-2 ${
        revealOnHover ? "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100" : ""
      }`}
    >
      {available.length > 0 ? (
        <select
          aria-label={`Add a tag to ${entry.name}`}
          value=""
          onChange={(event) => {
            if (event.target.value) save([...current, event.target.value]);
          }}
          className="entry-meta cursor-pointer appearance-none field-sizing-content bg-transparent border-b border-rule hover:border-ink hover:text-ink"
        >
          <option value="" disabled>
            tag ▾
          </option>
          {available.map((tag) => (
            <option key={tag} value={tag}>
              {tagLabel(tag)}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        aria-label="New tag"
        title="New tag"
        onClick={() => setNaming(true)}
        className="entry-meta figure border-b border-rule px-0.5 leading-none hover:border-ink hover:text-ink"
      >
        +
      </button>
    </span>
  );

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      {current.map((tag) => (
        <button
          key={tag}
          type="button"
          title="Remove tag"
          onClick={() => save(current.filter((other) => other !== tag))}
          className="entry-meta group/tag text-ink hover:text-accent"
        >
          #{tagLabel(tag)}
          <span className="text-muted group-hover/tag:text-accent"> ×</span>
        </button>
      ))}
      {controls}
    </span>
  );
}
