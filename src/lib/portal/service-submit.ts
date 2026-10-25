/**
 * Servicio: Creación atómica de ticket de Servicio ARC.
 *
 * Garantías:
 * - El precio SIEMPRE se re-lee del servidor (NUNCA se confía en el precio del cliente).
 * - Snapshot de precio persistido en ticket_values para auditoría.
 * - request_kind='service_arc' persistido en la fila de tickets.
 * - Claim pending/conflict → status='held'; approved o sin claim → 'nuevo'.
 * - Producto inactivo → rechazado antes de crear el ticket.
 * - NO usa SLA ni firma de consentimiento (flujo comercial distinto a modificaciones).
 */

import db from "../db-connection";
import { initPhase4Schema } from "./schema-phase4";
import { getServiceForPortal } from "./services-catalog";
import { getTicketById } from "./tickets";
import type { Ticket } from "./types";

initPhase4Schema();

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ServiceTicketInput {
  /** ID del ticket_type 'servicio-arc'. */
  ticketTypeId: number;
  /** ID del usuario del portal que solicita. */
  portalUserId: number;
  /** ID del producto CRM seleccionado. */
  productId: number;
  /** Cantidad (opcional, null si no aplica). */
  qty: number | null;
  /** Descripción de la necesidad del cliente. */
  descripcionNecesidad: string;
  /** Preferencia de contacto. */
  preferenciaContacto: string;
  /** Notas adicionales / descripción de adjuntos (opcional). */
  notasAdjuntos?: string | null;
  /**
   * ID de la lista de precios del portal.
   * El servidor lo usa para re-leer el precio real; NO se confía en el precio del cliente.
   */
  priceListId: number;
}

export interface PriceSnapshot {
  mode: "priced" | "custom_quote";
  productId: number;
  sku: string;
  name: string;
  currency: string;
  /** null cuando mode='custom_quote' */
  unitPrice: number | null;
}

export type ServiceSubmitResult =
  | { ok: true; ticket: Ticket; priceSnapshot: PriceSnapshot }
  | { ok: false; error: string };

// ── Helper folio ──────────────────────────────────────────────────────────────

function generateFolio(id: number): string {
  return `ARC-${String(id).padStart(5, "0")}`;
}

// ── Función principal ─────────────────────────────────────────────────────────

/**
 * Crea un ticket de Servicio ARC en una sola transacción SQLite.
 * Persiste el snapshot de precio para auditoría.
 */
export function createServiceTicket(
  input: ServiceTicketInput
): ServiceSubmitResult {
  // ── Validaciones de entrada ────────────────────────────────────────────────

  const descripcion = input.descripcionNecesidad?.trim();
  if (!descripcion) {
    return {
      ok: false,
      error: "La descripción de la necesidad es obligatoria.",
    };
  }

  const contacto = input.preferenciaContacto?.trim();
  if (!contacto) {
    return {
      ok: false,
      error: "La preferencia de contacto es obligatoria.",
    };
  }

  // ── Verificar tipo de ticket ───────────────────────────────────────────────
  const ticketType = db
    .prepare("SELECT id, active FROM ticket_types WHERE id = ?")
    .get(input.ticketTypeId) as { id: number; active: number } | undefined;

  if (!ticketType || !ticketType.active) {
    return { ok: false, error: "Tipo de solicitud no disponible." };
  }

  // ── Re-leer precio del servidor (NUNCA del cliente) ───────────────────────
  const service = getServiceForPortal(input.productId, input.priceListId);

  if (!service) {
    return {
      ok: false,
      error: "El servicio seleccionado no está disponible o no está activo.",
    };
  }

  // ── Determinar estado inicial según claim del usuario ──────────────────────
  const hasPendingClaim = db
    .prepare(
      `SELECT 1 FROM property_claims
       WHERE portal_user_id = ? AND status IN ('pending','conflict')
       LIMIT 1`
    )
    .get(input.portalUserId) as { 1: number } | undefined;

  const initialStatus = hasPendingClaim ? "held" : "nuevo";
  const historyNote = hasPendingClaim
    ? "Solicitud de servicio creada — retenida hasta verificación de cuenta"
    : "Solicitud de servicio creada";

  // ── Construir snapshot de precio ───────────────────────────────────────────
  const priceSnapshot: PriceSnapshot = {
    mode: service.priceMode,
    productId: service.productId,
    sku: service.sku,
    name: service.name,
    currency: service.currency,
    unitPrice: service.unitPrice,
  };

  // ── Transacción atómica ────────────────────────────────────────────────────
  let createdTicketId = 0;

  try {
    const tx = db.transaction(() => {
      // 1. Insertar ticket
      const ticketRes = db
        .prepare(
          `INSERT INTO tickets
             (folio, ticket_type_id, portal_user_id, status,
              request_kind, service_product_id)
           VALUES ('', ?, ?, ?, 'service_arc', ?)`
        )
        .run(
          input.ticketTypeId,
          input.portalUserId,
          initialStatus,
          service.productId
        );

      const tId = Number(ticketRes.lastInsertRowid);

      // 2. Actualizar folio con ID real
      db.prepare("UPDATE tickets SET folio = ? WHERE id = ?").run(
        generateFolio(tId),
        tId
      );

      // 3. Insertar ticket_values (campos del formulario + snapshot de precio)
      const insertVal = db.prepare(
        `INSERT INTO ticket_values (ticket_id, field_key, label, value)
         VALUES (?, ?, ?, ?)`
      );

      // Campos del formulario
      if (input.qty !== null && input.qty !== undefined) {
        insertVal.run(tId, "cantidad", "Cantidad", String(input.qty));
      }

      insertVal.run(
        tId,
        "descripcion_necesidad",
        "Descripción de la necesidad",
        descripcion
      );

      insertVal.run(
        tId,
        "preferencia_contacto",
        "Preferencia de contacto",
        contacto
      );

      if (input.notasAdjuntos?.trim()) {
        insertVal.run(
          tId,
          "notas_adjuntos",
          "Notas adicionales",
          input.notasAdjuntos.trim()
        );
      }

      // Snapshot de precio (auditoría — NUNCA del cliente)
      insertVal.run(
        tId,
        "price_product_id",
        "ID de producto",
        String(service.productId)
      );
      insertVal.run(tId, "price_sku", "SKU del producto", service.sku);
      insertVal.run(tId, "price_name", "Nombre del producto", service.name);
      insertVal.run(
        tId,
        "price_mode",
        "Modo de precio",
        service.priceMode
      );
      insertVal.run(
        tId,
        "price_amount",
        "Precio unitario",
        service.unitPrice !== null ? String(service.unitPrice) : null
      );
      insertVal.run(
        tId,
        "price_currency",
        "Moneda",
        service.currency
      );

      // 4. Historial de estado
      db.prepare(
        `INSERT INTO ticket_status_history
           (ticket_id, from_status, to_status, changed_by, note)
         VALUES (?, NULL, ?, 'cliente', ?)`
      ).run(tId, initialStatus, historyNote);

      createdTicketId = tId;
    });

    tx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Error al crear solicitud: ${msg}` };
  }

  // ── Recuperar ticket creado ────────────────────────────────────────────────
  const ticket = getTicketById(createdTicketId);
  if (!ticket) {
    return { ok: false, error: "Solicitud creada pero no recuperable." };
  }

  return { ok: true, ticket, priceSnapshot };
}
