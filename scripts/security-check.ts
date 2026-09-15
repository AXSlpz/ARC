import "./env-loader.js";
import db from "../src/lib/db-connection.js";

const isProd = process.env.NODE_ENV === "production";
const errors: string[] = [];
const warnings: string[] = [];

function req(name: string, ok: boolean, msg: string): void {
  if (!ok) errors.push(`${name}: ${msg}`);
}

function warn(name: string, msg: string): void {
  warnings.push(`${name}: ${msg}`);
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
const wsSecret = process.env.WS_SECRET?.trim() ?? "";
const wsHost = process.env.WS_HOST?.trim() ?? "";

if (isProd) {
  req("NEXT_PUBLIC_APP_URL", appUrl.startsWith("https://"), "debe ser https://…");
  req("WS_SECRET", wsSecret.length >= 32, "mínimo 32 caracteres");
  req("WS_HOST", wsHost === "127.0.0.1" || wsHost === "localhost", "debe ser 127.0.0.1");
  req(
    "NEXT_PUBLIC_WS_SAME_ORIGIN",
    process.env.NEXT_PUBLIC_WS_SAME_ORIGIN === "true",
    "debe ser true detrás de nginx"
  );
} else {
  if (!wsSecret) warn("WS_SECRET", "no configurado (OK en local, obligatorio en prod)");
}

try {
  const cols = db.prepare("PRAGMA table_info(admin_users)").all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  req("schema.totp_secret", names.has("totp_secret"), "columna totp_secret ausente");
  req("schema.totp_enabled", names.has("totp_enabled"), "columna totp_enabled ausente");

  const admins = db
    .prepare("SELECT username, totp_enabled FROM admin_users WHERE role = 'admin'")
    .all() as { username: string; totp_enabled: number }[];
  if (admins.length === 0) {
    warn("admin", "no hay usuarios admin");
  } else {
    for (const a of admins) {
      if (!a.totp_enabled) {
        warn("2FA", `admin '${a.username}' aún sin TOTP (obligatorio al próximo login)`);
      }
    }
  }
} catch (e) {
  errors.push(`db: ${(e as Error).message}`);
}

console.log("=== security-check ===");
for (const w of warnings) console.warn("WARN", w);
for (const e of errors) console.error("FAIL", e);

if (errors.length > 0) {
  process.exit(1);
}
console.log("OK");
