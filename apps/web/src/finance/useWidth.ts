"use client";

import { useCallback, useState } from "react";

export function useWidth(fallback: number) {
  const [width, setWidth] = useState(fallback);

  const measure = useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      setWidth(Math.round(node.getBoundingClientRect().width) || fallback);
      const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width) || fallback));
      observer.observe(node);
      return () => observer.disconnect();
    },
    [fallback],
  );

  return [measure, width] as const;
}
