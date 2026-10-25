/**
 * Servicio: Requerimientos de documentos y estado del expediente.
 *
 * Define qué categorías de adjuntos son obligatorias por slug de modificación
 * y verifica si el expediente de un ticket está completo.
 *
 * Garantía: carta_no_adeudo es obligatoria en TODOS los tipos.
 */
import db from "../db-connection";
import { startSla } from "./sla";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export const ATTACHMENT_CATEGORIES = [
  "carta_no_adeudo",
  "ficha_tecnica",
  "croquis",
  "fotos",
  "otro",
] as const;

export type AttachmentCategory = (typeof ATTACHMENT_CATEGORIES)[number];

export interface DocCategoryRequirement {
  category: AttachmentCategory;
  label: string;
  required: boolean;
  /** true si permite múltiples archivos */
  multiple?: boolean;
}

// ── Requerimientos por slug ───────────────────────────────────────────────────

/** Carta de no adeudo: siempre requerida */
const CARTA_NO_ADEUDO: DocCategoryRequirement = {
  category: "carta_no_adeudo",
  label: "Carta de no adeudo",
  required: true,
};

/** Ficha técnica: requerida para equipos e instalaciones */
const FICHA_TECNICA: DocCategoryRequirement = {
  category: "ficha_tecnica",
  label: "Ficha técnica del material/equipo",
  required: true,
};

/** Croquis (requerido) */
const CROQUIS_REQ: DocCategoryRequirement = {
  category: "croquis",
  label: "Croquis o plano con medidas",
  required: true,
};

/** Croquis (opcional) */
const CROQUIS_OPT: DocCategoryRequirement = {
  category: "croquis",
  label: "Croquis o plano (recomendado)",
  required: false,
};

/** Fotos: requeridas en casi todos */
const FOTOS: DocCategoryRequirement = {
  category: "fotos",
  label: "Fotografías del área",
  required: true,
  multiple: true,
};

/**
 * Catálogo de requerimientos de documentos por slug.
 * Carta de no adeudo siempre presente como primer elemento.
 */
const REQUIREMENTS: Record<string, DocCategoryRequirement[]> = {
  "tanque-gas": [CARTA_NO_ADEUDO, FICHA_TECNICA, FOTOS],
  "toma-gas": [CARTA_NO_ADEUDO, FOTOS],
  "calentador-solar": [CARTA_NO_ADEUDO, FICHA_TECNICA, FOTOS],
  "escalera-azotea": [CARTA_NO_ADEUDO, CROQUIS_REQ, FOTOS],
  "muro-colindante": [CARTA_NO_ADEUDO, CROQUIS_REQ, FOTOS],
  "techumbre-lavado": [CARTA_NO_ADEUDO, CROQUIS_OPT, FOTOS],
  "techumbre-posterior": [CARTA_NO_ADEUDO, CROQUIS_REQ, FOTOS],
  "cuarto-lavado": [CARTA_NO_ADEUDO, CROQUIS_REQ, FOTOS],
  "reja-lateral": [CARTA_NO_ADEUDO, FOTOS],
  "reja-pasillo": [CARTA_NO_ADEUDO, FOTOS],
  "herreria-posterior": [CARTA_NO_ADEUDO, FOTOS],
  "mosquiteros": [CARTA_NO_ADEUDO],
  "area-verde-delantera": [CARTA_NO_ADEUDO, FOTOS],
  "piso-firme-posterior": [CARTA_NO_ADEUDO, FICHA_TECNICA, FOTOS],
  "volado-acceso": [CARTA_NO_ADEUDO, CROQUIS_REQ, FOTOS],
  "pintura-retoque": [CARTA_NO_ADEUDO, FOTOS],
  "instalaciones-especiales": [CARTA_NO_ADEUDO, CROQUIS_OPT, FOTOS],
  "pergola": [CARTA_NO_ADEUDO, CROQUIS_REQ, FOTOS],
  "repellado-interior": [CARTA_NO_ADEUDO, FOTOS],
};

/** Requerimientos genéricos para slugs no definidos explícitamente */
const GENERIC_REQUIREMENTS: DocCategoryRequirement[] = [CARTA_NO_ADEUDO, FOTOS];

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Retorna los requerimientos de categorías de documento para un slug.
 * Siempre incluye carta_no_adeudo como primer elemento.
 */
export function getRequiredDocCategories(slug: string): DocCategoryRequirement[] {
  return REQUIREMENTS[slug] ?? GENERIC_REQUIREMENTS;
}

export interface ExpedienteStatus {
  complete: boolean;
  /** Categorías requeridas que aún no tienen adjunto */
  missing: AttachmentCategory[];
  /** Categorías que sí tienen adjunto */
  uploaded: AttachmentCategory[];
}

/**
 * Verifica si el expediente de un ticket está completo para el slug dado.
 * Compara los adjuntos subidos (por categoría) contra los requeridos.
 */
export function checkExpediente(ticketId: number, slug: string): ExpedienteStatus {
  // Obtener categorías subidas para este ticket
  let uploadedCategories: string[] = [];
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT attachment_category
         FROM ticket_attachments
         WHERE ticket_id = ? AND attachment_category IS NOT NULL`
      )
      .all(ticketId) as Array<{ attachment_category: string }>;
    uploadedCategories = rows.map((r) => r.attachment_category);
  } catch {
    // Si la columna no existe aún, considerar todo como faltante
    uploadedCategories = [];
  }

  const requirements = getRequiredDocCategories(slug);
  const missing: AttachmentCategory[] = [];
  const uploaded: AttachmentCategory[] = [];

  for (const req of requirements) {
    if (!req.required) continue;
    if (uploadedCategories.includes(req.category)) {
      uploaded.push(req.category);
    } else {
      missing.push(req.category);
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    uploaded,
  };
}

// ── SLA trigger al completar expediente ──────────────────────────────────────

/**
 * Inicia el SLA si el expediente de la modificación está completo
 * Y el ticket NO está en estado 'held' (claim pendiente/en conflicto).
 *
 * Se llama desde el endpoint de subida de documentos después de cada upload.
 * Es idempotente: startSla no reinicia un SLA ya activo.
 *
 * Lógica de negocio:
 * - Claim pending/conflict → ticket=held → SLA NO arranca (espera aprobación admin)
 * - Claim approved → ticket=nuevo → SLA arranca cuando expediente está completo
 * - Si expediente incompleto → no arranca aunque el ticket sea nuevo
 *
 * @param ticketId ID del ticket
 * @param modSlug Slug de la modificación (para saber qué docs son requeridos)
 * @param slaBusinessDays Días hábiles para el SLA (default: 5)
 */
export function triggerSlaIfExpedienteComplete(
  ticketId: number,
  modSlug: string,
  slaBusinessDays = 5
): void {
  try {
    // Verificar que el ticket existe y no está held
    const ticketRow = db
      .prepare("SELECT status FROM tickets WHERE id = ?")
      .get(ticketId) as { status: string } | undefined;

    if (!ticketRow) return;
    // Solo arrancar SLA para tickets activos (no retenidos)
    if (ticketRow.status === "held" || ticketRow.status === "cancelado" || ticketRow.status === "rechazado") {
      return;
    }

    const expediente = checkExpediente(ticketId, modSlug);
    if (!expediente.complete) return;

    // startSla es idempotente: si ya hay target, no reinicia.
    startSla(ticketId, slaBusinessDays, { createdBy: "sistema" });
  } catch {
    // No bloquear el flujo principal si el SLA falla (best-effort)
  }
}
