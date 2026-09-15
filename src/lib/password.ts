import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hashing de contraseñas compartido (scrypt v2), mismo esquema que el panel admin
 * pero independiente para que el portal de clientes no dependa de admin-settings.
 *
 * Formato: `v2:<saltHex>:<hashHex>`
 */
const SCRYPT_V2 = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, SCRYPT_V2).toString("hex");
  return `v2:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "v2") return false;
  const [, salt, hash] = parts;
  try {
    const candidate = scryptSync(password, salt!, 64, SCRYPT_V2).toString("hex");
    const a = Buffer.from(candidate, "hex");
    const b = Buffer.from(hash!, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
