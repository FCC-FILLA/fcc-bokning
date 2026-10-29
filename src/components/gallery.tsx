"use client";

import Image from "next/image";
import { useRef, useState } from "react";

/** Bild som öppnar ett bildspel om det finns fler bilder. */
export function Gallery({ images, alt, sizes }: { images: string[]; alt: string; sizes: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(0);
  const more = images.length - 1;
  const go = (d: number) => setI((x) => (x + d + images.length) % images.length);

  return (
    <>
      <button
        type="button"
        className="group absolute inset-0 cursor-zoom-in"
        aria-label={more > 0 ? `Visa ${images.length} bilder av ${alt}` : `Visa bild av ${alt}`}
        onClick={() => {
          setI(0);
          dialog.current?.showModal();
        }}
      >
        <Image src={images[0]} alt={alt} fill sizes={sizes} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        {more > 0 && (
          <span className="absolute right-2 bottom-2 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold text-white flex items-center gap-1">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="1.5" y="3.5" width="10" height="9" rx="1" />
              <path d="M4.5 1.5h10v9" />
            </svg>
            +{more}
          </span>
        )}
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(1100px,94vw)] bg-transparent p-0 backdrop:bg-black/85"
        onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(1);
          if (e.key === "ArrowLeft") go(-1);
        }}
      >
        <div className="relative aspect-[3/2] w-full">
          <Image src={images[i]} alt={`${alt}, bild ${i + 1} av ${images.length}`} fill sizes="94vw" className="object-contain" />
        </div>
        <div className="mt-3 flex items-center justify-between text-white">
          <span className="text-sm opacity-80">{alt} · {i + 1} / {images.length}</span>
          <div className="flex gap-2">
            {images.length > 1 && (
              <>
                <button type="button" className="rounded-full bg-white/15 px-4 py-2 hover:bg-white/25" onClick={() => go(-1)} aria-label="Föregående bild">←</button>
                <button type="button" className="rounded-full bg-white/15 px-4 py-2 hover:bg-white/25" onClick={() => go(1)} aria-label="Nästa bild">→</button>
              </>
            )}
            <button type="button" className="rounded-full bg-white px-4 py-2 text-fg" onClick={() => dialog.current?.close()}>Stäng</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
