"use client";

import { useMemo, useState } from "react";
import { fmtKr, lineTotal, quoteTotals } from "@/lib/offert";

export type EditorArticle = {
  id: string;
  article_no: string | null;
  name: string;
  group_id: string;
  unit: string;
  price: number | null;
  cost: number;
  vat_rate: number;
};
export type EditorGroup = { id: string; name: string };
export type EditorLine = {
  key: number;
  group_id: string;
  article_id: string | null;
  description: string;
  line_date: string;
  quantity: number;
  unit: string;
  unit_price: number;
  cost: number;
  discount_pct: number;
  vat_rate: number;
  kind: "ingar" | "tillval";
};

let k = 1;
const newKey = () => k++;
const num = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Redigera offertens rader, grupperade som i prislistan. Sparas som JSON i fältet "lines". */
export function QuoteEditor({
  groups,
  articles,
  initial,
  readOnly,
}: {
  groups: EditorGroup[];
  articles: EditorArticle[];
  initial: Omit<EditorLine, "key">[];
  readOnly: boolean;
}) {
  const [lines, setLines] = useState<EditorLine[]>(() => initial.map((l) => ({ ...l, key: newKey() })));
  const [dirty, setDirty] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [bulkDiscount, setBulkDiscount] = useState("");

  const change = (fn: (ls: EditorLine[]) => EditorLine[]) => {
    setLines(fn);
    setDirty(true);
  };
  const update = (key: number, patch: Partial<EditorLine>) => change((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: number) => change((ls) => ls.filter((l) => l.key !== key));
  const move = (key: number, dir: -1 | 1) =>
    change((ls) => {
      const i = ls.findIndex((l) => l.key === key);
      const sameGroup = (l: EditorLine) => l.group_id === ls[i].group_id;
      const target =
        dir === 1
          ? ls.findIndex((l, idx) => idx > i && sameGroup(l))
          : findLastIndex(ls, (l, idx) => idx < i && sameGroup(l));
      if (target < 0) return ls;
      const copy = [...ls];
      [copy[i], copy[target]] = [copy[target], copy[i]];
      return copy;
    });
  const addArticle = (a: EditorArticle) =>
    change((ls) => [
      ...ls,
      {
        key: newKey(),
        group_id: a.group_id,
        article_id: a.id,
        description: a.name,
        line_date: "",
        quantity: 1,
        unit: a.unit,
        unit_price: a.price ?? 0,
        cost: a.cost,
        discount_pct: 0,
        vat_rate: a.vat_rate,
        kind: "ingar",
      },
    ]);
  const addFree = (group_id: string) =>
    change((ls) => [
      ...ls,
      { key: newKey(), group_id, article_id: null, description: "", line_date: "", quantity: 1, unit: "st", unit_price: 0, cost: 0, discount_pct: 0, vat_rate: 25, kind: "ingar" },
    ]);

  const totals = useMemo(() => quoteTotals(lines), [lines]);
  const payload = JSON.stringify(lines.map((l) => ({ ...omitKey(l), line_date: l.line_date || null })));
  const usedGroups = groups.filter((g) => lines.some((l) => l.group_id === g.id));
  const articleIndex = useMemo(() => new Map(articles.map((a) => [`${a.article_no ? `${a.article_no} · ` : ""}${a.name}`, a])), [articles]);

  return (
    <div className="grid gap-4">
      <input type="hidden" name="lines" value={payload} />

      {lines.length === 0 && (
        <p className="rounded-lg border border-dashed border-line p-6 text-center text-muted">
          Inga rader ännu. Sök fram en artikel nedan eller lägg till en fri rad.
        </p>
      )}

      {usedGroups.map((g) => {
        const gl = lines.filter((l) => l.group_id === g.id);
        const sum = gl.filter((l) => l.kind === "ingar").reduce((s, l) => s + lineTotal(l), 0);
        return (
          <div key={g.id} className="grid gap-1">
            <div className="flex items-baseline gap-3 border-b border-brand/40 pb-1">
              <h3 className="font-display font-semibold text-brand">{g.name}</h3>
              <span className="flex-1" />
              <span className="text-sm font-semibold tabular-nums">{fmtKr(sum)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="label font-semibold">Beskrivning</th>
                    <th className="label font-semibold w-[132px]">Datum</th>
                    <th className="label font-semibold w-[72px] text-right">Antal</th>
                    <th className="label font-semibold w-[76px]">Enhet</th>
                    <th className="label font-semibold w-[104px] text-right">À-pris</th>
                    {showCost && <th className="label font-semibold w-[96px] text-right">Kostnad</th>}
                    <th className="label font-semibold w-[68px] text-right">Rabatt %</th>
                    <th className="label font-semibold w-[100px]">Typ</th>
                    <th className="label font-semibold w-[104px] text-right">Belopp</th>
                    {!readOnly && <th className="w-[92px]" />}
                  </tr>
                </thead>
                <tbody>
                  {gl.map((l) => (
                    <tr key={l.key} className={l.kind === "tillval" ? "text-muted" : ""}>
                      <td className="pr-1">
                        <input className="input" value={l.description} disabled={readOnly} aria-label="Beskrivning" onChange={(e) => update(l.key, { description: e.target.value })} />
                      </td>
                      <td className="pr-1">
                        <input className="input" type="date" value={l.line_date} disabled={readOnly} aria-label="Datum" onChange={(e) => update(l.key, { line_date: e.target.value })} />
                      </td>
                      <td className="pr-1">
                        <input className="input text-right" inputMode="decimal" defaultValue={l.quantity} disabled={readOnly} aria-label="Antal" onBlur={(e) => update(l.key, { quantity: num(e.target.value) })} />
                      </td>
                      <td className="pr-1">
                        <input className="input" value={l.unit} disabled={readOnly} aria-label="Enhet" onChange={(e) => update(l.key, { unit: e.target.value })} />
                      </td>
                      <td className="pr-1">
                        <input className="input text-right" inputMode="decimal" defaultValue={l.unit_price} disabled={readOnly} aria-label="À-pris" onBlur={(e) => update(l.key, { unit_price: num(e.target.value) })} />
                      </td>
                      {showCost && (
                        <td className="pr-1">
                          <input className="input text-right" inputMode="decimal" defaultValue={l.cost} disabled={readOnly} aria-label="Kostnad" onBlur={(e) => update(l.key, { cost: num(e.target.value) })} />
                        </td>
                      )}
                      <td className="pr-1">
                        <input
                          key={`d${l.discount_pct}`}
                          className="input text-right"
                          inputMode="decimal"
                          defaultValue={l.discount_pct || ""}
                          placeholder="0"
                          disabled={readOnly}
                          aria-label="Rabatt i procent"
                          onBlur={(e) => update(l.key, { discount_pct: Math.min(100, Math.max(0, num(e.target.value))) })}
                        />
                      </td>
                      <td className="pr-1">
                        <select className="input" value={l.kind} disabled={readOnly} aria-label="Typ" onChange={(e) => update(l.key, { kind: e.target.value as EditorLine["kind"] })}>
                          <option value="ingar">Ingår</option>
                          <option value="tillval">Tillval</option>
                        </select>
                      </td>
                      <td className="text-right tabular-nums font-semibold pr-1">{fmtKr(lineTotal(l))}</td>
                      {!readOnly && (
                        <td className="whitespace-nowrap text-right">
                          <button type="button" className="btn btn-ghost px-1.5" onClick={() => move(l.key, -1)} aria-label="Flytta upp">↑</button>
                          <button type="button" className="btn btn-ghost px-1.5" onClick={() => move(l.key, 1)} aria-label="Flytta ner">↓</button>
                          <button type="button" className="btn btn-ghost px-1.5 text-warn" onClick={() => remove(l.key)} aria-label="Ta bort rad">✕</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {!readOnly && (
        <div className="grid gap-3 rounded-lg bg-sunk/60 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="field grow min-w-64">
              <label className="label" htmlFor="article-search">Lägg till artikel från prislistan</label>
              <input
                id="article-search"
                className="input"
                list="article-list"
                placeholder="Skriv för att söka, t.ex. Birka eller ljudtekniker"
                onChange={(e) => {
                  const a = articleIndex.get(e.target.value);
                  if (a) {
                    addArticle(a);
                    e.target.value = "";
                  }
                }}
              />
              <datalist id="article-list">
                {[...articleIndex.keys()].map((label) => <option key={label} value={label} />)}
              </datalist>
            </div>
            <div className="field">
              <label className="label" htmlFor="free-group">Fri rad i</label>
              <div className="flex gap-2">
                <select id="free-group" className="input" defaultValue="ovrigt">
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() => addFree((document.getElementById("free-group") as HTMLSelectElement).value)}
                >
                  Lägg till
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Rabatt på alla rader
              <input className="input w-20 text-right" inputMode="decimal" value={bulkDiscount} onChange={(e) => setBulkDiscount(e.target.value)} placeholder="%" aria-label="Rabatt på alla rader i procent" />
            </label>
            <button
              type="button"
              className="btn"
              disabled={bulkDiscount === ""}
              onClick={() => {
                const d = Math.min(100, Math.max(0, num(bulkDiscount)));
                change((ls) => ls.map((l) => ({ ...l, discount_pct: d })));
                setBulkDiscount("");
              }}
            >
              Sätt rabatt
            </button>
            <span className="flex-1" />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} /> Visa kostnad
            </label>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-start">
        <div className="text-sm text-muted">
          {totals.addonsExVat > 0 && <p>Möjliga tillval: {fmtKr(totals.addonsExVat)} exkl. moms (ingår inte i totalen).</p>}
          <p>
            Intern kalkyl: kostnad {fmtKr(totals.cost)}, marginal{" "}
            <span className={totals.margin < 0 ? "text-warn font-semibold" : "font-semibold text-fg"}>{fmtKr(totals.margin)}</span>
            {totals.exVat > 0 && ` (${Math.round((totals.margin / totals.exVat) * 100)} %)`}. Syns inte för kunden.
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm tabular-nums justify-end">
          {totals.discount > 0 && (
            <>
              <dt className="text-muted text-right">Summa före rabatt</dt><dd className="text-right">{fmtKr(totals.beforeDiscount)}</dd>
              <dt className="text-muted text-right">Rabatt</dt><dd className="text-right">−{fmtKr(totals.discount)}</dd>
            </>
          )}
          <dt className="text-muted text-right">Summa exkl. moms</dt><dd className="text-right font-semibold">{fmtKr(totals.exVat)}</dd>
          <dt className="text-muted text-right">Moms</dt><dd className="text-right">{fmtKr(totals.vat)}</dd>
          <dt className="text-right font-semibold border-t border-line pt-1">Totalt inkl. moms</dt>
          <dd className="text-right font-display text-lg font-semibold border-t border-line pt-1 text-brand">{fmtKr(totals.inclVat)}</dd>
        </dl>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3 sticky bottom-0 bg-surface py-3 border-t border-line">
          <button className="btn btn-primary" type="submit">Spara rader</button>
          {dirty && <span className="text-sm text-st-preliminar">Du har ändringar som inte är sparade.</span>}
        </div>
      )}
    </div>
  );
}

function findLastIndex<T>(arr: T[], pred: (v: T, i: number) => boolean) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i], i)) return i;
  return -1;
}

function omitKey(l: EditorLine): Omit<EditorLine, "key"> {
  const copy: Partial<EditorLine> = { ...l };
  delete copy.key;
  return copy as Omit<EditorLine, "key">;
}
