/**
 * Content-Security-Policy con nonce por request.
 * En producción: sin 'unsafe-inline' ni 'unsafe-eval' en script-src.
 */

export function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  const wsOrigin = appUrl
    ? appUrl.replace(/^https?:\/\//, "wss://").replace(/\/$/, "")
    : "";

  const connectSrc = appUrl
    ? `'self'${wsOrigin ? ` ${wsOrigin}` : ""} https://openrouter.ai`
    : "'self' ws: wss: http: https://openrouter.ai";

  // script-src: nonce + strict-dynamic. unsafe-eval solo en desarrollo (React Fast Refresh).
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  // style-src: unsafe-inline sigue siendo habitual (Tailwind / style attrs).
  // El warning de securityheaders era solo sobre script-src.
  const styleSrc = "'self' 'unsafe-inline'";

  const parts = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "font-src 'self'",
    "object-src 'none'",
    "frame-src 'self' blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self'",
  ];

  if (appUrl.startsWith("https://")) {
    parts.push("upgrade-insecure-requests");
  }

  return parts.join("; ").replace(/\s{2,}/g, " ").trim();
}

export function createCspNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
