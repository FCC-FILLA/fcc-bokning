"use client";

import { useId, useMemo, useRef, useState } from "react";

type Company = { id: string; name: string; org_nr?: string | null; city?: string | null };
type Contact = { id: string; company_id: string | null; name: string; email: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

function groupContacts(list: Contact[], names: Map<string, string>) {
  const m = new Map<string, Contact[]>();
  for (const c of list) {
    const k = c.company_id ? names.get(c.company_id) ?? "Övriga" : "Utan företag";
    m.set(k, [...(m.get(k) ?? []), c]);
  }
  return m;
}

/** Sökbar kund och kontaktperson, med möjlighet att skapa ny kund och ny kontakt direkt i evenemanget. */
export function CustomerPicker({
  companies, contacts, companyId, contactId,
}: { companies: Company[]; contacts: Contact[]; companyId?: string | null; contactId?: string | null }) {
  const listId = useId();
  const [company, setCompany] = useState<string>(companyId ?? "");
  const [query, setQuery] = useState(() => companies.find((c) => c.id === companyId)?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [newCompany, setNewCompany] = useState("");
  const [contact, setContact] = useState<string>(contactId ?? "");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hits = useMemo(() => {
    const q = norm(query);
    if (!q) return companies.slice(0, 50);
    return companies
      .filter((c) => norm(c.name).includes(q) || (c.org_nr && norm(c.org_nr).includes(q)) || (c.city && norm(c.city).includes(q)))
      .sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)) || a.name.localeCompare(b.name, "sv"))
      .slice(0, 50);
  }, [companies, query]);
  const exact = companies.some((c) => norm(c.name) === norm(query));
  const options: ({ kind: "company"; c: Company } | { kind: "new" })[] = [
    ...hits.map((c) => ({ kind: "company" as const, c })),
    ...(query.trim() && !exact ? [{ kind: "new" as const }] : []),
  ];

  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.kind === "company") {
      setCompany(o.c.id);
      setNewCompany("");
      setQuery(o.c.name);
      if (contact && contact !== "ny" && contacts.find((x) => x.id === contact)?.company_id !== o.c.id) setContact("");
    } else {
      setCompany("");
      setNewCompany(query.trim());
      setContact("ny");
    }
    setOpen(false);
  };

  const ownContacts = company ? contacts.filter((c) => c.company_id === company) : newCompany ? [] : contacts;
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <>
      <div className="field relative">
        <label className="label" htmlFor={`${listId}-q`}>Kund</label>
        <input type="hidden" name="company_id" value={company} />
        <input type="hidden" name="new_company_name" value={newCompany} />
        <input
          id={`${listId}-q`}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Sök kund, org-nr eller ort"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
            if (!e.target.value.trim()) { setCompany(""); setNewCompany(""); }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter" && open && options.length) { e.preventDefault(); pick(active); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
        {open && options.length > 0 && (
          <ul id={`${listId}-list`} role="listbox" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-line bg-surface shadow-lg">
            {options.map((o, i) => (
              <li
                key={o.kind === "company" ? o.c.id : "ny"}
                role="option"
                aria-selected={i === active}
                className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-brand-soft" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); pick(i); }}
              >
                {o.kind === "company" ? (
                  <>
                    <span className="font-medium">{o.c.name}</span>
                    {(o.c.org_nr || o.c.city) && <span className="text-xs text-muted"> · {[o.c.org_nr, o.c.city].filter(Boolean).join(" · ")}</span>}
                  </>
                ) : (
                  <span className="font-medium text-brand">+ Skapa ny kund ”{query.trim()}”</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {newCompany && <span className="text-xs text-ok">Ny kund skapas när du sparar. Fyll i adress och org-nr under Kunder efteråt.</span>}
        {query.trim() && !company && !newCompany && !open && <span className="text-xs text-warn">Välj en kund i listan eller skapa en ny.</span>}
      </div>

      <div className="field">
        <label className="label" htmlFor={`${listId}-c`}>Kontaktperson</label>
        <select className="input" id={`${listId}-c`} name="contact_id" value={contact} onChange={(e) => setContact(e.target.value)}>
          <option value="">Ingen kontakt vald</option>
          {company || newCompany
            ? ownContacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.email ? ` (${c.email})` : ""}</option>)
            : [...groupContacts(ownContacts, companyName)].map(([g, list]) => (
                <optgroup key={g} label={g}>{list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              ))}
          <option value="ny">+ Ny kontaktperson …</option>
        </select>
        {contact === "ny" && (
          <div className="grid gap-2 rounded-lg border border-line p-2 mt-1">
            <input className="input" name="new_contact_name" placeholder="Namn" required aria-label="Ny kontaktpersons namn" />
            <input className="input" name="new_contact_email" type="email" placeholder="E-post" aria-label="Ny kontaktpersons e-post" />
            <input className="input" name="new_contact_phone" type="tel" placeholder="Telefon" aria-label="Ny kontaktpersons telefon" />
          </div>
        )}
      </div>
    </>
  );
}
