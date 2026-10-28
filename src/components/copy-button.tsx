"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Kopiera länk" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Kopiera länken:", text);
        }
      }}
    >
      {done ? "Kopierad" : label}
    </button>
  );
}
