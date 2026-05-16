import type { NextConfig } from "next";

// En-têtes de sécurité appliqués à toutes les routes. Note : la CSP est posée
// en `report-only` côté dev pour ne pas bloquer le HMR / Devtools. En prod,
// on bascule sur l'en-tête appliqué.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: "15mb",
  },
  // Modules natifs : ne pas les bundler, les laisser require()-er au runtime.
  // bcrypt utilise un .node natif qui ne passe pas dans Turbopack.
  serverExternalPackages: ["bcrypt"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
