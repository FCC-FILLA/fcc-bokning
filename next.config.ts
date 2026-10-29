import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF-biblioteket körs som vanligt Node-paket i stället för att paketeras.
  serverExternalPackages: ["@react-pdf/renderer"],
  // Artikelbilder skalas ner i webbläsaren före uppladdning, men ge lite marginal.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  images: {
    // Uppladdade artikelbilder ligger i Supabase Storage (publik hink "artiklar").
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
  },
};

export default nextConfig;
