"use client";

import { normalizeTag, type Tag } from "@myos/shared";
import { useCallback, useEffect, useState } from "react";
import { ProxyClientError } from "@/lib/proxyClient";
import { createTag, fetchTags } from "@/lib/tagsClient";

export type TagVocabulary = { tags: Tag[]; create: (name: string) => Promise<Tag>; error: string | null };

export function useTags(): TagVocabulary {
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTags()
      .then(setTags)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const create = useCallback(async (name: string) => {
    const wanted = normalizeTag(name);
    try {
      const tag = await createTag(name);
      setTags((current) => [...new Set([...current, tag])].sort());
      return tag;
    } catch (cause) {
      // Someone already made it; it is just missing from this tab's list
      if (cause instanceof ProxyClientError && cause.status === 409) {
        setTags((current) => [...new Set([...current, wanted])].sort());
        return wanted;
      }
      throw cause;
    }
  }, []);

  return { tags, create, error };
}
