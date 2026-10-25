/**
 * OCR Parser para documentos de identidad (INE/IFE).
 *
 * Extrae:
 * - emision: año o fecha de emisión
 * - vigencia: año o fecha de vigencia/vencimiento
 * - expired: true si la vigencia es anterior al año actual
 *
 * Diseño conservador: si hay ambigüedad, retorna null y deja el doc en pending.
 * No sobreescribe datos existentes si el resultado es dudoso.
 */

export interface OcrParseResult {
  /** Año o fecha de emisión (string). Null si no se detecta. */
  emision: string | null;
  /** Año o fecha de vigencia (string). Null si no se detecta. */
  vigencia: string | null;
  /** True si la vigencia detectada es anterior al año actual. */
  expired: boolean;
  /** True si el resultado es lo suficientemente confiable para marcar como "done". */
  confident: boolean;
}

// Año actual para comparar vigencia
const CURRENT_YEAR = new Date().getFullYear();

// ── Patrones de extracción ─────────────────────────────────────────────────

/**
 * Patrones para detectar vigencia (vencimiento).
 * Ordenados de mayor a menor especificidad.
 */
const VIGENCIA_PATTERNS: RegExp[] = [
  // "Vigente hasta: 2027", "vigente: 2027", "Vigente 2027"
  /vigente\s+(?:hasta\s*[:.]?\s*)?(\d{4})/i,
  // "Válido hasta: 2027", "válido: 2027"
  /v[áa]lido\s+(?:hasta\s*[:.]?\s*)?(\d{4})/i,
  // "Vence: 2027", "Vencimiento: 2027"
  /vence\w*\s*[:.]?\s*(\d{4})/i,
  // "Expiración: 2027", "Expires: 2027"
  /expira\w*\s*[:.]?\s*(\d{4})/i,
  // "Expiry: 2027"
  /expiry\s*[:.]?\s*(\d{4})/i,
  // Formato fecha: "31/12/2027", "31-12-2027" → extraer el año
  /(?:vigente|v[áa]lido|vence|hasta)\s+\d{1,2}[/\-]\d{1,2}[/\-](\d{4})/i,
  // Año solitario al final de línea o junto a "INE/IFE" en contexto de vigencia
  // (heurística para el año impreso en la credencial)
  /\bINE\b.*?(\d{4})\b/i,
];

/**
 * Patrones para detectar emisión (fecha de expedición).
 * Más permisivos: admiten fecha completa dd/mm/yyyy o solo año.
 */
const EMISION_PATTERNS: RegExp[] = [
  // "Emitida: 15/03/2020", "Emitida el 2020", "Emitida 2020"
  /emiti(?:do|da)\s*(?:el\s*)?[:.]?\s*(?:\d{1,2}[/\-]\d{1,2}[/\-])?(\d{4})/i,
  // "Expedición: 2020", "Fecha de expedición: 15/03/2020"
  /expedici[oó]n\s*[:.]?\s*(?:\d{1,2}[/\-]\d{1,2}[/\-])?(\d{4})/i,
  // "Fecha de emisión: 2020"
  /(?:fecha\s+de\s+)?emisi[oó]n\s*[:.]?\s*(?:\d{1,2}[/\-]\d{1,2}[/\-])?(\d{4})/i,
  // "Issue date: 2020"
  /issue\s+date\s*[:.]?\s*(?:\d{1,2}[/\-]\d{1,2}[/\-])?(\d{4})/i,
];

/**
 * Patrón para detectar el año impreso en la credencial INE como el de vigencia.
 * El año de vigencia en el INE mexicano suele aparecer solo, con 4 dígitos,
 * entre 2024 y 2035.
 */
const STANDALONE_YEAR_PATTERN = /\b(20[2-3]\d)\b/g;

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Parsea texto OCR de un documento de identidad y extrae fechas.
 *
 * @param text - Texto OCR (puede contener errores de reconocimiento)
 * @returns OcrParseResult con los campos detectados
 */
export function parseOcrText(text: string): OcrParseResult {
  if (!text || typeof text !== "string") {
    return { emision: null, vigencia: null, expired: false, confident: false };
  }

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let vigencia: string | null = null;
  let emision: string | null = null;

  // 1. Intentar extraer vigencia con patrones específicos
  for (const pattern of VIGENCIA_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match?.[1]) {
      vigencia = match[1];
      break;
    }
  }

  // 2. Intentar extraer emisión con patrones específicos
  for (const pattern of EMISION_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match?.[1]) {
      emision = match[1];
      break;
    }
  }

  // 3. Heurística de fallback: si no encontramos vigencia con patrones específicos,
  //    buscar años solitarios en rango válido (2024-2035) que no sean el año de emisión
  if (!vigencia) {
    const yearsFound: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(STANDALONE_YEAR_PATTERN.source, "g");
    while ((m = re.exec(normalized)) !== null) {
      const yr = m[1];
      if (yr && !yearsFound.includes(yr)) {
        yearsFound.push(yr);
      }
    }

    // Filtrar años que podrían ser vigencia (futuros o actuales)
    const futureYears = yearsFound.filter(
      (y) => parseInt(y) >= CURRENT_YEAR
    );
    const pastYears = yearsFound.filter(
      (y) => parseInt(y) < CURRENT_YEAR && parseInt(y) >= 2010
    );

    if (futureYears.length === 1) {
      vigencia = futureYears[0]!;
    }
    if (!emision && pastYears.length === 1) {
      emision = pastYears[0]!;
    }
  }

  // 4. Determinar si la vigencia está expirada
  const vigenciaYear = vigencia ? parseInt(vigencia) : null;
  const expired = vigenciaYear !== null && vigenciaYear < CURRENT_YEAR;

  // 5. Determinar confianza: al menos vigencia detectada con un patrón específico
  const confident = vigencia !== null;

  return {
    emision,
    vigencia,
    expired,
    confident,
  };
}
