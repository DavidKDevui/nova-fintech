import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/services/auth.service";

const IS_PROD = process.env.NODE_ENV === "production";

// Ce handler lit les cookies et fait un écriture DB : jamais de cache.
export const dynamic = "force-dynamic";

/**
 * Endpoint DÉDIÉ de rotation du refresh token.
 *
 * Pourquoi un endpoint plutôt que le proxy : le proxy tourne sur CHAQUE requête,
 * y compris les prefetch que le navigateur peut annuler/ignorer. Si la rotation
 * s'y produisait, le nouveau refresh token pouvait être émis sur une réponse
 * jetée par le navigateur → cookie (R0) désynchronisé de la base (R1) → au cycle
 * suivant R0 ne matche plus rien → déconnexion.
 *
 * Ici la rotation ne se fait QUE sur une vraie navigation (le proxy y redirige
 * les GET non-prefetch). La réponse — un redirect vers `next` avec Set-Cookie —
 * est donc toujours commitée par le navigateur. La rotation est ainsi sérialisée
 * par navigation réelle. La défense en profondeur (CAS + fenêtre de grâce) dans
 * refreshSession couvre les navigations réellement concurrentes (2 onglets, RSC).
 */
function safeRedirectTarget(next: string | null): string {
  // Anti open-redirect : uniquement un chemin relatif same-origin.
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

function clearAndRedirectToLogin(request: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.set("accessToken", "", { path: "/", maxAge: 0 });
  res.cookies.set("refreshToken", "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(request: NextRequest) {
  const refreshToken = request.cookies.get("refreshToken")?.value;
  const next = safeRedirectTarget(request.nextUrl.searchParams.get("next"));
  const log = (...args: unknown[]) => console.log("[REFRESH-ENDPOINT] ::", ...args);

  if (!refreshToken) {
    log("no refresh cookie → clear + /login");
    return clearAndRedirectToLogin(request);
  }

  try {
    const tokens = await refreshSession(refreshToken);
    log("OK", { rotated: !!tokens.refreshToken, next });

    const res = NextResponse.redirect(new URL(next, request.url));
    res.cookies.set("accessToken", tokens.accessToken, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      maxAge: 15 * 60, // 15 min
      path: "/",
    });
    // On ne repose le cookie refresh QUE si une rotation a réellement eu lieu.
    // Sur les chemins access-only (CAS perdu / fenêtre de grâce), tokens.refreshToken
    // est null → on laisse le cookie existant intact.
    if (tokens.refreshToken) {
      res.cookies.set("refreshToken", tokens.refreshToken, {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60, // 7 jours
        path: "/",
      });
    }
    return res;
  } catch (err) {
    log("❌ refreshSession a échoué → clear + /login", err instanceof Error ? err.message : String(err));
    return clearAndRedirectToLogin(request);
  }
}
