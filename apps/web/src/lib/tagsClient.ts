import type { Tag, TagDefinition } from "@myos/shared";
import { unwrap } from "./proxyClient";

export async function fetchTags(): Promise<Tag[]> {
  const tags = await unwrap<TagDefinition[]>(await fetch("/api/tags"));
  return tags.map((tag) => tag.id).sort();
}

export async function createTag(name: string): Promise<Tag> {
  const res = await fetch("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return (await unwrap<TagDefinition>(res)).id;
}
