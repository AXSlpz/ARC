import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import db from "./db";
import { setAdminOwnPassword, verifyAdminPassword } from "./admin-settings";

const SIGNATURE_DIR = path.join(process.cwd(), "data", "admin-signatures");
const MAX_SIGNATURE_BYTES = 1_500_000;

export interface AdminProfile {
  id: number;
  username: string;
  displayName: string;
  email: string;
  jobTitle: string;
  hasSignature: boolean;
}

export interface LetterSigner {
  name: string;
  jobTitle: string;
  signatureDataUrl: string | null;
}

interface ProfileRow {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  job_title: string | null;
  signature_filename: string | null;
}

function mapProfile(row: ProfileRow): AdminProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name?.trim() || row.username,
    email: row.email?.trim() || "",
    jobTitle: row.job_title?.trim() || "",
    hasSignature: Boolean(row.signature_filename),
  };
}

export function getAdminProfile(userId: number): AdminProfile | null {
  const row = db
    .prepare(
      `SELECT id, username, display_name, email, job_title, signature_filename
       FROM admin_users WHERE id = ?`
    )
    .get(userId) as ProfileRow | undefined;
  return row ? mapProfile(row) : null;
}

function assertEmailFree(email: string, userId: number): void {
  const taken = db
    .prepare(
      `SELECT id FROM admin_users
       WHERE email IS NOT NULL AND lower(email) = ? AND id != ?`
    )
    .get(email.toLowerCase(), userId) as { id: number } | undefined;
  if (taken) throw new Error("Ese correo ya está en otra cuenta.");
}

export function updateAdminProfile(
  userId: number,
  input: {
    displayName: string;
    email: string;
    jobTitle: string;
    currentPassword?: string;
    newPassword?: string;
  }
): AdminProfile {
  const profile = getAdminProfile(userId);
  if (!profile) throw new Error("Usuario no encontrado");

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const jobTitle = input.jobTitle.trim();
  if (displayName.length < 2 || displayName.length > 80) {
    throw new Error("El nombre debe tener entre 2 y 80 caracteres.");
  }
  if (jobTitle.length > 80) {
    throw new Error("El puesto no puede pasar de 80 caracteres.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("El correo no es válido.");
  }
  if (email.length > 120) {
    throw new Error("El correo es demasiado largo.");
  }
  if (email) assertEmailFree(email, userId);

  const newPassword = input.newPassword?.trim() ?? "";
  if (newPassword) {
    const current = input.currentPassword ?? "";
    if (!verifyAdminPassword(profile.username, current)) {
      throw new Error("La contraseña actual no coincide.");
    }
    setAdminOwnPassword(userId, newPassword);
  }

  db.prepare(
    `UPDATE admin_users
     SET display_name = ?, email = ?, job_title = ?
     WHERE id = ?`
  ).run(displayName, email || null, jobTitle || null, userId);

  const updated = getAdminProfile(userId);
  if (!updated) throw new Error("Usuario no encontrado");
  return updated;
}

function imageKind(bytes: Buffer): { ext: ".png" | ".jpg" | ".webp"; mime: string } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: ".png", mime: "image/png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: ".jpg", mime: "image/jpeg" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { ext: ".webp", mime: "image/webp" };
  }
  return null;
}

function signaturePath(filename: string): string | null {
  if (!/^\d+\.(png|jpg|webp)$/.test(filename)) return null;
  const full = path.join(SIGNATURE_DIR, filename);
  if (!full.startsWith(SIGNATURE_DIR + path.sep)) return null;
  return full;
}

export function saveAdminSignature(userId: number, bytes: Buffer): void {
  if (!getAdminProfile(userId)) throw new Error("Usuario no encontrado");
  if (bytes.length < 32 || bytes.length > MAX_SIGNATURE_BYTES) {
    throw new Error("La firma debe ser una imagen de menos de 1.5 MB.");
  }
  const kind = imageKind(bytes);
  if (!kind) throw new Error("Usa una foto PNG, JPG o WEBP.");

  mkdirSync(SIGNATURE_DIR, { recursive: true });
  for (const ext of [".png", ".jpg", ".webp"] as const) {
    const previous = signaturePath(`${userId}${ext}`);
    if (!previous) continue;
    try {
      unlinkSync(previous);
    } catch {
      /* el archivo anterior puede no existir */
    }
  }
  const filename = `${userId}${kind.ext}`;
  const full = signaturePath(filename);
  if (!full) throw new Error("No se pudo guardar la firma.");
  writeFileSync(full, bytes);
  db.prepare("UPDATE admin_users SET signature_filename = ? WHERE id = ?").run(
    filename,
    userId
  );
}

export function clearAdminSignature(userId: number): void {
  const row = db
    .prepare("SELECT signature_filename FROM admin_users WHERE id = ?")
    .get(userId) as { signature_filename: string | null } | undefined;
  if (!row) throw new Error("Usuario no encontrado");
  if (row.signature_filename) {
    const full = signaturePath(row.signature_filename);
    if (full) {
      try {
        unlinkSync(full);
      } catch {
        /* ya no está en disco */
      }
    }
  }
  db.prepare("UPDATE admin_users SET signature_filename = NULL WHERE id = ?").run(userId);
}

export function readAdminSignature(
  userId: number
): { bytes: Buffer; mime: string } | null {
  const row = db
    .prepare("SELECT signature_filename FROM admin_users WHERE id = ?")
    .get(userId) as { signature_filename: string | null } | undefined;
  const filename = row?.signature_filename;
  if (!filename) return null;
  const full = signaturePath(filename);
  if (!full) return null;
  try {
    const bytes = readFileSync(full);
    const kind = imageKind(bytes);
    if (!kind) return null;
    return { bytes, mime: kind.mime };
  } catch {
    return null;
  }
}

export function loadLetterSigner(userId: number): LetterSigner | null {
  const profile = getAdminProfile(userId);
  if (!profile) return null;
  const file = readAdminSignature(userId);
  return {
    name: profile.displayName,
    jobTitle: profile.jobTitle,
    signatureDataUrl: file
      ? `data:${file.mime};base64,${file.bytes.toString("base64")}`
      : null,
  };
}
