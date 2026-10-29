"use client";

import { useRef, useState } from "react";

const MAX = 1600;

/** Filväljare för bilder. Skalar ner till max 1600 px och JPEG i webbläsaren innan formuläret skickas. */
export function ImageInput({ name, label, id }: { name: string; label: string; id?: string }) {
  const inputId = id ?? `${name}-file`;
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    if (!file) return setPreview(null);
    if (!file.type.startsWith("image/")) {
      e.target.value = "";
      return setError("Välj en bildfil (JPG, PNG eller WebP).");
    }
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
      if (!blob) throw new Error();
      const out = new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(out);
      input.current!.files = dt.files;
      setPreview(URL.createObjectURL(out));
    } catch {
      setError("Bilden gick inte att läsa. Prova en annan fil.");
      e.target.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <label className="label" htmlFor={inputId}>{label}</label>
      <input ref={input} id={inputId} name={name} type="file" accept="image/jpeg,image/png,image/webp" className="text-sm" onChange={onChange} />
      {busy && <p className="text-sm text-muted">Förbereder bilden …</p>}
      {error && <p className="text-sm text-warn">{error}</p>}
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- lokal förhandsvisning (blob-adress)
        <img src={preview} alt="Förhandsvisning av ny bild" className="h-32 w-48 rounded-lg object-cover" />
      )}
    </div>
  );
}
