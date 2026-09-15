import db from "./db-connection";
import type { Conversation } from "./db";
import {
  findResidentesByEmail,
  findResidentesByRegisteredPhone,
  getResidente,
  type Residente,
} from "./residentes";
import { normalizeEmailText, normalizeSpanishText, stripAccentsExceptN } from "./text-normalize";
import { phoneLookupCandidates } from "./phone-normalize";

export const IDENTITY_VALIDITY_SECONDS = 24 * 60 * 60;

export const IDENTITY_VERIFICATION_PROMPT =
  "Para brindarte una atención personalizada, necesito que me compartas los siguientes datos del propietario de la vivienda:\n\n1. Nombre completo (obligatorio)\n2. Número celular y/o correo electrónico registrado\n\nPor ejemplo:\nElizabeth Avalos\n8181818181\neli@gmail.com";

export const IDENTITY_MISSING_FIELDS_MESSAGE =
  "Para continuar con la verificación, necesitamos tu nombre completo (como en el contrato) y tu correo electrónico y/o número celular registrado.";

export const IDENTITY_MISSING_CONTACT_MESSAGE =
  "Gracias. Ahora comparte el correo electrónico o el número celular registrado del propietario. Con cualquiera de los dos es suficiente.";

export const IDENTITY_MISSING_NAME_MESSAGE =
  "Gracias. Ahora escribe el nombre completo del propietario tal como está registrado en el contrato.";

export const IDENTITY_FAILURE_MESSAGE =
  "No pudimos verificar tu identidad. Revisa que el nombre, correo y/o celular coincidan con los registrados. Si necesitas ayuda, contacta a administración.";

export const SENDER_NAME_PROMPT =
  "Identidad verificada. ¿Cuál es tu nombre y apellido?";

export const SENDER_NAME_INVALID_MESSAGE =
  "Por favor escribe tu nombre y apellido completos.";

export interface VerificationFields {
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** Persona verificada (puede faltar aún elegir propiedad multi-vivienda). */
export function isIdentityVerified(conversation: Conversation): boolean {
  const verifiedAt = conversation.identity_verified_at;
  if (!verifiedAt) return false;

  const now = Math.floor(Date.now() / 1000);
  return verifiedAt + IDENTITY_VALIDITY_SECONDS > now;
}

function residentPhoneMatchesLocal(
  localPhone: string,
  value: number | null
): boolean {
  if (value == null) return false;
  const stored = String(value).replace(/\D/g, "");
  return stored === localPhone || stored.slice(-10) === localPhone;
}

export function isRegisteredOwnerPhone(
  contactPhone: string | null | undefined,
  residente: Residente
): boolean {
  if (!contactPhone || residente.celular == null) return false;

  const localContact = phoneLookupCandidates(contactPhone).find(
    (candidate) => candidate.length === 10
  );
  if (!localContact) return false;

  return residentPhoneMatchesLocal(localContact, residente.celular);
}

export type KnownCallerRole = "owner" | "contact" | "ex_owner";

export interface KnownCallerMatch {
  residente: Residente;
  displayName: string | null;
  role: KnownCallerRole;
}

/** Identifica rol y nombre a saludar cuando el teléfono ya está en un residente. */
export function identifyCallerOnResidente(
  contactPhone: string,
  residente: Residente
): KnownCallerMatch | null {
  const localPhone = phoneLookupCandidates(contactPhone).find(
    (candidate) => candidate.length === 10
  );
  if (!localPhone) return null;

  if (residentPhoneMatchesLocal(localPhone, residente.celular)) {
    return {
      residente,
      displayName: residente.nombre?.trim() || null,
      role: "owner",
    };
  }

  const contactSlots: Array<{
    phone: number | null;
    name: string | null;
  }> = [
    {
      phone: residente.celular_contacto1,
      name: residente.nombre_contacto1,
    },
    {
      phone: residente.celular_contacto2,
      name: residente.nombre_contacto2,
    },
    {
      phone: residente.celular_contacto3,
      name: residente.nombre_contacto3,
    },
  ];

  for (const slot of contactSlots) {
    if (residentPhoneMatchesLocal(localPhone, slot.phone)) {
      return {
        residente,
        displayName: slot.name?.trim() || null,
        role: "contact",
      };
    }
  }

  if (residentPhoneMatchesLocal(localPhone, residente.celular_expropietario)) {
    return {
      residente,
      displayName: residente.nombre_expropietario?.trim() || null,
      role: "ex_owner",
    };
  }

  return null;
}

/**
 * Si el WhatsApp coincide con exactamente un residente (propietario, contacto o ex),
 * regresa el match para bienvenida personalizada. Si hay 0 o >1, null.
 */
export function resolveKnownCallerByPhone(
  contactPhone: string | null | undefined
): KnownCallerMatch | null {
  if (!contactPhone?.trim()) return null;

  const matches = findResidentesByRegisteredPhone(contactPhone);
  if (matches.length !== 1) return null;

  return identifyCallerOnResidente(contactPhone, matches[0]!);
}

export function namesAreEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  if (!left?.trim() || !right?.trim()) return false;
  return fuzzyNameMatches(left, right);
}

export function isFullyIdentified(
  conversation: Conversation,
  contactPhone?: string | null
): boolean {
  if (!isIdentityVerified(conversation)) return false;
  if (conversation.awaiting_sender_name) return false;

  const residenteId = conversation.residente_id;
  if (!residenteId) return false;

  const residente = getResidente(residenteId);
  if (!residente) return false;

  if (isRegisteredOwnerPhone(contactPhone ?? conversation.contact_phone, residente)) {
    return true;
  }

  return Boolean(conversation.sender_name?.trim());
}

export function setIdentityVerified(
  conversationId: number,
  residenteId: number,
  ownerName: string
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE conversations
     SET identity_verified_at = ?, residente_id = ?, name = ?, sender_name = NULL, awaiting_sender_name = 0, property_explicitly_chosen = 1
     WHERE id = ?`
  ).run(now, residenteId, ownerName, conversationId);
}

/** Identidad OK sin fijar aún la propiedad (multi-vivienda). */
export function setIdentityVerifiedPendingProperty(
  conversationId: number,
  ownerName: string
): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `UPDATE conversations
     SET identity_verified_at = ?, residente_id = NULL, name = ?, awaiting_sender_name = 0, property_explicitly_chosen = 0
     WHERE id = ?`
  ).run(now, ownerName, conversationId);
}

export function setAwaitingSenderName(conversationId: number): void {
  db.prepare(
    "UPDATE conversations SET awaiting_sender_name = 1 WHERE id = ?"
  ).run(conversationId);
}

export function setSenderName(conversationId: number, senderName: string): void {
  db.prepare(
    "UPDATE conversations SET sender_name = ?, awaiting_sender_name = 0 WHERE id = ?"
  ).run(senderName, conversationId);
}

export function parseSenderName(text: string): string | null {
  const emailMatch = text.match(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
  );
  let cleaned = text;
  if (emailMatch) {
    cleaned = cleaned.replace(emailMatch[0], " ");
  }
  cleaned = cleaned
    .replace(/(?:\+?\d[\d\s\-().]{8,}\d|\d{10,13})/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || cleaned.length < 5) return null;

  return normalizeSpanishText(cleaned);
}

export function extractFirstName(displayName: string | null | undefined): string | null {
  if (!displayName?.trim()) return null;
  return displayName.trim().split(/\s+/)[0] ?? null;
}

function normalizeNameTokens(value: string): string[] {
  return stripAccentsExceptN(value)
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) =>
    Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost
      );
    }
  }

  return matrix[b.length]![a.length]!;
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

export function fuzzyNameMatches(inputName: string, registeredName: string): boolean {
  const inputTokens = normalizeNameTokens(inputName);
  const registeredTokens = normalizeNameTokens(registeredName);
  if (inputTokens.length === 0 || registeredTokens.length === 0) return false;

  const significant = registeredTokens.filter((token) => token.length >= 2);
  if (significant.length === 0) return false;

  const matched = significant.filter((registeredToken) =>
    inputTokens.some((inputToken) => tokenSimilarity(inputToken, registeredToken) >= 0.82)
  );

  return matched.length === significant.length;
}

function residentOwnerNames(resident: Residente): string[] {
  return [resident.nombre, resident.nombre_expropietario].filter(
    (name): name is string => Boolean(name?.trim())
  );
}

function fuzzyNameMatchesResident(inputName: string, resident: Residente): boolean {
  return residentOwnerNames(resident).some((name) =>
    fuzzyNameMatches(inputName, name)
  );
}

function extractPhoneDigits(text: string): string | null {
  const matches = text.match(/(?:\+?\d[\d\s\-().]{8,}\d|\d{10,13})/g);
  if (!matches) return null;

  for (const match of matches) {
    const candidates = phoneLookupCandidates(match);
    const local = candidates.find((candidate) => candidate.length === 10);
    if (local) return local;
  }

  return null;
}

export function extractVerificationFields(text: string): VerificationFields {
  const emailMatch = text.match(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/
  );
  const email = emailMatch ? normalizeEmailText(emailMatch[0]) : null;
  const phone = extractPhoneDigits(text);

  let nameText = text;
  if (emailMatch) {
    nameText = nameText.replace(emailMatch[0], " ");
  }
  nameText = nameText
    .replace(/(?:\+?\d[\d\s\-().]{8,}\d|\d{10,13})/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const nameTokens = nameText.split(/\s+/).filter(Boolean);
  const name =
    nameTokens.length >= 2 && nameText.length >= 5 ? nameText : null;

  return { name, email, phone };
}

/** Combines fields extracted from each message (supports name in one msg, email/phone in another). */
export function mergeVerificationFields(texts: string[]): VerificationFields {
  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  for (const text of texts) {
    const part = extractVerificationFields(text);
    if (part.name) name = part.name;
    if (part.email) email = part.email;
    if (part.phone) phone = part.phone;
  }

  return { name, email, phone };
}

export function getMissingVerificationMessage(
  fields: VerificationFields
): string {
  if (fields.name && !fields.email && !fields.phone) {
    return IDENTITY_MISSING_CONTACT_MESSAGE;
  }
  if (!fields.name && (fields.email || fields.phone)) {
    return IDENTITY_MISSING_NAME_MESSAGE;
  }
  return IDENTITY_MISSING_FIELDS_MESSAGE;
}

export function hasCompleteVerificationFields(
  fields: VerificationFields
): boolean {
  return Boolean(fields.name && (fields.email || fields.phone));
}

export function matchResidenteIdentity(
  fields: VerificationFields
): Residente | null {
  const matches = matchResidentesIdentity(fields);
  return matches.length === 1 ? matches[0]! : null;
}

/** Todas las fichas que coinciden con nombre + email/celular (multi-propiedad). */
export function matchResidentesIdentity(
  fields: VerificationFields
): Residente[] {
  if (!hasCompleteVerificationFields(fields) || !fields.name) return [];

  const matchFromCandidates = (candidates: Residente[]): Residente[] =>
    candidates.filter((resident) =>
      fuzzyNameMatchesResident(fields.name!, resident)
    );

  if (fields.email) {
    const byEmail = matchFromCandidates(findResidentesByEmail(fields.email));
    if (byEmail.length > 0) return byEmail;
  }

  if (fields.phone) {
    const byPhone = matchFromCandidates(
      findResidentesByRegisteredPhone(fields.phone)
    );
    if (byPhone.length > 0) return byPhone;
  }

  return [];
}
