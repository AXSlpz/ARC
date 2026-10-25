import { randomBytes } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import db from "../db-connection";
import { initPhase3Schema } from "./schema-phase3";
import { parseIneFields, type IneDraft, type IneFields } from "./ine-fields";
import { addIdentityDocument } from "./identity-documents";
import { IDENTITY_DIR, INE_PENDING_DIR, pathInsideIdentity, storeIneImage } from "./ine-files";

initPhase3Schema();

const TTL_SECONDS = 20 * 60;

export interface IneCapture {
  token: string;
  frontPath: string;
  backPath: string;
  fields: IneFields;
  purpose: "register" | "match" | "profile";
  portalUserId: number | null;
}

function purgeExpired(): void {
  const stale = db
    .prepare("SELECT front_path, back_path FROM ine_capture_tokens WHERE expires_at < unixepoch()")
    .all() as Array<{ front_path: string; back_path: string }>;
  db.prepare("DELETE FROM ine_capture_tokens WHERE expires_at < unixepoch()").run();
  for (const row of stale) {
    if (row.front_path) void rm(row.front_path, { force: true });
    if (row.back_path) void rm(row.back_path, { force: true });
  }
}

export async function saveIneCapture(input: {
  frontJpeg: Buffer;
  backJpeg: Buffer;
  fields: IneDraft | IneFields;
  purpose: "register" | "match" | "profile";
  portalUserId?: number | null;
}): Promise<string> {
  purgeExpired();
  const folder = path.join(INE_PENDING_DIR, randomBytes(8).toString("hex"));
  const frontPath = await storeIneImage(input.frontJpeg, folder);
  const backPath = await storeIneImage(input.backJpeg, folder);
  const token = randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO ine_capture_tokens
       (token, portal_user_id, purpose, front_path, back_path, ocr_metadata, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch() + ?)`
  ).run(
    token,
    input.portalUserId ?? null,
    input.purpose,
    frontPath,
    backPath,
    JSON.stringify(input.fields),
    TTL_SECONDS
  );
  return token;
}

type CaptureRow = {
  token: string;
  portal_user_id: number | null;
  purpose: "register" | "match" | "profile";
  front_path: string;
  back_path: string;
  ocr_metadata: string;
};

function loadCapture(
  token: string,
  purpose: "register" | "match" | "profile",
  portalUserId?: number
): IneCapture | null {
  purgeExpired();
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db
    .prepare(
      `SELECT token, portal_user_id, purpose, front_path, back_path, ocr_metadata
       FROM ine_capture_tokens WHERE token = ? AND purpose = ? AND expires_at >= unixepoch()`
    )
    .get(token, purpose) as CaptureRow | undefined;
  if (!row) return null;
  if (purpose !== "register" && row.portal_user_id !== portalUserId) return null;
  try {
    const parsed = parseIneFields(JSON.parse(row.ocr_metadata) as Record<string, unknown>);
    if (!parsed.fields || parsed.fields.expired) return null;
    const fields = parsed.fields;
    return {
      token: row.token,
      frontPath: row.front_path,
      backPath: row.back_path,
      fields,
      purpose: row.purpose,
      portalUserId: row.portal_user_id,
    };
  } catch {
    return null;
  }
}

export function updateIneCaptureFields(
  token: string,
  purpose: "register" | "match" | "profile",
  fields: IneFields,
  portalUserId?: number
): boolean {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const row = db
    .prepare(
      `SELECT portal_user_id FROM ine_capture_tokens
       WHERE token = ? AND purpose = ? AND expires_at >= unixepoch()`
    )
    .get(token, purpose) as { portal_user_id: number | null } | undefined;
  if (!row) return false;
  if (purpose !== "register" && row.portal_user_id !== portalUserId) return false;
  db.prepare("UPDATE ine_capture_tokens SET ocr_metadata = ? WHERE token = ?").run(
    JSON.stringify(fields),
    token
  );
  return true;
}

export function peekIneCapture(
  token: string,
  purpose: "register" | "match" | "profile",
  portalUserId?: number
): IneCapture | null {
  return loadCapture(token, purpose, portalUserId);
}

export async function commitRegisterIne(
  token: string,
  portalUserId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const capture = peekIneCapture(token, "register");
  if (!capture || capture.fields.expired) {
    return {
      ok: false,
      error: "La lectura de la INE expiró. Vuelve a tomar las fotos.",
    };
  }
  const folder = path.join(IDENTITY_DIR, `u${portalUserId}`);
  await mkdir(folder, { recursive: true });
  const frontDest = path.join(folder, path.basename(capture.frontPath));
  const backDest = path.join(folder, path.basename(capture.backPath));
  if (
    !pathInsideIdentity(capture.frontPath) ||
    !pathInsideIdentity(capture.backPath) ||
    !pathInsideIdentity(frontDest) ||
    !pathInsideIdentity(backDest)
  ) {
    return { ok: false, error: "No se pudo guardar la credencial." };
  }
  await rename(capture.frontPath, frontDest);
  await rename(capture.backPath, backDest);
  const saved = addIdentityDocument({
    portalUserId,
    kind: "ine",
    storedPath: frontDest,
    backStoredPath: backDest,
    ocrMetadata: { ...capture.fields },
    ocrStatus: "done",
  });
  takeIneCapture(token, "register");
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}

export async function commitProfileIne(
  token: string,
  portalUserId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const capture = peekIneCapture(token, "profile", portalUserId);
  if (!capture) {
    return { ok: false, error: "La lectura de la INE expiró. Vuelve a tomar las fotos." };
  }
  const folder = path.join(IDENTITY_DIR, `u${portalUserId}`);
  await mkdir(folder, { recursive: true });
  const frontDest = path.join(folder, path.basename(capture.frontPath));
  const backDest = path.join(folder, path.basename(capture.backPath));
  if (
    !pathInsideIdentity(capture.frontPath) ||
    !pathInsideIdentity(capture.backPath) ||
    !pathInsideIdentity(frontDest) ||
    !pathInsideIdentity(backDest)
  ) {
    return { ok: false, error: "No se pudo guardar la credencial." };
  }
  await rename(capture.frontPath, frontDest);
  await rename(capture.backPath, backDest);
  const saved = addIdentityDocument({
    portalUserId,
    kind: "ine",
    storedPath: frontDest,
    backStoredPath: backDest,
    ocrMetadata: { ...capture.fields },
    ocrStatus: "done",
  });
  takeIneCapture(token, "profile", portalUserId);
  return saved.ok ? { ok: true } : { ok: false, error: saved.error };
}

/** Token de una captura escrita a mano. No guarda fotos nuevas. */
export function saveManualMatchToken(portalUserId: number, fields: IneFields): string {
  purgeExpired();
  const token = randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO ine_capture_tokens
       (token, portal_user_id, purpose, front_path, back_path, ocr_metadata, expires_at)
     VALUES (?, ?, 'match', '', '', ?, unixepoch() + ?)`
  ).run(token, portalUserId, JSON.stringify(fields), TTL_SECONDS);
  return token;
}

export function takeIneCapture(
  token: string,
  purpose: "register" | "match" | "profile",
  portalUserId?: number
): IneCapture | null {
  const capture = loadCapture(token, purpose, portalUserId);
  if (!capture) return null;
  db.prepare("DELETE FROM ine_capture_tokens WHERE token = ?").run(token);
  return capture;
}
