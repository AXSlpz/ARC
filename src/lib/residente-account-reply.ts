import { getSearchTokens, normalizeQuery } from "./query-enrichment";

/** Detecta preguntas de saldo/deuda para acotar la vivienda (sin API externa). */
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
