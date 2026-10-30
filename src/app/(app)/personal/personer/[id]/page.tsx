import Link from "next/link";
import { notFound } from "next/navigation";
import { canManageStaff, isAdmin, requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { ASSIGNMENT_LABEL, KIND_LABEL, type AssignmentStatus, type Staff } from "@/lib/personal";
import { getStaffLookups } from "@/lib/personal-data";
import { createClient } from "@/lib/supabase/server";
import { CopyButton } from "@/components/copy-button";
import { inviteStaff, newStaffLink, updateStaff } from "../../actions";

type Upcoming = {
  status: AssignmentStatus;
  shifts: { id: string; starts_at: string; ends_at: string; function_id: string; events: { title: string } | null } | null;
};

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fel?: string; sparat?: string; ny?: string; lank?: string; nylank?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await requireProfile();
  const manager = canManageStaff(profile);
  const admin = isAdmin(profile);
  const supabase = await createClient();
  const [{ data: p }, { data: skills }, { data: shifts }, { functions }] = await Promise.all([
    supabase.from("staff").select("*").eq("id", id).maybeSingle(),
    supabase.from("staff_skills").select("function_id").eq("staff_id", id),
    supabase
      .from("shift_assignments")
      .select("status, shifts!inner(id, starts_at, ends_at, function_id, events(title))")
      .eq("staff_id", id)
      .gte("shifts.ends_at", new Date().toISOString())
      .in("status", ["tilldelad", "ansokt", "inbjuden"])
      .order("starts_at", { referencedTable: "shifts" })
      .limit(50),
    getStaffLookups(),
  ]);
  const { data: detailRow } = admin
    ? await supabase.from("staff_details").select("*").eq("staff_id", id).maybeSingle()
    : await supabase.rpc("staff_details_basic", { p_staff: id });
  const d = (detailRow ?? null) as Record<string, string | boolean | null> | null;
  if (!p) notFound();
  const person = p as Staff;
  const mine = new Set(((skills ?? []) as { function_id: string }[]).map((s) => s.function_id));
  const upcoming = ((shifts ?? []) as unknown as Upcoming[]).filter((x) => x.shifts).sort((a, b) => a.shifts!.starts_at.localeCompare(b.shifts!.starts_at));
  const fn = new Map(functions.map((f) => [f.id, f]));
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://fcc-bokning.vercel.app";
  const personalLink = `${site}/pass/${person.link_token}`;

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-2">
        <Link href={`/personal/personer?typ=${person.kind}`} className="text-sm text-muted hover:underline">← Personer</Link>
        <h1 className="text-2xl font-semibold">{person.name}</h1>
        <p className="text-sm text-muted">{KIND_LABEL[person.kind]}{person.company ? ` · ${person.company}` : ""}{person.active ? "" : " · inaktiv"}</p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparat && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      {sp.ny && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">{person.name} är tillagd.{person.kind === "intern" ? " Bjud in till portalen nedan." : ""}</p>}

      <section id="portal" className="card p-5 grid gap-3 scroll-mt-28">
        <h2 className="text-lg font-semibold">{person.kind === "intern" ? "Personalportalen" : "Personlig länk"}</h2>
        {person.kind === "intern" ? (
          <>
            <p className="text-sm text-muted">
              {person.profile_id
                ? "Har ett konto och loggar in med sin e-post. Skapa en ny länk om personen behöver komma in igen."
                : "Skapa en inbjudningslänk och skicka den till personen, till exempel via sms. Länken går att använda en gång; personen väljer sedan ett lösenord."}
            </p>
            {sp.lank && (
              <div className="grid gap-2 rounded-lg bg-brand-soft p-3">
                <span className="text-sm font-semibold">Inbjudningslänk till {person.name}</span>
                <code className="break-all text-xs">{sp.lank}</code>
                <div><CopyButton text={sp.lank} label="Kopiera länken" /></div>
              </div>
            )}
            {manager && (
              <form action={inviteStaff.bind(null, id)}>
                <button className="btn btn-primary" type="submit" disabled={!person.email || !person.active}>
                  {person.profile_id ? "Skapa ny inloggningslänk" : "Skapa inbjudan"}
                </button>
                {!person.email && <span className="ml-3 text-sm text-muted">Lägg in e-post först.</span>}
              </form>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Länken ger tillgång till personens pass utan inloggning. E-postinbjudningar med svarstid kommer i nästa steg.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-sunk px-2 py-1 text-xs">{personalLink}</code>
              <CopyButton text={personalLink} label="Kopiera" />
              {manager && (
                <form action={newStaffLink.bind(null, id)}>
                  <button className="btn btn-ghost text-sm" type="submit">Byt länk</button>
                </form>
              )}
            </div>
            {sp.nylank && <p className="text-sm text-ok">Ny länk skapad. Den gamla fungerar inte längre.</p>}
          </>
        )}
      </section>

      <form action={updateStaff.bind(null, id)} className="card p-5 grid gap-4">
        <h2 className="text-lg font-semibold">Uppgifter</h2>
        <fieldset disabled={!manager} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[140px_1fr_1fr]">
            <div className="field">
              <label className="label" htmlFor="kind">Typ</label>
              <select className="input" id="kind" name="kind" defaultValue={person.kind}>
                <option value="intern">Intern</option>
                <option value="frilans">Frilans</option>
                <option value="leverantor">Leverantör</option>
              </select>
            </div>
            <div className="field"><label className="label" htmlFor="name">Namn</label><input className="input" id="name" name="name" required defaultValue={person.name} /></div>
            <div className="field"><label className="label" htmlFor="company">Företag</label><input className="input" id="company" name="company" defaultValue={person.company ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="employment_number">Anställningsnr</label><input className="input" id="employment_number" name="employment_number" defaultValue={person.employment_number ?? ""} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="field"><label className="label" htmlFor="email">E-post</label><input className="input" id="email" name="email" type="email" defaultValue={person.email ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="phone">Mobil</label><input className="input" id="phone" name="phone" type="tel" defaultValue={person.phone ?? ""} /></div>
            <div className="field"><label className="label" htmlFor="hourly_rate">Eget timpris</label><input className="input" id="hourly_rate" name="hourly_rate" inputMode="decimal" defaultValue={person.hourly_rate ?? ""} placeholder="Funktionens" /></div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="label mb-1">Funktioner</legend>
            <div className="flex flex-wrap gap-2">
              {functions.filter((f) => f.active || mine.has(f.id)).map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" name="function_ids" value={f.id} defaultChecked={mine.has(f.id)} /> {f.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field"><label className="label" htmlFor="note">Intern anteckning</label><textarea className="input" id="note" name="note" defaultValue={person.note ?? ""} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={person.active} /> Aktiv</label>
        </fieldset>
        {manager && <div><button className="btn btn-primary" type="submit">Spara</button></div>}
      </form>

      <section id="uppgifter" className="card p-5 grid gap-3 scroll-mt-28">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-lg font-semibold">Personens egna uppgifter</h2>
          <span className="text-xs text-muted">Fylls i av personen själv {person.kind === "intern" ? "i portalen under Mina uppgifter" : "via den personliga länken"}.</span>
        </div>
        {!d ? (
          <p className="text-sm text-muted">Inget ifyllt ännu.</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ["Adress", [d.address, [d.postal_code, d.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
              ["Närmast anhörig", [d.ice_name, d.ice_relation && `(${d.ice_relation})`, d.ice_phone].filter(Boolean).join(" ")],
              ["Personnummer", admin ? d.personal_number : d.has_personal_number ? "Ifyllt (syns för administratörer)" : ""],
              ["Bank", admin ? [d.bank_name, d.clearing_number, d.account_number].filter(Boolean).join(" ") : d.has_bank ? `${d.bank_name ?? "Ifyllt"} (konto syns för administratörer)` : d.bank_name],
              ["Skatt", d.tax_note],
              ["Eget företag", [d.company_name, d.org_number, d.f_tax ? "F-skatt" : ""].filter(Boolean).join(", ")],
              ["Specialkost", d.food_preferences],
              ["Klädstorlek", d.clothing_size],
              ["Körkort", d.drivers_license ? "Ja" : ""],
              ["Språk", d.languages],
              ["Övrigt", d.other],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={String(k)} className="grid">
                  <dt className="label">{k}</dt>
                  <dd className="whitespace-pre-line">{String(v)}</dd>
                </div>
              ))}
          </dl>
        )}
      </section>

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-semibold">Kommande pass</h2>
        {upcoming.length ? (
          <ul className="divide-y divide-line">
            {upcoming.map((x) => (
              <li key={x.shifts!.id}>
                <Link href={`/personal/pass/${x.shifts!.id}`} className="flex flex-wrap items-center gap-3 py-2 hover:underline">
                  <span className="tabular-nums text-sm w-48">{fmtDate(x.shifts!.starts_at)} {fmtTime(x.shifts!.starts_at)}–{fmtTime(x.shifts!.ends_at)}</span>
                  <span className="font-medium">{fn.get(x.shifts!.function_id)?.name}</span>
                  <span className="text-sm text-muted">{x.shifts!.events?.title}</span>
                  <span className="ml-auto text-xs rounded-full bg-sunk px-2">{ASSIGNMENT_LABEL[x.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Inga kommande pass.</p>
        )}
      </section>
    </div>
  );
}
