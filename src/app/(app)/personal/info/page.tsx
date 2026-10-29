import { canManageStaff, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ArticleIcon } from "@/components/icon";
import { ConfirmButton } from "@/components/confirm-button";
import { addInfo, deleteInfo, saveInfo } from "./actions";

export const metadata = { title: "Info till personalen" };

type Info = { id: string; title: string; body: string; icon: string | null; audience: string[]; only_when_booked: boolean; sort_order: number };
const AUD = [{ id: "intern", label: "Internpersonal" }, { id: "frilans", label: "Frilans" }, { id: "leverantor", label: "Leverantörer" }];
const ICONS = ["room", "security", "meal", "coat", "person", "clock", "wifi", "ticket", "document", "power"];

function Fields({ i }: { i?: Info }) {
  const uid = i?.id ?? "ny";
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[1fr_140px_90px]">
        <div className="field"><label className="label" htmlFor={`t-${uid}`}>Rubrik</label><input className="input" id={`t-${uid}`} name="title" defaultValue={i?.title ?? ""} required placeholder="T.ex. Parkering" /></div>
        <div className="field">
          <label className="label" htmlFor={`i-${uid}`}>Ikon</label>
          <select className="input" id={`i-${uid}`} name="icon" defaultValue={i?.icon ?? ""}>
            <option value="">Ingen</option>
            {ICONS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="field"><label className="label" htmlFor={`o-${uid}`}>Ordning</label><input className="input" id={`o-${uid}`} name="sort_order" type="number" defaultValue={i?.sort_order ?? ""} /></div>
      </div>
      <div className="field"><label className="label" htmlFor={`b-${uid}`}>Text</label><textarea className="input min-h-24" id={`b-${uid}`} name="body" defaultValue={i?.body ?? ""} /></div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {AUD.map((a) => (
          <label key={a.id} className="flex items-center gap-1.5"><input type="checkbox" name="audience" value={a.id} defaultChecked={i ? i.audience.includes(a.id) : true} /> {a.label}</label>
        ))}
        <label className="flex items-center gap-1.5"><input type="checkbox" name="only_when_booked" defaultChecked={i?.only_when_booked} /> Visa bara när personen har ett pass inom 36 timmar (t.ex. koder)</label>
      </div>
    </>
  );
}

export default async function StaffInfoPage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string }> }) {
  const sp = await searchParams;
  const manager = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const { data } = await supabase.from("staff_info").select("*").order("sort_order").order("title");
  const list = (data ?? []) as Info[];

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Info till personalen</h1>
        <p className="text-sm text-muted max-w-2xl">
          Visas under Bra att veta i personalportalen och på frilansarnas och leverantörernas länk. Info för ett enskilt evenemang skrivs på evenemanget
          under Till personalen och visas på passen.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      {list.map((i) => (
        <form key={i.id} id={`info-${i.id}`} action={saveInfo.bind(null, i.id)} className="card p-5 grid gap-3 scroll-mt-24">
          <div className="flex items-center gap-2 text-brand"><ArticleIcon name={i.icon} className="size-6" /><h2 className="font-semibold text-fg">{i.title}</h2>{i.only_when_booked && <span className="text-xs text-muted">· bara när bokad</span>}</div>
          <fieldset disabled={!manager} className="grid gap-3"><Fields i={i} /></fieldset>
          {manager && (
            <div className="flex gap-2">
              <button className="btn btn-primary" type="submit">Spara</button>
              <span className="flex-1" />
              <ConfirmButton className="btn btn-ghost text-warn" label="Ta bort" question={`Ta bort ${i.title}?`} confirmLabel="Ta bort" formAction={deleteInfo.bind(null, i.id)} />
            </div>
          )}
        </form>
      ))}
      {manager && (
        <form action={addInfo} className="card p-5 grid gap-3">
          <h2 className="font-semibold">Nytt block</h2>
          <Fields />
          <div><button className="btn" type="submit">Lägg till</button></div>
        </form>
      )}
    </div>
  );
}
