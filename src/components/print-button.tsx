"use client";

export function PrintButton({ label = "Skriv ut" }: { label?: string }) {
  return (
    <button type="button" className="btn print:hidden" onClick={() => window.print()}>
      {label}
    </button>
  );
}
