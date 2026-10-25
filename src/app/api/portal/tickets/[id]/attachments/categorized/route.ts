/**
 * POST /api/portal/tickets/[id]/attachments/categorized
 *
 * Sube UN archivo con una categoría específica para el checklist del admin.
 * Diseñado para el wizard de modificaciones: se llama una vez por documento.
 *
 * Garantías:
 * - Ownership: el ticket debe pertenecer al usuario autenticado.
 * - Magic bytes + whitelist MIME (reutiliza storeAttachment).
 * - Categoría validada contra lista de valores permitidos.
 * - Idempotente: permite múltiples subidas de la misma categoría (reintentos).
 *   El admin verá todas las versiones y elegirá la válida.
 * - Responde con { attachment, expediente: { complete, missing, uploaded } }
 *   para que el wizard muestre el estado actualizado del expediente.
 */
import { NextRequest, NextResponse } from "next/server";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { getTicketById } from "@/lib/portal/tickets";
import { storeAttachment, listAttachments } from "@/lib/portal/attachments";
import {
  checkExpediente,
  ATTACHMENT_CATEGORIES,
  triggerSlaIfExpedienteComplete,
} from "@/lib/portal/modification-docs";
import { broadcastTicketEvent } from "@/lib/ws-notify";
import db from "@/lib/db-connection";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const { id } = await params;
  const ticketId = parseInt(id, 10);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    return NextResponse.json({ error: "ID de ticket inválido." }, { status: 400 });
  }

  // Ownership check: el ticket debe existir y pertenecer al usuario
  const ticket = getTicketById(ticketId);
  if (!ticket || ticket.portalUserId !== auth.id) {
    return NextResponse.json({ error: "Ticket no encontrado." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato inválido (multipart)." }, { status: 400 });
  }

  const file = form.get("file") as File | null;
  const categoryRaw = form.get("category") as string | null;
  const modSlug = (form.get("modSlug") as string | null) ?? "";

  // Validar archivo
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Archivo no proporcionado." }, { status: 400 });
  }

  // Validar categoría
  const category = categoryRaw ?? "otro";
  if (!ATTACHMENT_CATEGORIES.includes(category as typeof ATTACHMENT_CATEGORIES[number])) {
    return NextResponse.json(
      {
        error: `Categoría inválida. Valores permitidos: ${ATTACHMENT_CATEGORIES.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // Leer bytes y almacenar
  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await storeAttachment({
    ticketId,
    uploaderType: "client",
    originalName: file.name || "documento",
    declaredMime: file.type || "",
    bytes,
    attachmentCategory: category,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Calcular estado del expediente (si se conoce el slug de modificación)
  const expediente = modSlug
    ? checkExpediente(ticketId, modSlug)
    : { complete: false, missing: [], uploaded: [] };

  // Si el expediente está completo, intentar iniciar SLA (idempotente).
  // Solo aplica para tickets no retenidos (claim approved desde el inicio).
  if (modSlug && expediente.complete) {
    triggerSlaIfExpedienteComplete(ticketId, modSlug);
  }

  // Notificar tiempo real
  try {
    broadcastTicketEvent({
      ticketId,
      portalUserId: ticket.portalUserId,
      folio: ticket.folio,
      actor: "client",
      kind: "attachment",
    });
  } catch {
    // No bloquear si WS no está disponible
  }

  return NextResponse.json(
    {
      attachment: {
        id: result.attachment.id,
        originalName: result.attachment.originalName,
        category: result.attachment.attachmentCategory,
        sizeBytes: result.attachment.sizeBytes,
      },
      expediente,
    },
    { status: 201 }
  );
}
