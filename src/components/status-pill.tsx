import { STATUS_LABEL, type EventStatus } from "@/lib/types";

export function StatusPill({ status }: { status: EventStatus }) {
  return <span className={`pill st-${status}`}>{STATUS_LABEL[status]}</span>;
}
