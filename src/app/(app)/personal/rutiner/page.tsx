import { canManageStaff, requireProfile } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { ConfirmButton } from "@/components/confirm-button";
import { removeStep, saveRoutine, saveStep } from "./actions";

export const metadata = { title: "Öppna och stänga" };

type Step = { id: string; routine_id: string; title: string; help: string | null; sort_order: number; active: boolean };
type Routine = { id: string; name: string; description: string | null; sort_order: number; active: boolean };
type Run = { id: string; routine_id: string; started_at: string; completed_at: string | null; signed_name: string | null; note: string | null; routine_checks: { step_id: string; done: boolean; note: string | null }[] };

export default async function RoutinesPage({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const sp = await searchParams;
  const editor = canManageStaff(await requireProfile());
  const supabase = await createClient();
  const [{ data: r }, { data: s }, { data: u }] = await Promise.all([
    supabase.from("routines").select("*").order("sort_order"),
    supabase.from("routine_steps").select("*").order("sort_order"),
    supabase.from("routine_runs").select("id, routine_id, started_at, completed_at, signed_name, note, routine_checks(step_id, done, note)").order("started_at", { ascending: false }).limit(60),
  ]);
  const routines = (r ?? []) as Routine[];
  const steps = (s ?? []) as Step[];
  const runs = (u ?? []) as Run[];
  const stepName = new Map(steps.map((x) => [x.id, x.title]));
  const routineName = new Map(routines.map((x) => [x.id, x.name]));

  return (
    <div className="grid gap-5 max-w-4xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Öppna och stänga huset</h1>
        <p className="text-sm text-muted max-w-3xl">
          Checklistor som personalen går igenom och signerar i telefonen: i portalen (fliken Öppna/stänga) eller på frilansarnas personliga länk.
          Loggen nedan visar vem som gjorde vad och när, med avvikelser.
        </p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}

      {routines.map((x) => {
        const list = steps.filter((st) => st.routine_id === x.id && st.active);
        return (
          <section key={x.id} id={`r-${x.id}`} className={`card p-5 grid gap-3 scroll-mt-28 ${x.active ? "" : "opacity-60"}`}>
            <form action={saveRoutine.bind(null, x.id)} className="flex flex-wrap items-end gap-3">
              <fieldset disabled={!editor} className="contents">
                <div className="field grow"><label className="label" htmlFor={`n-${x.id}`}>Rutin</label><input className="input font-semibold" id={`n-${x.id}`} name="name" defaultValue={x.name} required /></div>
                <div className="field grow-[2]"><label className="label" htmlFor={`d-${x.id}`}>Beskrivning</label><input className="input" id={`d-${x.id}`} name="description" defaultValue={x.description ?? ""} /></div>
                <div className="field w-20"><label className="label" htmlFor={`o-${x.id}`}>Ordning</label><input className="input" id={`o-${x.id}`} name="sort_order" type="number" defaultValue={x.sort_order} /></div>
                <label className="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" name="active" defaultChecked={x.active} /> Aktiv</label>
                {editor && <button className="btn" type="submit">Spara</button>}
              </fieldset>
            </form>
            <ol className="grid gap-2">
              {list.map((st, i) => (
                <li key={st.id} className="flex flex-wrap items-end gap-2">
                  <span className="w-6 pb-2 text-sm text-muted">{i + 1}.</span>
                  <form action={saveStep.bind(null, x.id, st.id)} className="flex grow flex-wrap items-end gap-2">
                    <fieldset disabled={!editor} className="contents">
                      <input className="input grow min-w-56" name="title" defaultValue={st.title} aria-label="Punkt" />
                      <input className="input grow min-w-56 text-sm" name="help" defaultValue={st.help ?? ""} placeholder="Förklaring (valfritt)" aria-label="Förklaring" />
                      <input className="input w-16" name="sort_order" type="number" defaultValue={st.sort_order} aria-label="Ordning" />
                      {editor && <button className="btn btn-ghost text-sm" type="submit">Spara</button>}
                    </fieldset>
                  </form>
                  {editor && (
                    <form action={removeStep.bind(null, x.id, st.id)}>
                      <ConfirmButton label="✕" question="Ta bort punkten?" confirmLabel="Ja" className="btn btn-ghost px-2 text-sm text-warn" />
                    </form>
                  )}
                </li>
              ))}
            </ol>
            {editor && (
              <form action={saveStep.bind(null, x.id, null)} className="flex flex-wrap items-end gap-2 pl-8">
                <input className="input grow min-w-56" name="title" placeholder="Ny punkt" aria-label="Ny punkt" required />
                <input className="input grow min-w-56 text-sm" name="help" placeholder="Förklaring (valfritt)" aria-label="Förklaring" />
                <input className="input w-16" name="sort_order" type="number" defaultValue={(list.at(-1)?.sort_order ?? 0) + 1} aria-label="Ordning" />
                <button className="btn" type="submit">Lägg till</button>
              </form>
            )}
          </section>
        );
      })}

      {editor && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold">Ny rutin</summary>
          <form action={saveRoutine.bind(null, null)} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="field grow"><label className="label" htmlFor="nn">Namn</label><input className="input" id="nn" name="name" required placeholder="T.ex. Efter konsert" /></div>
            <div className="field grow-[2]"><label className="label" htmlFor="nd">Beskrivning</label><input className="input" id="nd" name="description" /></div>
            <input type="hidden" name="sort_order" value={routines.length + 1} />
            <button className="btn btn-primary" type="submit">Skapa</button>
          </form>
        </details>
      )}

      <section className="card p-5 grid gap-3">
        <h2 className="text-lg font-semibold">Logg</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">Inga genomgångar ännu.</p>
        ) : (
          <table className="table text-sm">
            <thead><tr><th className="pl-0">När</th><th>Rutin</th><th>Signerad av</th><th>Avvikelser</th></tr></thead>
            <tbody>
              {runs.map((x) => {
                const dev = x.routine_checks.filter((c) => !c.done);
                return (
                  <tr key={x.id}>
                    <td className="pl-0 whitespace-nowrap">{fmtDate(x.started_at)} {fmtTime(x.started_at)}</td>
                    <td>{routineName.get(x.routine_id)}</td>
                    <td>{x.completed_at ? `${x.signed_name} ${fmtTime(x.completed_at)}` : <span className="text-st-preliminar">Ej signerad</span>}</td>
                    <td>
                      {dev.length ? dev.map((c) => <span key={c.step_id} className="block text-warn">{stepName.get(c.step_id)}: {c.note}</span>) : <span className="text-muted">–</span>}
                      {x.note && <span className="block text-muted">{x.note}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
