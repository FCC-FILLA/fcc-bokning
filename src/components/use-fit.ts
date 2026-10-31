"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Ger två refs: texten i `inner` krymps tills den får plats i `box` utan att scrolla (för skärmar utan mus).
 * Räknar om när `key` ändras, när rutan ändrar storlek och när typsnitten laddats klart.
 */
export function useFitText(key: string, min = 0.4) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const fit = () => {
      i.style.fontSize = "";
      if (getComputedStyle(b).overflow === "visible") return;
      const fits = () => i.scrollHeight <= b.clientHeight + 1;
      if (fits()) return;
      let lo = min, hi = 1;
      for (let n = 0; n < 8; n++) {
        const mid = (lo + hi) / 2;
        i.style.fontSize = `${mid}em`;
        if (fits()) lo = mid;
        else hi = mid;
      }
      i.style.fontSize = `${lo}em`;
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => ro.disconnect();
  }, [key, min]);
  return [box, inner] as const;
}
