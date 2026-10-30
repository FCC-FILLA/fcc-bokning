import { isAdmin, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveChangeovers } from "./actions";

export const metadata = { title: "Omställning" };

type S = { id: string; name: string; changeover_minutes: number };

export default async function ChangeoverPage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string }> }) {
  const sp = await searchParams;
  const admin = isAdmin(await requireProfile());
  const supabase = await createClient();
  const [{ data: s }, { data: p }, { data: d }] = await Promise.all([
    supabase.from("setups").select("id, name, changeover_minutes").order("sort_order"),
    supabase.from("setup_changeovers").select("from_setup, to_setup, minutes"),
    supabase.from("app_settings").select("value").eq("key", "changeover_default_minutes").maybeSingle(),
  ]);
  const setups = (s ?? []) as S[];
  const pair = new Map(((p ?? []) as { from_setup: string; to_setup: string; minutes: number }[]).map((x) => [`${x.from_setup}|${x.to_setup}`, x.minutes]));

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Omställning</h1>
        <p className="text-sm text-muted max-w-3xl">
          Hur lång tid det tar att ställa om en lokal från en möblering till en annan. Kalendern och sidan Krockar varnar när två bokningar i samma
          lokal ligger tätare än riv + omställning + rigg. Rigg och riv anges på varje bokning.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}
      <form action={saveChangeovers} className="grid gap-5">
        <fieldset disabled={!admin} className="grid gap-5">
          <section className="card p-5 grid gap-3">
            <h2 className="text-lg font-semibold">Standardtid per möblering</h2>
            <p className="text-sm text-muted">Minuter det tar att ställa om <em>till</em> möbleringen från något annat. Samma möblering efter varandra räknas som 0.</p>
            <div className="grid gap-3 sm:grid-cols-4">
              {setups.map((x) => (
                <div key={x.id} className="field">
                  <label className="label" htmlFor={`std_${x.id}`}>{x.name}</label>
                  <input className="input" id={`std_${x.id}`} name={`std_${x.id}`} type="number" min={0} max={2880} step={15} defaultValue={x.changeover_minutes} />
                </div>
              ))}
              <div className="field">
                <label className="label" htmlFor="default_minutes">Möblering ej bestämd</label>
                <input className="input" id="default_minutes" name="default_minutes" type="number" min={0} max={2880} step={15} defaultValue={d?.value ?? "30"} />
              </div>
            </div>
          </section>
          <section className="card p-5 grid gap-3">
            <h2 className="text-lg font-semibold">Egna tider för par</h2>
            <p className="text-sm text-muted">Fyll bara i där det skiljer sig från standard, t.ex. att bio → bankett tar 3 h. Tom ruta betyder standard.</p>
            <div className="overflow-x-auto">
              <table className="text-sm border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="label text-left pr-2">Från ↓ / till →</th>
                    {setups.map((x) => <th key={x.id} className="label px-1 text-left">{x.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {setups.map((a) => (
                    <tr key={a.id}>
                      <th scope="row" className="text-left font-semibold pr-2">{a.name}</th>
                      {setups.map((b) => (
                        <td key={b.id}>
                          <input
                            className="input h-8 w-20 py-0 text-right"
                            name={`p_${a.id}_${b.id}`}
                            type="number"
                            min={0}
                            max={2880}
                            step={15}
                            defaultValue={pair.get(`${a.id}|${b.id}`) ?? ""}
                            placeholder={a.id === b.id ? "0" : String(b.changeover_minutes)}
                            aria-label={`${a.name} till ${b.name}, minuter`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </fieldset>
        {admin && <div><button className="btn btn-primary" type="submit">Spara</button></div>}
      </form>
    </div>
  );
}
