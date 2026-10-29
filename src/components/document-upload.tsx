"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Laddar upp filer direkt till Storage (upp till 50 MB) och registrerar dem på evenemanget. */
export function DocumentUpload({ eventId, register }: { eventId: string; register: (eventId: string, path: string, name: string, mime: string, size: number) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const supabase = createClient();
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        setError(`${file.name} är större än 50 MB.`);
        continue;
      }
      setBusy(file.name);
      const safe = file.name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-80) || "fil";
      const path = `${eventId}/${crypto.randomUUID()}-${safe}`;
      const { error: e } = await supabase.storage.from("dokument").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (e) {
        setError(`Det gick inte att ladda upp ${file.name}.`);
        continue;
      }
      await register(eventId, path, file.name, file.type, file.size);
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="btn cursor-pointer">
        {busy ? `Laddar upp ${busy} …` : "Ladda upp dokument"}
        <input ref={input} type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} disabled={!!busy} />
      </label>
      {error && <span className="text-sm text-warn">{error}</span>}
    </div>
  );
}
