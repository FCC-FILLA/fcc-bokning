"use client";

import { useState } from "react";

type L = { description: string; quantity: number; unit: string | null; unit_price: number; vat_rate: number; quote_id: string | null };

/** Redigerbara rader i ett fakturaunderlag. Kryssa i "Ta bort" för att stryka en rad. */
export function InvoiceLinesEditor({ lines }: { lines: L[] }) {
  const [rows, setRows] = useState<L[]>(lines.length ? lines : [{ description: "", quantity: 1, unit: "st", unit_price: 0, vat_rate: 25, quote_id: null }]);
  return (
    <div className="grid gap-2 overflow-x-auto">
      <input type="hidden" name="line_count" value={rows.length} />
      <div className="grid min-w-[700px] grid-cols-[1fr_80px_70px_110px_80px_60px] gap-2 text-xs text-muted uppercase">
        <span>Beskrivning</span><span className="text-right">Antal</span><span>Enhet</span><span className="text-right">À-pris</span><span>Moms</span><span>Ta bort</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid min-w-[700px] grid-cols-[1fr_80px_70px_110px_80px_60px] gap-2 items-center">
          <input className="input py-1" name={`d_${i}`} defaultValue={r.description} aria-label="Beskrivning" />
          <input className="input py-1 text-right" name={`q_${i}`} defaultValue={String(r.quantity).replace(".", ",")} inputMode="decimal" aria-label="Antal" />
          <input className="input py-1" name={`u_${i}`} defaultValue={r.unit ?? ""} aria-label="Enhet" />
          <input className="input py-1 text-right" name={`p_${i}`} defaultValue={String(r.unit_price).replace(".", ",")} inputMode="decimal" aria-label="À-pris" />
          <select className="input py-1" name={`v_${i}`} defaultValue={String(r.vat_rate)} aria-label="Moms">
            {[25, 12, 6, 0].map((v) => <option key={v} value={v}>{v} %</option>)}
          </select>
          <input type="hidden" name={`qid_${i}`} value={r.quote_id ?? ""} />
          <label className="flex justify-center"><input type="checkbox" name={`x_${i}`} aria-label="Ta bort raden" /></label>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setRows([...rows, { description: "", quantity: 1, unit: "st", unit_price: 0, vat_rate: 25, quote_id: null }])}>+ Rad</button>
      </div>
    </div>
  );
}
