/**
 * DEPRECATED: /api/portal/signature
 *
 * Este endpoint fue eliminado por seguridad (IDOR: no verificaba ownership del ticket).
 * La firma de consentimiento ahora se registra de forma atómica en:
 *   POST /api/portal/modificaciones/submit
 *
 * El contenido firmado se genera server-side (no aceptamos texto del cliente).
 * Retorna 410 Gone para orientar a integraciones antiguas.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Endpoint removido. La firma se registra automáticamente al enviar la solicitud vía POST /api/portal/modificaciones/submit.",
      removed: true,
    },
    { status: 410 }
  );
}
