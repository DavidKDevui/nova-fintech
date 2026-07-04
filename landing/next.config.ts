import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autonome (server.js + node_modules minimal) pour une image Docker légère.
  output: "standalone",
  // Ancre le tracing des fichiers sur ce dossier (plusieurs lockfiles existent en
  // amont : pnpm-lock.yaml global). Évite aussi le warning d'inférence de racine.
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  // Page marketing avec une seule image : on évite la dépendance native `sharp`
  // dans l'image Alpine en désactivant l'optimisation serveur (impact négligeable).
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
