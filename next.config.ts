import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF-biblioteket körs som vanligt Node-paket i stället för att paketeras.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
