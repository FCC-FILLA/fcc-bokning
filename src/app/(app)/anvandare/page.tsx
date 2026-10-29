import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin, requireProfile } from "@/lib/auth";
import { fmtDate } from "@/lib/datum";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL, type AppRole, type Profile } from "@/lib/types";

export const metadata = { title: "Användare" };

const ROLES = Object.keys(ROLE_LABEL) as AppRole[];
const ROLE_HELP: Record<AppRole, string> = {
  admin: "Allt, inklusive prislista, lokaler och användare",
  bokare: "Skapar och ändrar evenemang, kunder och offerter",
  produktion: "Läser allt, planerar personal och attesterar tid",
  lasare: "Läser allt, ändrar inget",
  personal: "Internpersonal: ser bara sin personalportal (pass och tid)",
};

async function updateUser(id: string, fd: FormData) {
  "use server";
  const me = await requireProfile();
  if (!isAdmin(me)) redirect("/");
  const role = String(fd.get("role")) as AppRole;
  const patch: Partial<Profile> = {
    full_name: String(fd.get("full_name") ?? "").trim().slice(0, 120),
  };
  // Man kan inte ta bort sin egen admin-behörighet eller stänga av sig själv.
  if (id !== me.id) {
    if (ROLES.includes(role)) patch.role = role;
    patch.active = fd.get("active") === "on";
  }
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  revalidatePath("/anvandare");
  redirect(`/anvandare?${error ? "fel=1" : "sparad=1"}`);
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ fel?: string; sparad?: string }> }) {
  const me = await requireProfile();
  if (!isAdmin(me)) redirect("/");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("active", { ascending: false }).order("full_name");
  const users = (data ?? []) as (Profile & { created_at: string })[];

  return (
    <div className="grid gap-5 max-w-5xl">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Användare</h1>
        <p className="text-sm text-muted">Nya användare bjuds in under Authentication → Users → Invite user i Supabase. De dyker upp här med läsbehörighet tills du ger dem en roll.</p>
      </div>
      {sp.fel && <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">Det gick inte att spara.</p>}
      {sp.sparad && <p className="rounded-lg bg-st-genomford-soft px-4 py-3 text-sm text-ok">Sparat.</p>}

      <div className="card overflow-x-auto">
        <table className="table min-w-[860px]">
          <thead>
            <tr><th>Namn</th><th>E-post</th><th>Roll</th><th>Aktiv</th><th>Sedan</th><th /></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                  <td colSpan={6} className="p-0">
                    <form action={updateUser.bind(null, u.id)} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_180px_70px_110px_80px] items-center gap-3 px-3 py-2">
                      <input className="input" name="full_name" defaultValue={u.full_name} placeholder="Namn" aria-label={`Namn för ${u.email}`} />
                      <span className="text-sm truncate" title={u.email ?? ""}>{u.email}</span>
                      <select className="input" name="role" defaultValue={u.role} disabled={self} aria-label="Roll" title={ROLE_HELP[u.role]}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="active" defaultChecked={u.active} disabled={self} /> Ja
                      </label>
                      <span className="text-sm text-muted">{fmtDate(u.created_at)}</span>
                      <button className="btn text-sm" type="submit">Spara</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="card p-5 grid gap-2 text-sm">
        <h2 className="text-lg font-semibold">Roller</h2>
        <dl className="grid grid-cols-[120px_1fr] gap-y-1">
          {ROLES.map((r) => (
            <div key={r} className="contents">
              <dt className="font-semibold">{ROLE_LABEL[r]}</dt>
              <dd className="text-muted">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted">En avstängd användare kan inte se något i appen, och hens kalenderlänk slutar fungera.</p>
      </section>
    </div>
  );
}
