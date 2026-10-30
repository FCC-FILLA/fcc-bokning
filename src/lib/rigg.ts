/** Val för rigg och riv (minuter) i formulären. */
export const RIG_OPTIONS = [0, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

export const rigLabel = (m: number) => (m === 0 ? "–" : m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`);

/** Bokningens tid inklusive rigg och riv. */
export const withRig = (b: { starts_at: string; ends_at: string; rig_minutes?: number | null; strike_minutes?: number | null }) => ({
  from: new Date(new Date(b.starts_at).getTime() - (b.rig_minutes ?? 0) * 60000).toISOString(),
  to: new Date(new Date(b.ends_at).getTime() + (b.strike_minutes ?? 0) * 60000).toISOString(),
});
