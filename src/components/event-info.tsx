import { fmtDate, fmtTime, isoToDate } from "@/lib/datum";
import { parseItems, planFor } from "@/lib/moblering";
import { LayoutSheet } from "@/components/layout-sheet";
import { RunSheetView } from "@/components/run-sheet-view";
import type { RunSheetItem } from "@/lib/korschema";

/** Det personalen får se om evenemanget: program, teknik, mat, ansvarig och delade dokument. Ingen ekonomi. */
export type StaffEventInfo = {
  title: string;
  participants: number | null;
  description: string | null;
  technical_info: string | null;
  hospitality_info: string | null;
  staff_info?: string | null;
  responsible_name: string | null;
  responsible_email: string | null;
  bookings: { room: string; starts_at: string; ends_at: string }[];
  documents: { id: string; name: string; url: string | null }[];
  layouts?: { id: string; name: string; room: string; notes: string | null; items: unknown; plan: unknown; kvm: number | null; starts_at: string | null; walls?: string[] | null }[];
  furniture?: { id: string; name: string; color: string | null; sort_order: number }[];
  run_sheet?: RunSheetItem[];
};

export function EventInfo({ info, docHref, functionId }: { info: StaffEventInfo; docHref: (id: string) => string; functionId?: string | null }) {
  const texts = [
    { title: "Till personalen", text: info.staff_info ?? null },
    { title: "Om evenemanget", text: info.description },
    { title: "Teknik", text: info.technical_info },
    { title: "Mat och dryck", text: info.hospitality_info },
  ].filter((x) => x.text?.trim());
  const days = new Map<string, StaffEventInfo["bookings"]>();
  for (const b of info.bookings) days.set(isoToDate(b.starts_at), [...(days.get(isoToDate(b.starts_at)) ?? []), b]);
  return (
    <details className="border-t border-line pt-2">
      <summary className="cursor-pointer text-sm font-medium text-brand">Om evenemanget</summary>
      <div className="mt-2 grid gap-3 text-sm">
        {info.participants ? <p>{info.participants} gäster</p> : null}
        {days.size > 0 && (
          <div className="grid gap-1">
            <p className="font-semibold">Program</p>
            {[...days].map(([date, list]) => (
              <div key={date}>
                <p className="capitalize text-muted">{fmtDate(date)}</p>
                <ul>{list.map((b, i) => <li key={i} className="flex gap-3"><span className="tabular-nums w-24">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span>{b.room}</li>)}</ul>
              </div>
            ))}
          </div>
        )}
        {(info.run_sheet ?? []).length > 0 && (
          <div className="grid gap-1">
            <p className="font-semibold">Körschema</p>
            <RunSheetView items={info.run_sheet!} mine={functionId} compact />
          </div>
        )}
        {texts.map((x) => (
          <div key={x.title}><p className="font-semibold">{x.title}</p><p className="whitespace-pre-line">{x.text}</p></div>
        ))}
        {(info.layouts ?? []).map((l) => (
          <div key={l.id} className="grid gap-1">
            <p className="font-semibold">Möblering: {l.name} <span className="font-normal text-muted">· {l.room}{l.starts_at ? ` · ${fmtDate(l.starts_at)} ${fmtTime(l.starts_at)}` : ""}</span></p>
            <LayoutSheet compact plan={planFor(l.plan, l.kvm)} items={parseItems(l.items)} types={info.furniture ?? []} notes={l.notes} walls={l.walls} />
          </div>
        ))}
        {info.documents.length > 0 && (
          <div>
            <p className="font-semibold">Dokument</p>
            <ul>{info.documents.map((d) => <li key={d.id}><a className="underline break-all" href={d.url ?? docHref(d.id)}>{d.name}</a></li>)}</ul>
          </div>
        )}
        {info.responsible_name && (
          <p className="text-muted">Ansvarig: {info.responsible_name}{info.responsible_email && <> · <a className="underline" href={`mailto:${info.responsible_email}`}>{info.responsible_email}</a></>}</p>
        )}
      </div>
    </details>
  );
}
