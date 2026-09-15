import type { AccountSnapshot } from "./comunidad-feliz-accounts";
import { getSearchTokens, normalizeQuery } from "./query-enrichment";

export function looksLikeAccountQuestion(query: string): boolean {
  const hay = normalizeQuery(query);
  if (!hay) return false;

  const phrases = [
    "estado de cuenta",
    "estados de cuenta",
    "cuanto debo",
    "cuánto debo",
    "tengo deuda",
    "mi deuda",
    "saldo pendiente",
    "gasto comun",
    "gasto común",
    "gastos comunes",
    "estoy al dia",
    "estoy al día",
    "al corriente",
    "adeudo",
    "mi saldo",
    "pagos pendientes",
    "cuota pendiente",
  ];
  if (phrases.some((p) => hay.includes(normalizeQuery(p)))) return true;

  const tokens = getSearchTokens(query);
  const moneyTokens = [
    "deuda",
    "deudas",
    "saldo",
    "pago",
    "pagos",
    "adeudo",
    "adeudos",
    "cuenta",
    "cuotas",
    "cobranza",
  ];
  const contextTokens = [
    "estado",
    "pendiente",
    "pendientes",
    "debo",
    "debo",
    "debe",
    "comunes",
    "comun",
    "cuanto",
    "cuánto",
  ];

  const hasMoney = moneyTokens.some((t) => tokens.includes(t) || hay.includes(t));
  const hasContext = contextTokens.some(
    (t) => tokens.includes(normalizeQuery(t)) || hay.includes(normalizeQuery(t))
  );
  if (hasMoney && hasContext) return true;

  if (/\bestado\s+de\s+cuenta\b/i.test(query)) return true;
  if (/\bcu[aá]nto\s+debo\b/i.test(query)) return true;

  return false;
}

function formatMoney(amount: number, currency: string | null): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = currency?.trim() ? `${currency.trim()} ` : "$";
  return `${symbol}${formatted}`;
}

function formatPaymentDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Respuesta directa con resumen de estado de cuenta.
 * Devuelve null si la pregunta no parece de cobranza.
 */
export function formatDirectAccountReply(
  snapshot: AccountSnapshot,
  unidad?: string | null
): string {
  const unitLabel = unidad?.trim() ? ` de la unidad ${unidad.trim()}` : "";
  const lastPayDate = formatPaymentDate(snapshot.last_payment_at);
  const lastPayAmt =
    snapshot.last_payment_amount != null
      ? formatMoney(snapshot.last_payment_amount, snapshot.currency)
      : null;

  let body: string;
  if (snapshot.al_dia || snapshot.total_to_pay <= 0) {
    body = `Estás al día${unitLabel}. No tienes saldo pendiente.`;
  } else {
    body = `Tienes un saldo pendiente${unitLabel} de ${formatMoney(
      snapshot.total_to_pay,
      snapshot.currency
    )}.`;
  }

  if (lastPayDate && lastPayAmt) {
    body += `\nÚltimo pago registrado: ${lastPayAmt} el ${lastPayDate}.`;
  } else if (lastPayDate) {
    body += `\nÚltimo pago registrado: ${lastPayDate}.`;
  }

  return body;
}

export const ACCOUNT_DEGRADED_REPLY =
  "Por el momento no pude consultar tu estado de cuenta. Intenta más tarde o pide apoyo a administración.";

/** Contexto para el LLM cuando la pregunta habla de deuda/pagos. */
export function buildAccountContext(
  snapshot: AccountSnapshot | null,
  query?: string
): string {
  if (query && !looksLikeAccountQuestion(query)) return "";
  if (!snapshot) {
    return "No hay estado de cuenta en caché para este residente verificado.";
  }

  const lines = [
    `- Saldo total a pagar: ${snapshot.total_to_pay}`,
    `- Estatus: ${snapshot.al_dia || snapshot.total_to_pay <= 0 ? "al día" : "con saldo pendiente"}`,
  ];
  if (snapshot.currency) lines.push(`- Moneda: ${snapshot.currency}`);
  if (snapshot.last_payment_at) {
    lines.push(`- Último pago (fecha): ${snapshot.last_payment_at}`);
  }
  if (snapshot.last_payment_amount != null) {
    lines.push(`- Último pago (monto): ${snapshot.last_payment_amount}`);
  }
  lines.push(`- property_id: ${snapshot.property_id}`);
  return lines.join("\n");
}
