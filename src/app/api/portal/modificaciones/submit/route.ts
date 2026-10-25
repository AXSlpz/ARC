/**
 * POST /api/portal/modificaciones/submit
 *
 * Envía una solicitud de modificación.
 * Reglas:
 * - Solo UNA modificación por solicitud.
 * - Si el usuario tiene claim pending/conflict → ticket queda en "held".
 * - Si el usuario tiene claim approved → ticket en "nuevo" (inicia SLA).
 * - Transaccional: crea ticket + valores + firma en una sola operación.
 * - Elimina el draft (si se proporciona draftId) tras submit exitoso.
 */
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { isPortalAuthError, requirePortalUser } from "@/lib/portal/auth";
import { ensureModificationTicketType } from "@/lib/portal/ticket-types";
import { getCatalogItem } from "@/lib/portal/modification-catalog";
import { validateFormData } from "@/lib/portal/modification-form-schema";
import { createModificationTicket } from "@/lib/portal/modification-submit";
import { deleteDraft } from "@/lib/portal/modification-drafts";
import { checkExpediente } from "@/lib/portal/modification-docs";
import { listClaimsForUser } from "@/lib/portal/property-claims";
import { getDevelopment } from "@/lib/portal/developments";
import { getTrustedIp, extractIpHeaders } from "@/lib/portal/ip-helper";
import { notifyTicketCreated } from "@/lib/notify/ticket-events";
import { publishAdminNotification } from "@/lib/admin-notifications";
import { broadcastTicketEvent } from "@/lib/ws-notify";
import { peekIneCapture, takeIneCapture } from "@/lib/portal/ine-captures";
import { readStoredIneFields, sameCredential } from "@/lib/portal/ine-fields";
import { getCurrentIdentityDocument } from "@/lib/portal/identity-documents";
import { pathInsideIdentity } from "@/lib/portal/ine-files";
import { rm } from "node:fs/promises";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requirePortalUser();
  if (isPortalAuthError(auth)) return auth;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const {
    modificationCatalogId,
    formData,
    draftId,
    signature,
    ineMatchToken,
    // signedContent y signerName ya NO se aceptan del cliente:
    // el contenido canónico se genera server-side y el nombre viene de auth.
  } = body as {
    modificationCatalogId?: unknown;
    formData?: unknown;
    draftId?: unknown;
    signature?: unknown;
    ineMatchToken?: unknown;
  };

  const matchToken = typeof ineMatchToken === "string" ? ineMatchToken : "";
  const capture = peekIneCapture(matchToken, "match", auth.id);
  const stored = readStoredIneFields(
    getCurrentIdentityDocument(auth.id, "ine")?.ocrMetadata ?? null
  );
  if (!capture || !stored || !sameCredential(stored, capture.fields) || capture.fields.expired) {
    return NextResponse.json(
      {
        error:
          "La INE de esta solicitud no coincide con la de tu perfil, está vencida o la lectura expiró. Actualízala en Mi perfil y vuelve a leerla aquí.",
      },
      { status: 409 }
    );
  }

  // ── Validar que viene una firma estructurada ───────────────────────────────
  if (!signature || typeof signature !== "object") {
    return NextResponse.json(
      { error: "Se requiere firma de consentimiento (campo 'signature')." },
      { status: 400 }
    );
  }

  // ── Validar modificación ──────────────────────────────────────────────────
  const catalogId = Number(modificationCatalogId);
  if (!Number.isInteger(catalogId) || catalogId <= 0) {
    return NextResponse.json(
      { error: "Modificación no especificada." },
      { status: 400 }
    );
  }

  const mod = getCatalogItem(catalogId);
  if (!mod) {
    return NextResponse.json({ error: "Modificación no encontrada." }, { status: 404 });
  }

  // ── Validar datos del formulario ──────────────────────────────────────────
  const data =
    formData && typeof formData === "object" && !Array.isArray(formData)
      ? (formData as Record<string, unknown>)
      : {};

  const validation = validateFormData(mod.slug, data);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: `Campos obligatorios faltantes: ${validation.missing.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  // Tipo interno estable. El nombre visible es el del catálogo (Tanque de gas, Reja lateral, etc.).
  const modType = ensureModificationTicketType();

  // ── Obtener claim del usuario (server-side, obligatorio) ─────────────────
  // La propiedad y el desarrollo se obtienen del claim del usuario, no del cliente.
  // NUNCA usar auth.name como propertyIdentifier — debe venir del claim.
  const claims = listClaimsForUser(auth.id);
  const activeClaim =
    claims.find((c) => c.status === "approved") ??
    claims.find((c) => ["pending", "conflict"].includes(c.status)) ??
    null;

  if (!activeClaim) {
    return NextResponse.json(
      {
        error:
          "No tienes una solicitud de vivienda activa. Registra tu vivienda antes de enviar modificaciones.",
      },
      { status: 422 }
    );
  }

  const propertyIdentifier = activeClaim.propertyIdentifier;
  const propertyClaimId = activeClaim.id;

  // Nombre del desarrollo desde DB
  let developmentName = "ARC";
  if (activeClaim?.developmentId) {
    const dev = getDevelopment(activeClaim.developmentId);
    if (dev) developmentName = dev.name;
  }

  // ── IP desde proxy confiable únicamente ───────────────────────────────────
  const hdrs = await headers();
  const ip = getTrustedIp(extractIpHeaders(hdrs));
  const ua = hdrs.get("user-agent") ?? null;

  // ── Construir values del formulario para ticket_values ────────────────────
  const formValues = [
    { fieldKey: "modificacion_slug", value: mod.slug },
    { fieldKey: "modificacion_nombre", value: mod.name },
    ...Object.entries(data).map(([k, v]) => ({
      fieldKey: k,
      value: v != null ? String(v) : null,
    })),
  ];

  // ── Crear ticket + firma ATÓMICA ──────────────────────────────────────────
  // signerName viene de auth (servidor), nunca del cliente.
  // signedContent se genera en createModificationTicket via buildConsentText.
  const createResult = await createModificationTicket({
    ticketTypeId: modType.id,
    portalUserId: auth.id,
    modificationCatalogId: catalogId,
    propertyClaimId,
    propertyIdentifier,
    developmentName,
    modificationName: mod.name,
    formValues,
    signerName: auth.name,
    signerId: auth.id,
    ipAddress: ip,
    userAgent: ua,
    // Firma estructurada validada en createModificationTicket
    signature: signature as import("@/lib/portal/signature-validator").SignatureInput,
  });

  if (!createResult.ok) {
    return NextResponse.json({ error: createResult.error }, { status: 400 });
  }

  const used = takeIneCapture(matchToken, "match", auth.id);
  if (used) {
    for (const filePath of [used.frontPath, used.backPath]) {
      if (pathInsideIdentity(filePath)) void rm(filePath, { force: true });
    }
  }

  const { ticket } = createResult;

  // ── Eliminar draft si se proporcionó ─────────────────────────────────────
  if (typeof draftId === "number" && draftId > 0) {
    deleteDraft(draftId, auth.id);
  }

  // ── Notificaciones best-effort ────────────────────────────────────────────
  void notifyTicketCreated(ticket).catch((err) =>
    console.error("[modificaciones/submit] notifyTicketCreated:", err)
  );

  publishAdminNotification({
    kind: "solicitud",
    title: "Nueva solicitud",
    body: `${auth.name} envió ${mod.name} · ${ticket.folio}`,
    ticketId: ticket.id,
    folio: ticket.folio,
  });

  try {
    broadcastTicketEvent({
      ticketId: ticket.id,
      portalUserId: auth.id,
      folio: ticket.folio,
      actor: "client",
      kind: "created",
      category: "solicitud",
    });
  } catch {
    // No bloquear si WS no está disponible
  }

  // Estado del expediente: el wizard puede subir docs después, pero reportamos
  // que el expediente está incompleto hasta que se suban los adjuntos requeridos.
  const expediente = checkExpediente(ticket.id, mod.slug);

  return NextResponse.json(
    {
      ticket: {
        id: ticket.id,
        folio: ticket.folio,
        status: ticket.status,
        held: ticket.status === "held",
        modificationSlug: mod.slug,
        modificationName: mod.name,
        /** El expediente está completo cuando todos los docs requeridos están subidos */
        expedienteCompleto: expediente.complete,
        expedienteMissing: expediente.missing,
      },
    },
    { status: 201 }
  );
}
