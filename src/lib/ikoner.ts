// Linjeikoner för artiklar i offerten. Ritade på ett 48×48-rutnät, bara banor (path),
// så att samma data kan ritas både på webben (<svg>) och i PDF:en (react-pdf <Svg>).

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Femuddig stjärna med centrum (cx, cy). */
function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + rr * Math.cos(rad)).toFixed(1)} ${(cy + rr * Math.sin(rad)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

export const ICONS = {
  room: { label: "Lokal", paths: ["M8 42V12l16-6l16 6v30", "M4 42h40", "M20 42V30h8v12", "M14 17h4M14 24h4M30 17h4M30 24h4"] },
  meal: { label: "Måltid", paths: [circle(24, 24, 11), circle(24, 24, 6.5), "M6 8v9a3 3 0 0 0 6 0V8M9 8v32", "M41 40V8c-3 2-4.5 7-4.5 14H41"] },
  coffee: { label: "Kaffe och fika", paths: ["M9 18h24v9a10 10 0 0 1-10 10h-4A10 10 0 0 1 9 27Z", "M33 21h3a4.5 4.5 0 0 1 0 9h-3", "M16 7c-2 2 2 4 0 6M23 7c-2 2 2 4 0 6", "M7 42h28"] },
  drink: { label: "Dryck", paths: ["M15 6h18l-1 11a8 8 0 0 1-16 0Z", "M16 13h16", "M24 25v15", "M16 41h16"] },
  mingle: { label: "Mingel och tilltugg", paths: ["M9 9h30L24 26Z", "M24 26v14M16 41h16", "M30 4l-9 15", circle(22.5, 15.5, 2.5)] },
  host: { label: "Värd och service", paths: ["M5 33h7l9 4h11l11-7a3 3 0 0 0-3.5-5L31 29", "M21 32h7a3 3 0 0 0 0-6h-8l-6-2H5", star(13, 11, 5), star(24, 7, 5), star(35, 11, 5)] },
  person: { label: "Personal", paths: [circle(24, 15, 7), "M10 42a14 14 0 0 1 28 0"] },
  security: { label: "Säkerhet", paths: ["M24 6l15 5v11c0 9-6 16-15 20C15 38 9 31 9 22V11Z", "M18 24l4.5 4.5L31 20"] },
  fire: { label: "Brand", paths: ["M24 42c-7 0-12-5-12-11c0-7 6-10 6-17c4 3 6 6 6 9c2-2 3-4.5 3-7.5c5.5 4 9 9.5 9 15.5c0 6-5 11-12 11Z"] },
  coat: { label: "Garderob", paths: ["M20 11a4 4 0 1 1 4 4v4", "M24 19L5 33h38Z"] },
  chair: { label: "Möblering", paths: ["M33 4c2.5 9 1.5 18-3 24", "M11 28h19", "M12 28l-3 15M29 28l3 15", "M13 36h17"] },
  stage: { label: "Scen", paths: ["M4 33h40v7H4Z", "M5 6h38", "M7 6v27M41 6v27", "M7 6c1 11 5 19 9 22M41 6c-1 11-5 19-9 22"] },
  light: { label: "Ljus", paths: ["M15 6h14l4 15H11Z", "M22 3v3", "M13 27l-4 13M22 27v14M31 27l4 13"] },
  sound: { label: "Ljud", paths: ["M12 5h24v38H12Z", circle(24, 30, 6.5), circle(24, 15, 3)] },
  mic: { label: "Mikrofon", paths: ["M18 12a6 6 0 0 1 12 0v10a6 6 0 0 1-12 0Z", "M12 22a12 12 0 0 0 24 0", "M24 34v8M16 42h16"] },
  screen: { label: "Skärm och bild", paths: ["M5 8h38v24H5Z", "M24 32v8M16 41h16"] },
  camera: { label: "Kamera", paths: ["M5 15h25v19H5Z", "M30 21l13-6v19l-13-6", circle(11, 10, 3.5), circle(22, 10, 3.5)] },
  broadcast: { label: "Streaming", paths: [circle(24, 24, 3.5), "M15 15a13 13 0 0 0 0 18M33 15a13 13 0 0 1 0 18", "M9 9a21 21 0 0 0 0 30M39 9a21 21 0 0 1 0 30"] },
  tech: { label: "Teknik", paths: ["M5 13h38v19H5Z", circle(13, 22.5, 3.5), circle(24, 22.5, 3.5), circle(35, 22.5, 4.5), "M35 18v4", "M12 32v6h11"] },
  ticket: { label: "Biljett", paths: ["M5 14h38v6a4 4 0 0 0 0 8v6H5v-6a4 4 0 0 0 0-8Z", "M31 14v3M31 22v4M31 31v3"] },
  clean: { label: "Städ", paths: ["M30 5L21 23", "M13 23h16l4 19H9Z", "M17 30l-1.5 12M21.5 30v12M26 30l1.5 12", "M39 6l1.8 4.2L45 12l-4.2 1.8L39 18l-1.8-4.2L33 12l4.2-1.8Z"] },
  power: { label: "El", paths: ["M18 5v9M30 5v9", "M13 14h22v8a11 11 0 0 1-22 0Z", "M24 33v10"] },
  wifi: { label: "Internet", paths: ["M7 19a24 24 0 0 1 34 0", "M13 26a16 16 0 0 1 22 0", "M19 33a8 8 0 0 1 10 0", circle(24, 39, 1.5)] },
  document: { label: "Administration", paths: ["M11 5h19l8 8v30H11Z", "M30 5v8h8", "M17 22h15M17 28h15M17 34h9"] },
  discount: { label: "Rabatt", paths: ["M6 24L24 6h18v18L24 42Z", circle(34, 14, 2.5), "M18 30l10-10"] },
  bed: { label: "Övernattning", paths: ["M4 39V11", "M4 31h40v8", "M44 31v-6a6 6 0 0 0-6-6H20v12", circle(12, 25, 4)] },
  boat: { label: "Båt", paths: ["M4 29h40l-6 10H10Z", "M24 29V6l13 17H24"] },
  sauna: { label: "Bastu", paths: ["M7 41h34", "M15 35c-3.5-4 3.5-6 0-10.5s3.5-6 0-10.5", "M24 35c-3.5-4 3.5-6 0-10.5s3.5-6 0-10.5", "M33 35c-3.5-4 3.5-6 0-10.5s3.5-6 0-10.5"] },
  clock: { label: "Tid", paths: [circle(24, 24, 18), "M24 14v10l7 5"] },
  tent: { label: "Tält", paths: ["M24 6L4 42h40Z", "M17 42l7-13l7 13"] },
  box: { label: "Övrigt", paths: ["M24 4l18 10v20L24 44L6 34V14Z", "M6 14l18 10l18-10", "M24 24v20"] },
} as const;

export type IconKey = keyof typeof ICONS;
export const ICON_KEYS = Object.keys(ICONS) as IconKey[];
export const iconPaths = (key: string | null | undefined) => ICONS[(key && key in ICONS ? key : "box") as IconKey].paths;
