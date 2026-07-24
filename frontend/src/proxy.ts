import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/setup-password", "/forgot-password", "/reset-password"];
// Pages toujours accessibles, peu importe l'état de connexion (RGPD / légal)
const alwaysAccessiblePaths = ["/legal", "/privacy"];
const REFRESH_ENDPOINT = "/api/auth/refresh";

function isTokenExpired(token: string): boolean {
  try {
    const payloadB64 = token.split(".")[1];
    if (!payloadB64) return true;
    // Un JWT est encodé en base64URL (avec - et _, sans padding). `atob` attend du
    // base64 standard et plante sur - / _ : on convertit d'abord, sinon un token
    // valide est vu comme « expiré » → refresh inutile à chaque requête (prefetch
    // inclus) → rotation du refresh token → déconnexion.
    const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// Prefetch : Next.js les tire de façon spéculative et peut annuler/ignorer la
// réponse. On ne doit JAMAIS y muter les cookies d'auth (ni rotation, ni clear),
// sinon on désynchronise le cookie du navigateur et la base → déconnexion.
function isPrefetch(request: NextRequest): boolean {
  const h = request.headers;
  return (
    h.get("next-router-prefetch") === "1" ||
    h.get("purpose") === "prefetch" ||
    (h.get("sec-purpose")?.includes("prefetch") ?? false)
  );
}

// Construit le chemin de retour après refresh. On retire `_rsc` (paramètre interne
// des navigations RSC) mais on conserve les vrais query params (?toast=…, filtres…).
function buildNextParam(request: NextRequest, isPublicPath: boolean): string {
  if (isPublicPath) return "/dashboard";
  const params = new URLSearchParams(request.nextUrl.search);
  params.delete("_rsc");
  const qs = params.toString();
  const dest = request.nextUrl.pathname + (qs ? `?${qs}` : "");
  if (!dest.startsWith("/") || dest.startsWith("//")) return "/dashboard";
  return dest;
}

/**
 * Proxy = check OPTIMISTE uniquement (cookie only, jamais de DB, jamais de
 * rotation). Il tourne sur chaque route (prefetch compris) : toute écriture DB ou
 * rotation de token ici est à la fois lente et racy. La rotation vit dans
 * l'endpoint dédié /api/auth/refresh, sur une vraie navigation dont la réponse
 * est toujours commitée par le navigateur.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("accessToken")?.value;
  const refreshToken = request.cookies.get("refreshToken")?.value;
  const prefetch = isPrefetch(request);
  const isGet = request.method === "GET";

  const log = (...args: unknown[]) => console.log(`[PROXY] ${request.method} ${pathname} ::`, ...args);
  log("start", { hasAccess: !!accessToken, hasRefresh: !!refreshToken, prefetch });

  // Pages légales : accessibles à tous, jamais de redirection.
  if (alwaysAccessiblePaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasValidAccess = !!accessToken && !isTokenExpired(accessToken);
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  // Access token valide (optimiste — la DAL/getSession revalide en DB au rendu).
  if (hasValidAccess) {
    if (isPublicPath) {
      log("valid access + public path → redirect /dashboard");
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // À partir d'ici : pas d'access valide. On ne rafraîchit JAMAIS ici.

  // Prefetch : ne toucher à rien. La vraie navigation déclenchera le refresh.
  if (prefetch) {
    log("prefetch sans access valide → next (cookies intacts)");
    return NextResponse.next();
  }

  // Refresh token présent → on délègue la rotation à l'endpoint dédié, mais
  // uniquement pour les vraies navigations GET (réponse commitée par le
  // navigateur). Les non-GET (server actions) passent : leur propre garde
  // getSession() renvoie « session expirée » et la navigation GET suivante
  // rafraîchit. On ne redirige pas un POST (perdrait la méthode / le corps).
  if (refreshToken) {
    if (isGet) {
      const url = new URL(REFRESH_ENDPOINT, request.url);
      url.searchParams.set("next", buildNextParam(request, isPublicPath));
      log("access expiré + refresh présent → redirect endpoint refresh", { next: url.searchParams.get("next") });
      return NextResponse.redirect(url);
    }
    log("access expiré + refresh présent + non-GET → next (garde applicative)");
    return NextResponse.next();
  }

  // Aucun token exploitable.
  if (isPublicPath) {
    return NextResponse.next();
  }
  if (isGet) {
    log("❌ aucun token → redirect /login");
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Les fichiers statiques de /public sont exclus par extension : sans ça, le
    // proxy renvoie un 307 vers /login sur /mon-image.png, et l'optimiseur
    // d'images (qui refetch l'URL en interne, sans cookie) reçoit une redirection
    // au lieu d'une image → "The requested resource isn't a valid image" (400).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$|.*\\.avif$|.*\\.svg$|.*\\.ico$|.*\\.woff$|.*\\.woff2$|.*\\.ttf$).*)",
  ],
};
