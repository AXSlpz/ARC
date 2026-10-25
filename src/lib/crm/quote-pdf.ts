import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CrmError } from "./errors";
import { formatQuoteMoney } from "./quote-math";
import { requireQuote } from "./quotes";
import type { Quote } from "./types";

const QUOTES_DIR = path.join(process.cwd(), "data", "documents", "quotes");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function quotePdfFilename(number: number): string {
  return `cotizacion-${number}.pdf`;
}

export function quotePdfAbsolutePath(number: number): string {
  return path.join(QUOTES_DIR, quotePdfFilename(number));
}

export function isSafeQuotePdfPath(filePath: string, number: number): boolean {
  const resolved = path.resolve(filePath);
  const expected = path.resolve(quotePdfAbsolutePath(number));
  return resolved === expected;
}

function buildQuoteHtml(quote: Quote): string {
  const brand = process.env.LETTER_BRAND ?? "ARC";
  const money = (value: number) => formatQuoteMoney(value, quote.currency || "MXN");
  const rows = quote.lines
    .map(
      (line) => `
      <tr>
        <td>
          <strong>${escapeHtml(line.name_snapshot)}</strong>
          ${line.sku_snapshot ? `<div class="sku">${escapeHtml(line.sku_snapshot)}</div>` : ""}
        </td>
        <td class="num">${escapeHtml(String(line.qty))}</td>
        <td class="num">${escapeHtml(money(line.unit_price))}</td>
        <td class="num">${escapeHtml(String(line.discount_pct))}%</td>
        <td class="num">${escapeHtml(money(line.line_total))}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Cotización ${quote.number}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #0f172a;
      font-size: 12px;
    }
    .page { padding: 36px 40px; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .muted { color: #64748b; }
    .head { display: flex; justify-content: space-between; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #475569; }
    .num { text-align: right; white-space: nowrap; }
    .sku { font-size: 11px; color: #64748b; margin-top: 2px; }
    .totals { width: 280px; margin-left: auto; margin-top: 16px; }
    .totals td { border: 0; padding: 4px 0; }
    .totals .grand { font-size: 16px; font-weight: 700; }
    .notes { margin-top: 24px; white-space: pre-wrap; }
    .legal { margin-top: 32px; font-size: 11px; color: #64748b; }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div>
        <h1>${escapeHtml(brand)}</h1>
        <div class="muted">Cotización</div>
      </div>
      <div>
        <div><strong>Folio:</strong> ${quote.number}</div>
        <div><strong>Prospecto:</strong> ${escapeHtml(quote.prospecto_name)}</div>
        <div><strong>Vigencia:</strong> ${escapeHtml(formatDate(quote.valid_until))}</div>
        <div><strong>Moneda:</strong> ${escapeHtml(quote.currency || "MXN")}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th class="num">Cant.</th>
          <th class="num">P.unit.</th>
          <th class="num">Desc.%</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${escapeHtml(money(quote.subtotal))}</td></tr>
      <tr><td>Descuento</td><td class="num">${escapeHtml(money(quote.discount_total))}</td></tr>
      <tr class="grand"><td>Total</td><td class="num">${escapeHtml(money(quote.total))}</td></tr>
    </table>
    ${
      quote.notes
        ? `<div class="notes"><strong>Notas</strong><div>${escapeHtml(quote.notes)}</div></div>`
        : ""
    }
    <p class="legal">Montos en ${escapeHtml(quote.currency || "MXN")}. Esta cotización no incluye IVA.</p>
  </div>
</body>
</html>`;
}

export async function generateQuotePdf(quoteId: number): Promise<{
  filename: string;
  path: string;
}> {
  const quote = requireQuote(quoteId);
  await mkdir(QUOTES_DIR, { recursive: true });
  const filename = quotePdfFilename(quote.number);
  const filePath = quotePdfAbsolutePath(quote.number);

  try {
    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(buildQuoteHtml(quote), { waitUntil: "load" });
      await page.pdf({
        path: filePath,
        format: "letter",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
    } finally {
      await browser.close();
    }
  } catch {
    throw new CrmError("No se pudo generar el PDF de la cotización", 500);
  }

  return { filename, path: filePath };
}
