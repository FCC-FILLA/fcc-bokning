/** En punkt i körschemat som den visas för kund och personal. */
export type RunSheetItem = {
  id: string;
  starts_at: string;
  duration_minutes: number | null;
  title: string;
  room: string | null;
  who: string | null;
  note: string | null;
  function_id?: string | null;
  function?: string | null;
  color?: string | null;
};

/** Sluttid om punkten har en längd. */
export const runEnd = (x: { starts_at: string; duration_minutes: number | null }) =>
  x.duration_minutes ? new Date(new Date(x.starts_at).getTime() + x.duration_minutes * 60000).toISOString() : null;
