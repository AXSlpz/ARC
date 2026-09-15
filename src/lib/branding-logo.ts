import fs from "node:fs";
import path from "node:path";

const UPLOADS_DIR = path.resolve(process.cwd(), "data", "uploads");
export const CAPTIVE_PORTAL_LOGO_DIR = path.resolve(
  process.cwd(),
  "public",
  "branding"
);

const LOGO_BASENAMES = [
  "logo.png",
  "logo.svg",
  "logo.jpg",
  "logo.jpeg",
  "logo.webp",
];

/** Resuelve el logo público: DB → uploads → public/branding. */
export function resolveLogoFilename(dbFilename: string | null): string | null {
  ensureCaptivePortalLogoSynced();

  if (dbFilename) {
    const captivePath = path.join(CAPTIVE_PORTAL_LOGO_DIR, dbFilename);
    if (fs.existsSync(captivePath)) return dbFilename;
    const uploadPath = path.join(UPLOADS_DIR, dbFilename);
    if (fs.existsSync(uploadPath)) {
      syncCaptivePortalLogo(dbFilename);
      return dbFilename;
    }
  }

  for (const name of LOGO_BASENAMES) {
    const captivePath = path.join(CAPTIVE_PORTAL_LOGO_DIR, name);
    if (fs.existsSync(captivePath)) return name;
    const uploadPath = path.join(UPLOADS_DIR, name);
    if (fs.existsSync(uploadPath)) {
      syncCaptivePortalLogo(name);
      return name;
    }
  }

  return null;
}

export function getCaptivePortalLogoUrl(filename: string | null): string | null {
  const resolved = resolveLogoFilename(filename);
  if (!resolved) return null;
  return `/branding/${resolved}`;
}

export function getPublicLogoApiUrl(filename: string | null): string | null {
  if (!filename) return null;
  return `/api/public/logo?v=${encodeURIComponent(filename)}`;
}

/** Copia el logo de admin a public/branding para el portal captivo / login. */
export function syncCaptivePortalLogo(filename: string): void {
  const source = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(source)) return;

  try {
    if (!fs.existsSync(CAPTIVE_PORTAL_LOGO_DIR)) {
      fs.mkdirSync(CAPTIVE_PORTAL_LOGO_DIR, { recursive: true });
    }

    fs.copyFileSync(source, path.join(CAPTIVE_PORTAL_LOGO_DIR, filename));

    for (const stale of LOGO_BASENAMES) {
      if (stale === filename) continue;
      const stalePath = path.join(CAPTIVE_PORTAL_LOGO_DIR, stale);
      if (fs.existsSync(stalePath)) fs.unlinkSync(stalePath);
    }
  } catch (err) {
    console.error("[branding] No se pudo sincronizar logo a public/branding:", err);
  }
}

export function removeCaptivePortalLogos(): void {
  if (!fs.existsSync(CAPTIVE_PORTAL_LOGO_DIR)) return;
  for (const name of LOGO_BASENAMES) {
    const filePath = path.join(CAPTIVE_PORTAL_LOGO_DIR, name);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.error("[branding] No se pudo eliminar logo:", filePath, err);
    }
  }
}

export function ensureCaptivePortalLogoSynced(): void {
  for (const name of LOGO_BASENAMES) {
    const uploadPath = path.join(UPLOADS_DIR, name);
    if (fs.existsSync(uploadPath)) {
      syncCaptivePortalLogo(name);
      return;
    }
  }
}
