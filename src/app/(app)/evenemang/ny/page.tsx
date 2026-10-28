import Link from "next/link";
import { redirect } from "next/navigation";
import { canBook, requireProfile } from "@/lib/auth";
import { getLookups } from "@/lib/lookups";
import { BookingFields } from "@/components/booking-fields";
import { EventFields } from "@/components/event-fields";
import { createClient } from "@/lib/supabase/server";
import { createEvent } from "../actions";

export const metadata = { title: "Nytt evenemang" };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ lokal?: string; datum?: string; fran?: string; till?: string; fel?: string }>;
}) {
  const profile = await requireProfile();
  if (!canBook(profile)) redirect("/evenemang");
  const sp = await searchParams;
  const lookups = await getLookups();
  const supabase = await createClient();
  const { data: templates } = await supabase.from("event_templates").select("id, name").order("name");

  return (
    <form action={createEvent} className="grid gap-5 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/evenemang" className="text-sm text-muted hover:underline">← Evenemang</Link>
        <h1 className="text-2xl font-semibold w-full">Nytt evenemang</h1>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">{sp.fel}</p>}
      {(templates ?? []).length > 0 && (
        <div className="card p-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold mr-1">Starta från mall:</span>
          {(templates ?? []).map((t) => (
            <Link key={t.id} href={`/mallar/${t.id}`} className="rounded-full border border-line px-3 py-1 hover:border-muted">{t.name}</Link>
          ))}
        </div>
      )}

      <section className="card p-5 grid gap-4">
        <EventFields lookups={lookups} event={{ responsible_id: profile.id }} />
      </section>

      <section className="card p-5 grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">Första bokningen</h2>
          <p className="text-sm text-muted">Valfritt. Du kan lägga till fler lokaler och tider efter att evenemanget är sparat.</p>
        </div>
        <BookingFields
          lookups={lookups}
          defaultRoom={sp.lokal}
          defaultDate={sp.datum}
          defaultFrom={/^\d{2}:\d{2}$/.test(sp.fran ?? "") ? sp.fran : undefined}
          defaultTo={/^\d{2}:\d{2}$/.test(sp.till ?? "") ? sp.till : undefined}
        />
      </section>

      <div className="flex gap-3">
        <button className="btn btn-primary" type="submit">Spara evenemang</button>
        <Link className="btn" href="/evenemang">Avbryt</Link>
      </div>
    </form>
  );
}
