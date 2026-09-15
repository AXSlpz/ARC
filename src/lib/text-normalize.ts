const ACCENT_FROM = "áàäâãåéèëêíìïîóòöôõúùüûýÿÁÀÄÂÃÅÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÝ";
const ACCENT_TO = "aaaaaaeeeeiiiiooooouuuuyAAAAAAEEEEIIIIOOOOOUUUUY";

/** Quita acentos/diacríticos; conserva ñ y Ñ. */
export function stripAccentsExceptN(text: string): string {
  let out = "";
  for (const ch of text) {
    const idx = ACCENT_FROM.indexOf(ch);
    out += idx >= 0 ? ACCENT_TO[idx] : ch;
  }
  return out;
}

/**
 * Normaliza texto en español: sin acentos (excepto ñ), cada palabra con inicial mayúscula.
 * Ej: "ALEJANDRO LÓPEZ ÁVALOS" → "Alejandro Lopez Avalos"
 */
export function normalizeSpanishText(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const stripped = stripAccentsExceptN(trimmed);
  return stripped
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Email: minúsculas y sin acentos; no aplica title case. */
export function normalizeEmailText(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return stripAccentsExceptN(trimmed).toLowerCase();
}

export interface ResidenteTextFields {
  nombre?: string;
  email?: string | null;
  nombre_contacto1?: string | null;
  parentesco_contacto1?: string | null;
  nombre_contacto2?: string | null;
  parentesco_contacto2?: string | null;
  nombre_contacto3?: string | null;
  parentesco_contacto3?: string | null;
  mes_pago?: string | null;
  nombre_expropietario?: string | null;
  tag1_modelo?: string | null;
  tag2_modelo?: string | null;
}

export function normalizeResidenteTextFields<T extends ResidenteTextFields>(
  input: T
): T {
  const next = { ...input };

  if (next.nombre !== undefined) {
    next.nombre = normalizeSpanishText(next.nombre) ?? "";
  }
  if (next.email !== undefined) {
    next.email = normalizeEmailText(next.email);
  }
  if (next.nombre_contacto1 !== undefined) {
    next.nombre_contacto1 = normalizeSpanishText(next.nombre_contacto1);
  }
  if (next.parentesco_contacto1 !== undefined) {
    next.parentesco_contacto1 = normalizeSpanishText(next.parentesco_contacto1);
  }
  if (next.nombre_contacto2 !== undefined) {
    next.nombre_contacto2 = normalizeSpanishText(next.nombre_contacto2);
  }
  if (next.parentesco_contacto2 !== undefined) {
    next.parentesco_contacto2 = normalizeSpanishText(next.parentesco_contacto2);
  }
  if (next.nombre_contacto3 !== undefined) {
    next.nombre_contacto3 = normalizeSpanishText(next.nombre_contacto3);
  }
  if (next.parentesco_contacto3 !== undefined) {
    next.parentesco_contacto3 = normalizeSpanishText(next.parentesco_contacto3);
  }
  if (next.mes_pago !== undefined) {
    next.mes_pago = normalizeSpanishText(next.mes_pago);
  }
  if (next.nombre_expropietario !== undefined) {
    next.nombre_expropietario = normalizeSpanishText(next.nombre_expropietario);
  }
  if (next.tag1_modelo !== undefined) {
    next.tag1_modelo = normalizeSpanishText(next.tag1_modelo);
  }
  if (next.tag2_modelo !== undefined) {
    next.tag2_modelo = normalizeSpanishText(next.tag2_modelo);
  }

  return next;
}
