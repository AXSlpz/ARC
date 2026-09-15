/** Versión de producto (alineada con package.json / tag git vX.Y.Z). */
export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "1.1.0";

export function formatAppVersion(prefix = "v"): string {
  const v = APP_VERSION.replace(/^v/i, "");
  return `${prefix}${v}`;
}
