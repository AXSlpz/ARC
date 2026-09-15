import { stripAccentsExceptN } from "./text-normalize";

export interface ContactDisplayInput {
  sender_name?: string | null;
  residente_nombre?: string | null;
  name?: string | null;
  phone: string;
}

function normalizeComparableName(value: string): string {
  return stripAccentsExceptN(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function namesAreEquivalent(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  if (!left?.trim() || !right?.trim()) return false;
  return normalizeComparableName(left) === normalizeComparableName(right);
}

export type ContactDisplayNameParts =
  | { kind: "representative"; senderName: string; ownerName: string }
  | { kind: "simple"; label: string };

export function getContactDisplayNameParts(
  input: ContactDisplayInput
): ContactDisplayNameParts {
  const ownerName = input.residente_nombre?.trim() || input.name?.trim() || null;
  const senderName = input.sender_name?.trim() || null;

  if (
    senderName &&
    ownerName &&
    !namesAreEquivalent(senderName, ownerName)
  ) {
    return { kind: "representative", senderName, ownerName };
  }

  return {
    kind: "simple",
    label: ownerName || senderName || input.phone,
  };
}

export function formatContactDisplayName(input: ContactDisplayInput): string {
  const parts = getContactDisplayNameParts(input);
  if (parts.kind === "representative") {
    return `${parts.senderName} en Repr. de ${parts.ownerName}`;
  }
  return parts.label;
}

export interface ContactPropertyDisplay {
  id: number;
  condominio: string;
  num_vivienda: number | null;
  num_coto?: string | null;
}

export function formatContactMetaLine(
  condominio: string | null | undefined,
  numVivienda: number | null | undefined
): string | null {
  const parts: string[] = [];

  if (condominio?.trim()) {
    parts.push(condominio.trim());
  }

  if (numVivienda != null) {
    parts.push(`Núm° Vivienda - ${numVivienda}`);
  }

  if (parts.length === 0) return null;
  return parts.join(" · ");
}

/** Una línea por vivienda: "Lisboa · Núm° Vivienda - 45". */
export function formatContactPropertyLine(
  property: ContactPropertyDisplay
): string {
  const condo = property.condominio.trim();
  if (property.num_vivienda != null) {
    return condo
      ? `${condo} · Núm° Vivienda - ${property.num_vivienda}`
      : `Núm° Vivienda - ${property.num_vivienda}`;
  }
  if (property.num_coto?.trim()) {
    return condo
      ? `${condo} · ${property.num_coto.trim()}`
      : property.num_coto.trim();
  }
  return condo;
}
