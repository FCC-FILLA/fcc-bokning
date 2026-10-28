import Link from "next/link";
import type { Lookups } from "@/lib/lookups";
import { STATUSES, STATUS_LABEL, type EventRow } from "@/lib/types";

/** Fälten för ett evenemang. Används både när man skapar och redigerar. */
export function EventFields({
  event,
  lookups,
  disabled,
}: {
  event?: Partial<EventRow>;
  lookups: Lookups;
  disabled?: boolean;
}) {
  const companyName = new Map(lookups.companies.map((c) => [c.id, c.name]));
  const contactsByCompany = new Map<string, typeof lookups.contacts>();
  for (const c of lookups.contacts) {
    const key = c.company_id ? companyName.get(c.company_id) ?? "Övriga" : "Utan företag";
    contactsByCompany.set(key, [...(contactsByCompany.get(key) ?? []), c]);
  }

  return (
    <fieldset disabled={disabled} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="field">
          <label className="label" htmlFor="title">Evenemang</label>
          <input className="input" id="title" name="title" required defaultValue={event?.title ?? ""} placeholder="T.ex. Årskonferens 2027" />
        </div>
        <div className="field">
          <label className="label" htmlFor="status">Status</label>
          <select className="input" id="status" name="status" defaultValue={event?.status ?? "forfragan"}>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="event_type_id">Typ</label>
          <select className="input" id="event_type_id" name="event_type_id" defaultValue={event?.event_type_id ?? ""}>
            <option value="">Välj typ</option>
            {lookups.eventTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="field">
          <label className="label" htmlFor="company_id">Kund</label>
          <select className="input" id="company_id" name="company_id" defaultValue={event?.company_id ?? ""}>
            <option value="">Ingen kund vald</option>
            {lookups.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="contact_id">Kontaktperson</label>
          <select className="input" id="contact_id" name="contact_id" defaultValue={event?.contact_id ?? ""}>
            <option value="">Ingen kontakt vald</option>
            {[...contactsByCompany].map(([group, list]) => (
              <optgroup key={group} label={group}>
                {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="responsible_id">Ansvarig hos FCC</label>
          <select className="input" id="responsible_id" name="responsible_id" defaultValue={event?.responsible_id ?? ""}>
            <option value="">Ingen vald</option>
            {lookups.profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </div>
      </div>
      <p className="text-sm text-muted -mt-2">
        Saknas kunden? <Link className="underline underline-offset-2" href="/kunder">Lägg till den under Kunder</Link> först.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="field">
          <label className="label" htmlFor="participants">Antal deltagare</label>
          <input className="input" id="participants" name="participants" type="number" min={0} inputMode="numeric" defaultValue={event?.participants ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor="option_expires_on">Option gäller till</label>
          <input className="input" id="option_expires_on" name="option_expires_on" type="date" defaultValue={event?.option_expires_on ?? ""} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="field">
          <label className="label" htmlFor="description">Beskrivning</label>
          <textarea className="input" id="description" name="description" defaultValue={event?.description ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor="technical_info">Teknik</label>
          <textarea className="input" id="technical_info" name="technical_info" defaultValue={event?.technical_info ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor="hospitality_info">Mat och hospitality</label>
          <textarea className="input" id="hospitality_info" name="hospitality_info" defaultValue={event?.hospitality_info ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor="internal_notes">Interna anteckningar</label>
          <textarea className="input" id="internal_notes" name="internal_notes" defaultValue={event?.internal_notes ?? ""} />
        </div>
      </div>
    </fieldset>
  );
}
