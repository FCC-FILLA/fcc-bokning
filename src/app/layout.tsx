import type { Metadata } from "next";
import "@fontsource-variable/jost";
import "@fontsource-variable/source-sans-3";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FCC Bokning", template: "%s · FCC Bokning" },
  description: "Internt bokningssystem för Filadelfia Convention Center",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body className="antialiased">{children}</body>
    </html>
  );
}
