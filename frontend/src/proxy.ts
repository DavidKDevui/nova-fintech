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

  // Pages légales : accessibles à tous, jamais de redirection
  if (alwaysAccessiblePaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasValidAccess = accessToken && !isTokenExpired(accessToken);
  const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

  // Valid access token — proceed normally
  if (hasValidAccess) {
    if (isPublicPath) {
      // Don't redirect to dashboard if we just came from there (prevents loop when DB is down)
      const referer = request.headers.get("referer") || "";
      if (referer.includes("/dashboard")) {
        const response = NextResponse.next();
        response.cookies.set("accessToken", "", { path: "/", maxAge: 0 });
        response.cookies.set("refreshToken", "", { path: "/", maxAge: 0 });
        return response;
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // No valid access token — try refresh
  if (refreshToken) {
    try {
      const tokens = await refreshSession(refreshToken);
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

      return response;
    } catch {
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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
