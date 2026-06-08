import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/services/auth.service";

const IS_PROD = process.env.NODE_ENV === "production";

const publicPaths = ["/login", "/setup-password", "/forgot-password", "/reset-password"];
// Pages toujours accessibles, peu importe l'état de connexion (RGPD / légal)
const alwaysAccessiblePaths = ["/legal", "/privacy"];

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("accessToken")?.value;
  const refreshToken = request.cookies.get("refreshToken")?.value;

  const log = (...args: unknown[]) => console.log(`[PROXY] ${request.method} ${pathname} ::`, ...args);
  log("start", {
    hasAccess: !!accessToken,
    hasRefresh: !!refreshToken,
    referer: request.headers.get("referer") || "",
  });

  // Pages légales : accessibles à tous, jamais de redirection
  if (alwaysAccessiblePaths.some((p) => pathname.startsWith(p))) {
    log("alwaysAccessible → next");
    return NextResponse.next();
  }

  const accessExpired = accessToken ? isTokenExpired(accessToken) : true;
  const hasValidAccess = !!accessToken && !accessExpired;
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));
  log("tokenCheck", { accessExpired, hasValidAccess, isPublicPath });

  // Valid access token — proceed normally
  if (hasValidAccess) {
    if (isPublicPath) {
      // Accès valide mais on demande une page publique (ex : prefetch d'un
      // <Link href="/login">) → on redirige vers le dashboard. On ne touche
      // JAMAIS aux cookies ici : un token valide est valide, point.
      log("valid access + public path → redirect /dashboard");
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    log("valid access → next ✅");
    return NextResponse.next();
  }

  // No valid access token — try refresh
  if (refreshToken) {
    log("no valid access, refresh present → calling refreshSession()");
    try {
      const tokens = await refreshSession(refreshToken);
      log("refreshSession OK", { rotated: !!tokens.refreshToken });
      const response = isPublicPath
        ? NextResponse.redirect(new URL("/dashboard", request.url))
        : NextResponse.next();

      response.cookies.set("accessToken", tokens.accessToken, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "lax",
        maxAge: 15 * 60,
        path: "/",
      });

      if (tokens.refreshToken) {
        response.cookies.set("refreshToken", tokens.refreshToken, {
          httpOnly: true,
          secure: IS_PROD,
          sameSite: "lax",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });
      }

      log("refresh applied → proceeding ✅", { isPublicPath });
      return response;
    } catch (err) {
      log("❌ refreshSession FAILED → CLEAR cookies + redirect /login", {
        error: err instanceof Error ? err.message : String(err),
      });
      // Refresh failed — clear cookies and redirect to login
      const response = isPublicPath
        ? NextResponse.next()
        : NextResponse.redirect(new URL("/login", request.url));
      response.cookies.set("accessToken", "", { path: "/", maxAge: 0 });
      response.cookies.set("refreshToken", "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  // No tokens at all
  if (!isPublicPath) {
    log("❌ no tokens at all → redirect /login");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  log("no tokens, public path → next");
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
