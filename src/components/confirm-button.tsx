"use client";

import { useState } from "react";

/** Knapp som kräver en andra bekräftelse innan formuläret skickas. */
export function ConfirmButton({
  label,
  question,
  confirmLabel,
  className = "btn btn-danger",
  formAction,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  className?: string;
  /** Skicka till en annan server action än formulärets egen. */
  formAction?: (fd: FormData) => void | Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      {question}
      <button type="submit" className="btn btn-danger" formAction={formAction}>{confirmLabel}</button>
      <button type="button" className="btn" onClick={() => setAsking(false)}>Avbryt</button>
    </span>
  );
}
