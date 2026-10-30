import { canManageStaff, requireProfile } from "@/lib/auth";
import { addDays, fmtDate, todayDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteSupplier, saveSupplier } from "../actions";

export const metadata = { title: "Leverantörer och avtal" };

type Supplier = {
  id: string; name: string; area: string | null; contact_name: string | null; phone: string | null; emergency_phone: string | null;
  email: string | null; contract_no: string | null; contract_ends_on: string | null; notes: string | null; active: boolean;
};
const tel = (s: string) => `tel:${s.replace(/[^\d+]/g, "")}`;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const sp = await searchParams;
  const editor = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").order("area", { nullsFirst: false }).order("name");
  const list = (data ?? []) as Supplier[];
  const today = todayDate();
  const soon = addDays(today, 90);

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Leverantörer och serviceavtal</h1>
        <p className="text-sm text-muted">Vem man ringer när hissen står still eller larmet krånglar. Avtal som går ut inom tre månader markeras.</p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((s) => {
          const ending = s.contract_ends_on && s.contract_ends_on <= soon;
          return (
            <li key={s.id} id={s.id} className={`card p-4 grid gap-2 content-start scroll-mt-24 ${!s.active ? "opacity-60" : ""}`}>
              <div>
                {s.area && <p className="text-xs uppercase tracking-wide text-muted">{s.area}</p>}
                <p className="font-semibold">{s.name}</p>
                {s.contact_name && <p className="text-sm">{s.contact_name}</p>}
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                {s.phone && <a className="btn btn-ghost px-2 py-1" href={tel(s.phone)}>📞 {s.phone}</a>}
                {s.emergency_phone && <a className="btn btn-ghost px-2 py-1 text-warn" href={tel(s.emergency_phone)}>Jour {s.emergency_phone}</a>}
                {s.email && <a className="btn btn-ghost px-2 py-1" href={`mailto:${s.email}`}>{s.email}</a>}
              </div>
              {(s.contract_no || s.contract_ends_on) && (
                <p className={`text-sm ${ending ? "text-warn font-semibold" : "text-muted"}`}>
                  Avtal{s.contract_no ? ` ${s.contract_no}` : ""}{s.contract_ends_on ? ` · ${s.contract_ends_on < today ? "gick ut" : "går ut"} ${fmtDate(s.contract_ends_on)}` : ""}
                </p>
              )}
              {s.notes && <p className="text-sm whitespace-pre-line">{s.notes}</p>}
              {editor && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">Ändra</summary>
                  <SupplierForm s={s} />
                  <form action={deleteSupplier.bind(null, s.id)} className="mt-2">
                    <ConfirmButton label="Ta bort" question={`${s.name} tas bort.`} confirmLabel="Ta bort" className="btn btn-ghost text-warn text-sm" />
                  </form>
                </details>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="card p-8 text-center text-muted sm:col-span-2">Inga leverantörer än. Lägg till hiss, ventilation, larm, el, VVS, städ, sophämtning …</li>}
      </ul>

      {editor && (
        <details className="card p-4" open={list.length === 0}>
          <summary className="cursor-pointer font-semibold">Ny leverantör</summary>
          <SupplierForm />
        </details>
      )}
    </div>
  );
}

function SupplierForm({ s }: { s?: Supplier }) {
  const k = s?.id ?? "ny";
  const f = (name: keyof Supplier, label: string, extra: Record<string, string> = {}) => (
    <div className="field"><label className="label" htmlFor={`s-${name}-${k}`}>{label}</label>
      <input className="input" id={`s-${name}-${k}`} name={name} defaultValue={(s?.[name] as string | null) ?? ""} {...extra} /></div>
  );
  return (
    <form action={saveSupplier.bind(null, s?.id ?? null)} className="mt-3 grid gap-3 sm:grid-cols-2">
      {f("name", "Företag", { required: "" })}
      {f("area", "Område", { placeholder: "Hiss, ventilation, larm …" })}
      {f("contact_name", "Kontaktperson")}
      {f("phone", "Telefon", { type: "tel" })}
      {f("emergency_phone", "Jourtelefon", { type: "tel" })}
      {f("email", "E-post", { type: "email" })}
      {f("contract_no", "Avtalsnummer")}
      {f("contract_ends_on", "Avtalet går ut", { type: "date" })}
      <div className="field sm:col-span-2"><label className="label" htmlFor={`s-notes-${k}`}>Anteckningar</label>
        <textarea className="input" id={`s-notes-${k}`} name="notes" defaultValue={s?.notes ?? ""} placeholder="Vad avtalet omfattar, kod till nyckelskåp, servicedagar …" /></div>
      {s && (
        <div className="field"><label className="label" htmlFor={`s-act-${k}`}>Status</label>
          <select className="input" id={`s-act-${k}`} name="active" defaultValue={s.active ? "on" : "off"}><option value="on">Aktiv</option><option value="off">Inaktiv</option></select></div>
      )}
      <div className="sm:col-span-2"><button className="btn btn-primary" type="submit">{s ? "Spara" : "Lägg till"}</button></div>
    </form>
  );
}
