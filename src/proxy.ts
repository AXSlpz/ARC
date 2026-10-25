import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildCspHeader, createCspNonce } from "@/lib/csp";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/totp",
  "/api/auth/2fa/setup",
  "/api/auth/2fa/confirm",
  "/api/public/branding",
  "/api/public/logo",
  "/api/webhooks/meta",
]);

const SESSION_COOKIE = "wa_session";
const PENDING_COOKIE = "wa_2fa_pending";
const PORTAL_COOKIE = "arc_portal_session";
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

// Rutas del portal de clientes que no requieren sesión (auth pública).
const PORTAL_PUBLIC_PATHS = new Set([
  "/api/portal/register",
  "/api/portal/login",
  "/api/portal/logout",
  "/api/portal/me",
  "/api/portal/identity/read",
  "/api/portal/identity/confirm",
]);

/** Catálogo de registro: solo GET, sin PII, rate-limit en cada route. */
function isPublicPortalCatalogPath(pathname: string): boolean {
  return pathname === "/api/portal/catalog" || pathname.startsWith("/api/portal/catalog/");
}

function enforceApiAuth(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return null;

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Portal de clientes: sesión propia (arc_portal_session), separada del admin.
  if (pathname.startsWith("/api/portal/")) {
    if (PORTAL_PUBLIC_PATHS.has(pathname) || isPublicPortalCatalogPath(pathname)) {
      return NextResponse.next();
    }
    const portalSession = request.cookies.get(PORTAL_COOKIE)?.value;
    if (portalSession && TOKEN_PATTERN.test(portalSession)) {
      return NextResponse.next();
    }
    return NextResponse.json(
      { error: "No autorizado" },
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const pendingId = request.cookies.get(PENDING_COOKIE)?.value;

  if (sessionId && TOKEN_PATTERN.test(sessionId)) {
    return NextResponse.next();
  }

  if (pendingId && TOKEN_PATTERN.test(pendingId)) {
    return NextResponse.json(
      { error: "Completa la verificación 2FA" },
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return NextResponse.json(
    { error: "No autorizado" },
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const authResponse = enforceApiAuth(request);
    return authResponse ?? NextResponse.next();
  }

  // Páginas HTML: CSP con nonce (sin unsafe-inline/eval en scripts de prod)
  const nonce = createCspNonce();
  const csp = buildCspHeader(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
