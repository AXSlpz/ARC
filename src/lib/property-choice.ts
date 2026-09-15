import type { Residente } from "./residentes";
import {
  findResidentesByEmail,
  findResidentesByRegisteredPhone,
  getResidente,
} from "./residentes";
import {
  identifyCallerOnResidente,
  type KnownCallerMatch,
} from "./resident-identity";
import { normalizeSpanishText, stripAccentsExceptN } from "./text-normalize";
import db from "./db-connection";

function isUsableProperty(r: Residente): boolean {
  if (!r.active) return false;
  if (r.ocupacion === "Vacante") return false;
  if (r.nombre === "Vacante") return false;
  return true;
}

function propertyKey(r: Residente): string {
  return `${r.condominio_id}:${r.num_vivienda ?? ""}:${r.num_coto ?? ""}:${r.id}`;
}

/** Otras propiedades de la misma persona (email y/o celular propietario). */
export function findSiblingProperties(residente: Residente): Residente[] {
  const byId = new Map<number, Residente>();
  if (isUsableProperty(residente)) {
    byId.set(residente.id, residente);
  }

  const email = residente.email?.trim();
  if (email) {
    for (const row of findResidentesByEmail(email)) {
      if (isUsableProperty(row)) byId.set(row.id, row);
    }
  }

  if (residente.celular != null) {
    const phone = String(residente.celular);
    for (const row of findResidentesByRegisteredPhone(phone)) {
      if (!isUsableProperty(row)) continue;
      // Solo hermanar por celular de propietario, no por contacto suelto en otra ficha.
      if (row.celular != null && String(row.celular).replace(/\D/g, "").slice(-10) ===
          phone.replace(/\D/g, "").slice(-10)) {
        byId.set(row.id, row);
      }
    }
  }

  return [...byId.values()].sort((a, b) => {
    const condo = a.condominio_name.localeCompare(b.condominio_name, "es");
    if (condo !== 0) return condo;
    return (a.num_vivienda ?? 0) - (b.num_vivienda ?? 0);
  });
}

export function listPropertiesForCallerPhone(
  contactPhone: string | null | undefined
): Residente[] {
  if (!contactPhone?.trim()) return [];

  const direct = findResidentesByRegisteredPhone(contactPhone).filter(
    isUsableProperty
  );
  const byId = new Map<number, Residente>();
  for (const row of direct) {
    for (const sibling of findSiblingProperties(row)) {
      byId.set(sibling.id, sibling);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const condo = a.condominio_name.localeCompare(b.condominio_name, "es");
    if (condo !== 0) return condo;
    return (a.num_vivienda ?? 0) - (b.num_vivienda ?? 0);
  });
}

export function resolveKnownCallerMatches(
  contactPhone: string | null | undefined
): KnownCallerMatch[] {
  if (!contactPhone?.trim()) return [];
  const matches = findResidentesByRegisteredPhone(contactPhone).filter(
    isUsableProperty
  );
  const out: KnownCallerMatch[] = [];
  for (const residente of matches) {
    const identified = identifyCallerOnResidente(contactPhone, residente);
    if (identified) out.push(identified);
  }
  return out;
}

export function formatPropertyLabel(r: Residente): string {
  const vivienda =
    r.num_coto?.trim() ||
    (r.num_vivienda != null ? `#${r.num_vivienda}` : "sin número");
  return `${r.condominio_name} · vivienda ${vivienda}`;
}

export function buildPropertyChoicePrompt(properties: Residente[]): string {
  const lines = properties.map(
    (r, i) => `${i + 1}) ${formatPropertyLabel(r)}`
  );
  return (
    "Veo que estás asociado a más de una propiedad. " +
    "¿Sobre cuál colonia o vivienda es tu pregunta?\n\n" +
    `${lines.join("\n")}\n\n` +
    "Responde con el número de la opción (por ejemplo: 1)."
  );
}

export function parsePropertyChoice(
  text: string,
  properties: Residente[]
): Residente | null {
  if (properties.length === 0) return null;
  const raw = text.trim();
  if (!raw) return null;

  const numMatch = raw.match(/^\s*([1-9]\d*)\s*[.)]?\s*$/);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    if (idx >= 0 && idx < properties.length) return properties[idx]!;
  }

  const normalized = normalizeSpanishText(raw) ?? raw.toLowerCase();
  const scored = properties
    .map((r) => {
      const label = normalizeSpanishText(formatPropertyLabel(r)) ?? "";
      const condo = normalizeSpanishText(r.condominio_name) ?? "";
      const coto = normalizeSpanishText(r.num_coto ?? "") ?? "";
      const viv =
        r.num_vivienda != null ? String(r.num_vivienda) : "";
      let score = 0;
      if (condo && normalized.includes(condo)) score += 3;
      if (coto && normalized.includes(coto)) score += 3;
      if (viv && normalized.includes(viv)) score += 2;
      if (label && normalized.includes(label)) score += 4;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) return scored[0]!.r;
  if (scored.length > 1 && scored[0]!.score > scored[1]!.score) {
    return scored[0]!.r;
  }
  return null;
}

function foldForMention(text: string): string {
  return stripAccentsExceptN(text).toLowerCase();
}

/**
 * Detecta si el residente ya nombró una colonia/vivienda dentro de una pregunta.
 * No usa dígitos sueltos (evita "tengo 1 tag" → Lima #1).
 */
export function parsePropertyMentionInQuestion(
  text: string,
  properties: Residente[]
): Residente | null {
  if (properties.length === 0) return null;
  const folded = foldForMention(text.trim());
  if (!folded) return null;

  const scored = properties
    .map((r) => {
      const condo = foldForMention(r.condominio_name);
      const coto = foldForMention(r.num_coto ?? "");
      let score = 0;
      if (condo.length >= 3 && folded.includes(condo)) score += 3;
      if (coto.length >= 3 && folded.includes(coto)) score += 3;
      const viv = r.num_vivienda != null ? String(r.num_vivienda) : "";
      if (
        viv &&
        new RegExp(
          `(?:vivienda|casa|numero|num\\.?|n[uú]m(?:ero)?|lote)\\s*${viv}\\b`
        ).test(folded)
      ) {
        score += 2;
      }
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) return scored[0]!.r;
  if (scored.length > 1 && scored[0]!.score > scored[1]!.score) {
    return scored[0]!.r;
  }
  return null;
}

export function setAwaitingPropertyChoice(
  conversationId: number,
  propertyIds: number[]
): void {
  db.prepare(
    `UPDATE conversations
     SET awaiting_property_choice = 1,
         property_choice_ids = ?,
         residente_id = NULL,
         property_explicitly_chosen = 0
     WHERE id = ?`
  ).run(JSON.stringify(propertyIds), conversationId);
}

export function clearAwaitingPropertyChoice(conversationId: number): void {
  db.prepare(
    `UPDATE conversations
     SET awaiting_property_choice = 0,
         property_choice_ids = NULL
     WHERE id = ?`
  ).run(conversationId);
}

export function getAwaitingPropertyChoices(
  conversationId: number
): Residente[] {
  const row = db
    .prepare(
      "SELECT awaiting_property_choice, property_choice_ids FROM conversations WHERE id = ?"
    )
    .get(conversationId) as
    | { awaiting_property_choice: number; property_choice_ids: string | null }
    | undefined;

  if (!row?.awaiting_property_choice || !row.property_choice_ids) return [];

  try {
    const ids = JSON.parse(row.property_choice_ids) as unknown;
    if (!Array.isArray(ids)) return [];
    return ids
      .map((id) => getResidente(Number(id)))
      .filter((r): r is Residente => Boolean(r && isUsableProperty(r)));
  } catch {
    return [];
  }
}

export function selectConversationProperty(
  conversationId: number,
  residente: Residente
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE conversations
     SET residente_id = ?,
         identity_verified_at = COALESCE(identity_verified_at, ?),
         name = COALESCE(NULLIF(name, ''), ?),
         awaiting_property_choice = 0,
         property_choice_ids = NULL,
         property_explicitly_chosen = 1
     WHERE id = ?`
  ).run(residente.id, now, residente.nombre, conversationId);
}

/** @deprecated keep export for debug */
export function debugPropertyKey(r: Residente): string {
  return propertyKey(r);
}
