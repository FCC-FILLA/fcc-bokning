import { fmtTime } from "@/lib/datum";

export type RoutineDoc = {
  id: string; name: string; description: string | null;
  steps: { id: string; title: string; help: string | null }[];
  runs: { id: string; started_at: string; completed_at: string | null; signed_name: string | null; mine: boolean; checks: Record<string, { done: boolean; note: string | null }> }[];
};

/**
 * Rutiner för att öppna och stänga huset, som personalen går igenom i telefonen.
 * Varje punkt bockas av, eller markeras som avvikelse med en kommentar. Sist signerar man.
 */
export function Routines({
  routines, check, sign, defaultName, message,
}: {
  routines: RoutineDoc[];
  check: (routineId: string, stepId: string, done: boolean, fd: FormData) => Promise<void>;
  sign: (runId: string, fd: FormData) => Promise<void>;
  defaultName?: string | null;
  message?: string | null;
}) {
  if (!routines.length) return <div className="card p-8 text-center text-muted">Inga rutiner är upplagda.</div>;
  return (
    <div className="grid gap-4">
      {message && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{message}</p>}
      {routines.map((r) => {
        const mine = r.runs.find((u) => u.mine && !u.completed_at);
        const doneToday = r.runs.filter((u) => u.completed_at);
        const checks = mine?.checks ?? {};
        const remaining = r.steps.filter((s) => !checks[s.id] || (!checks[s.id].done && !checks[s.id].note)).length;
        return (
          <details key={r.id} id={`rutin-${r.id}`} className="card p-4 scroll-mt-4" open={!!mine}>
            <summary className="cursor-pointer">
              <span className="font-display text-lg font-semibold">{r.name}</span>
              <span className="ml-2 text-sm text-muted">
                {mine ? `${r.steps.length - remaining} av ${r.steps.length} klara` : doneToday.length ? `Gjord i dag ${fmtTime(doneToday[0].completed_at!)} av ${doneToday[0].signed_name}` : "Inte gjord i dag"}
              </span>
            </summary>
            {r.description && <p className="mt-2 text-sm text-muted">{r.description}</p>}
            <ol className="mt-3 grid gap-2">
              {r.steps.map((s, i) => {
                const c = checks[s.id];
                return (
                  <li key={s.id} className={`rounded-lg border p-3 grid gap-2 ${c?.done ? "border-ok/40 bg-st-genomford-soft/50" : c ? "border-warn/40 bg-warn-soft/50" : "border-line"}`}>
                    <div className="flex items-start gap-3">
                      <span className="w-5 shrink-0 text-sm text-muted tabular-nums">{i + 1}.</span>
                      <span className="grow">
                        <span className="font-medium">{s.title}</span>
                        {s.help && <span className="block text-sm text-muted">{s.help}</span>}
                        {c && !c.done && c.note && <span className="block text-sm text-warn">Avvikelse: {c.note}</span>}
                        {c?.done && c.note && <span className="block text-sm text-muted">{c.note}</span>}
                      </span>
                      <form action={check.bind(null, r.id, s.id, !c?.done)}>
                        <input type="hidden" name="note" value={c?.note ?? ""} />
                        <button type="submit" className={`btn min-w-20 ${c?.done ? "btn-primary" : ""}`} aria-pressed={!!c?.done}>{c?.done ? "✓ Klar" : "Klar"}</button>
                      </form>
                    </div>
                    <details className="pl-8 text-sm">
                      <summary className="cursor-pointer text-muted">Kommentar eller avvikelse</summary>
                      <form action={check.bind(null, r.id, s.id, false)} className="mt-2 flex flex-wrap gap-2">
                        <input className="input grow" name="note" defaultValue={c?.note ?? ""} placeholder="Vad var fel och vad gjorde du?" required maxLength={500} />
                        <button className="btn" type="submit">Spara avvikelse</button>
                      </form>
                    </details>
                  </li>
                );
              })}
            </ol>
            {mine && (
              <form action={sign.bind(null, mine.id)} className="mt-4 grid gap-2 rounded-lg bg-sunk/60 p-3">
                <p className="text-sm">{remaining ? `${remaining} punkter kvar innan du kan signera.` : "Allt är genomgånget. Signera med ditt namn."}</p>
                <div className="flex flex-wrap gap-2">
                  <input className="input grow" name="name" defaultValue={defaultName ?? ""} placeholder="Ditt namn" required aria-label="Ditt namn" />
                  <input className="input grow" name="note" placeholder="Övrigt (valfritt)" aria-label="Övrigt" />
                  <button className="btn btn-primary" type="submit" disabled={remaining > 0}>Signera</button>
                </div>
              </form>
            )}
            {doneToday.length > 0 && (
              <p className="mt-3 text-xs text-muted">I dag: {doneToday.map((u) => `${fmtTime(u.completed_at!)} ${u.signed_name}`).join(", ")}</p>
            )}
          </details>
        );
      })}
    </div>
  );
}

export const ROUTINE_MSG: Record<string, string> = {
  ej_klar: "Alla punkter måste vara klara eller ha en kommentar om avvikelsen innan du signerar.",
  namn: "Skriv ditt namn för att signera.",
  saknas: "Genomgången hittades inte. Ladda om sidan.",
};
