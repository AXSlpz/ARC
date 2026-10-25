import { sendWhatsApp } from "../notify/whatsapp";
import { CrmError } from "./errors";
import { getProspecto } from "./prospectos";
import { generateQuotePdf } from "./quote-pdf";
import { formatQuoteMoney } from "./quote-math";
import { markQuoteSent, requireQuote, setQuotePdfPath } from "./quotes";
import type { Quote } from "./types";

function formatDate(value: string | null): string {
  if (!value) return "sin vigencia indicada";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function buildWhatsAppText(quote: Quote): string {
  const total = formatQuoteMoney(quote.total, quote.currency || "MXN");
  return [
    `Cotización folio ${quote.number}`,
    `Total: ${total} (sin IVA)`,
    `Vigencia: ${formatDate(quote.valid_until)}`,
    "Te compartimos el resumen. El PDF queda disponible en el sistema.",
  ].join("\n");
}

export async function sendQuote(quoteId: number): Promise<Quote> {
  const quote = requireQuote(quoteId);
  if (quote.status !== "draft") {
    throw new CrmError("Solo se puede enviar una cotización en borrador", 409);
  }

  const prospecto = getProspecto(quote.prospecto_id);
  if (!prospecto) {
    throw new CrmError("Prospecto no encontrado", 404);
  }

  const pdf = await generateQuotePdf(quoteId);
  setQuotePdfPath(quoteId, pdf.path);

  const wa = sendWhatsApp(prospecto.phone, buildWhatsAppText(quote), prospecto.name);
  if (!wa.ok) {
    throw new CrmError(
      wa.error ?? "No se pudo enviar el WhatsApp de la cotización",
      502,
    );
  }

  return markQuoteSent(quoteId, pdf.path);
}
