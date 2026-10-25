export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export function isQuoteStatus(value: unknown): value is QuoteStatus {
  return (
    typeof value === "string" &&
    (QUOTE_STATUSES as readonly string[]).includes(value)
  );
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampDiscount(discountPct: number): number {
  if (!Number.isFinite(discountPct)) return 0;
  return Math.min(100, Math.max(0, discountPct));
}

export function lineTotal(
  qty: number,
  unitPrice: number,
  discountPct: number,
): number {
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safePrice = Number.isFinite(unitPrice) ? unitPrice : 0;
  const pct = clampDiscount(discountPct);
  return roundMoney(safeQty * safePrice * (1 - pct / 100));
}

export function lineGross(qty: number, unitPrice: number): number {
  const safeQty = Number.isFinite(qty) ? qty : 0;
  const safePrice = Number.isFinite(unitPrice) ? unitPrice : 0;
  return roundMoney(safeQty * safePrice);
}

export function quoteTotals(
  lines: Array<{ qty: number; unitPrice: number; discountPct: number }>,
): { subtotal: number; discountTotal: number; total: number } {
  let subtotal = 0;
  let total = 0;
  for (const line of lines) {
    subtotal = roundMoney(subtotal + lineGross(line.qty, line.unitPrice));
    total = roundMoney(
      total + lineTotal(line.qty, line.unitPrice, line.discountPct),
    );
  }
  return {
    subtotal,
    discountTotal: roundMoney(subtotal - total),
    total,
  };
}

export function nextQuoteNumber(maxExisting: number | null | undefined): number {
  return (maxExisting ?? 0) + 1;
}

export function defaultValidUntil(from = new Date()): string {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + 15);
  return next.toISOString().slice(0, 10);
}

export function formatQuoteMoney(
  value: number,
  currency = "MXN",
): string {
  const code = (currency || "MXN").trim() || "MXN";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return `${code} ${(Number(value) || 0).toFixed(2)}`;
  }
}
