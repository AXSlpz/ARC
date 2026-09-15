import { mkdir } from "node:fs/promises";
import path from "node:path";
import { addDocument, getTicketById } from "./tickets";
import { getTicketType } from "./ticket-types";
import type { Ticket } from "./types";

const DOCUMENTS_DIR = path.join(process.cwd(), "data", "documents");

/**
 * Branding de la carta. Configurable por variables de entorno; los valores por
 * defecto reproducen el formato estándar entregado (Comité de Arquitectura).
 */
const BRAND = {
  name: process.env.LETTER_BRAND ?? "TERRASOLES",
  tagline: process.env.LETTER_BRAND_TAGLINE ?? "TIERRA VIVA",
  title: process.env.LETTER_TITLE ?? "COMITÉ DE ARQUITECTURA",
  subtitle:
    process.env.LETTER_SUBTITLE ??
    "Fraccionamiento Terrasoles, El Marqués, Querétaro",
  committee: process.env.LETTER_COMMITTEE ?? "Comité de Arquitectura Terrasoles",
  signer: process.env.LETTER_SIGNER ?? "Arq. Florentina del Bosque",
  phone: process.env.LETTER_PHONE ?? "4422714383",
  email: process.env.LETTER_EMAIL ?? "terrasoles@felant.com",
  /** URL absoluta o data URI del logo; si se define, sustituye al SVG por defecto. */
  logoUrl: process.env.LETTER_LOGO_URL ?? "",
  teal: process.env.LETTER_COLOR ?? "#0f6e6e",
  orange: process.env.LETTER_ACCENT ?? "#e08a2e",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: process.env.BUSINESS_TIMEZONE || "America/Mexico_City",
    }).format(new Date(ts * 1000));
  } catch {
    return new Date(ts * 1000).toISOString().slice(0, 10);
  }
}

function buildMergeMap(ticket: Ticket): Record<string, string> {
  const map: Record<string, string> = {
    folio: ticket.folio,
    fecha: formatDate(Math.floor(Date.now() / 1000)),
    tipo: ticket.ticketTypeName ?? "",
    cliente_nombre: ticket.clientName ?? "",
    cliente_correo: ticket.clientEmail ?? "",
    cliente_telefono: ticket.clientPhone ?? "",
  };
  for (const v of ticket.values ?? []) {
    map[v.fieldKey] = v.value ?? "";
  }
  return map;
}

function mergeTemplate(template: string, ticket: Ticket): string {
  const map = buildMergeMap(ticket);
  return template.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, key: string) => {
    const val = map[key];
    return val != null ? escapeHtml(String(val)) : "";
  });
}

/** Ficha con un valor capturado del ticket, estilo "campo" de la referencia. */
function chip(value: string): string {
  return `<span class="chip">${escapeHtml(value)}</span>`;
}

/** Campos del formulario que no deben ir en la carta (notas libres del cliente). */
const EXCLUDED_LETTER_KEYS = new Set([
  "comentarios",
  "comentarios_adicionales",
  "comentario",
  "notas",
  "nota",
  "observaciones",
]);

function isExcludedLetterField(fieldKey: string, label: string): boolean {
  const key = fieldKey.trim().toLowerCase();
  const lbl = label.trim().toLowerCase();
  if (EXCLUDED_LETTER_KEYS.has(key)) return true;
  return /comentario|observaci[oó]n|nota(s)?\b/.test(lbl);
}

/**
 * Cuerpo por defecto de la carta (1 hoja): datos del cliente + datos de la
 * solicitud (sin comentarios libres) + cláusulas breves.
 */
function defaultBody(ticket: Ticket): string {
  const tipo = ticket.ticketTypeName ?? "la solicitud";
  const clientRows: Array<[string, string]> = [
    ["Nombre", ticket.clientName ?? ""],
    ["Correo", ticket.clientEmail ?? ""],
    ["Teléfono", ticket.clientPhone ?? ""],
    ["Folio", ticket.folio],
  ].filter(([, v]) => v.trim() !== "") as Array<[string, string]>;

  const requestValues = (ticket.values ?? []).filter(
    (v) =>
      v.value != null &&
      String(v.value).trim() !== "" &&
      !isExcludedLetterField(v.fieldKey, v.label)
  );

  const clientHtml = clientRows
    .map(
      ([label, value]) =>
        `<div class="info-row"><span class="lbl">${escapeHtml(
          label
        )}</span><span class="val">${chip(value)}</span></div>`
    )
    .join("");

  const valuesHtml = requestValues
    .map(
      (v) =>
        `<div class="info-row"><span class="lbl">${escapeHtml(
          v.label
        )}</span><span class="val">${chip(String(v.value))}</span></div>`
    )
    .join("");

  return `
    <p>El presente documento respalda la autorización de la solicitud
    <strong>${escapeHtml(tipo)}</strong> por parte del ${escapeHtml(
      BRAND.committee
    )}, solicitada por el Sr./Sra. ${chip(ticket.clientName ?? "")}
    con folio ${chip(ticket.folio)}.</p>

    <div class="block-title">Datos del solicitante</div>
    <div class="info-grid">${clientHtml}</div>

    ${
      valuesHtml
        ? `<div class="block-title">Datos de la solicitud</div><div class="info-grid">${valuesHtml}</div>`
        : ""
    }

    <p class="clause">Dicho proyecto deberá respetar los lineamientos y
    especificaciones del Reglamento interno de vivienda vigente; de lo contrario
    se tendrán que hacer las adecuaciones pertinentes.</p>
    <p class="clause">Es importante tomar en cuenta que se pierde garantía del
    área donde se haga la modificación.</p>`;
}

/** ¿La plantilla es la heredada (diseño viejo)? → usar el cuerpo por defecto. */
function isLegacyTemplate(tpl: string): boolean {
  return tpl.includes("Carta de Autorización") || tpl.includes("Administración ARC");
}

function logoMarkup(): string {
  if (BRAND.logoUrl) {
    return `<img src="${escapeHtml(BRAND.logoUrl)}" alt="logo oficial" class="logo-img"/>`;
  }
  // Sin logo: recuadro placeholder "LOGO OFICIAL" (se reemplaza al definir LETTER_LOGO_URL).
  return `<div class="logo-ph">LOGO<br/>OFICIAL</div>`;
}

function wrapDocument(bodyHtml: string, ticket: Ticket): string {
  const fecha = formatDate(Math.floor(Date.now() / 1000));
  const heading = ticket.ticketTypeName
    ? `Autorización de ${ticket.ticketTypeName}`
    : "Autorización de solicitud";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { background: #ffffff; height: 100%; }
    body {
      font-family: "Helvetica Neue", Arial, sans-serif;
      color: #3f4650; margin: 0; font-size: 10.5pt; line-height: 1.4;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    /* Una sola hoja A4, densificando el contenido */
    .page {
      position: relative; width: 210mm; height: 297mm; overflow: hidden;
      padding: 16mm 16mm 28mm; background: #ffffff;
    }
    .corner-tr { position: absolute; top: 0; right: 0; width: 120px; height: 120px; overflow: hidden; }
    .corner-tr::before { content:""; position:absolute; top:-55px; right:-55px; width:140px; height:140px; background:${BRAND.orange}22; transform: rotate(45deg); }
    .corner-tr::after { content:""; position:absolute; top:-30px; right:-22px; width:95px; height:95px; background:${BRAND.orange}33; transform: rotate(45deg); }
    .head { display:flex; justify-content:flex-end; align-items:flex-start; margin-bottom: 4px; }
    .brand { text-align:center; }
    .logo-img { width:52px; height:52px; display:block; margin:0 auto 2px; object-fit: contain; }
    .logo-ph { width:64px; height:42px; margin:0 auto 4px; border:1.5px dashed #b9c0c8; border-radius:6px;
      display:flex; align-items:center; justify-content:center; text-align:center;
      color:#9aa3ab; font-size:7pt; font-weight:700; letter-spacing:.1em; line-height:1.15; }
    .brand .name { color:${BRAND.teal}; font-weight:700; letter-spacing:.28em; font-size:14pt; }
    .brand .tag { color:#9aa3ab; font-weight:600; letter-spacing:.36em; font-size:6.5pt; margin-top:1px; }
    h1.title { color:${BRAND.teal}; font-size:18pt; font-weight:800; margin: 4px 0 2px; }
    .subtitle { color:#6b7280; font-size:9pt; font-weight:600; margin-bottom:10px; }
    .meta-row { display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin-bottom:4px; }
    .date { font-size:9.5pt; color:#4b5563; }
    .date u { text-decoration: none; border-bottom:1px solid #9aa3ab; padding:0 4px; }
    .heading { color:${BRAND.orange}; font-weight:700; font-size:11.5pt; }
    .rule { height:1px; background:#d7dbe0; margin: 6px 0 10px; }
    .content p { text-align: justify; margin: 0 0 8px; }
    .content p.clause { margin: 6px 0 0; font-size: 9.5pt; color: #4b5563; }
    .block-title {
      margin: 10px 0 4px; font-size: 9.5pt; font-weight: 700; color: ${BRAND.teal};
      text-transform: uppercase; letter-spacing: .04em;
    }
    .info-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 4px 14px;
      background: #f7f8fa; border: 1px solid #e6e9ee; border-radius: 8px;
      padding: 8px 10px; margin-bottom: 4px;
    }
    .info-row { display:flex; flex-direction:column; gap:1px; min-width:0; }
    .info-row .lbl { font-size: 8pt; color:#6b7280; font-weight:600; }
    .info-row .val { font-size: 9.5pt; color:#3f4650; word-break: break-word; }
    .chip { display:inline; background:transparent; border:0; padding:0; margin:0; color:#3f4650; font-weight:600; }
    .sign { margin-top: 18px; text-align:center; }
    .sign svg { width:120px; height:42px; }
    .sign .line { width:200px; border-top:1px solid #6b7280; margin: 2px auto 4px; }
    .sign .r1 { font-weight:600; color:#3f4650; font-size:10pt; }
    .sign .r2, .sign .r3 { color:#6b7280; font-size:9pt; }
    .footer { position:absolute; left:0; right:0; bottom:0; height:22mm; }
    .footer .bar { position:absolute; bottom:0; left:0; right:0; height:7px; background:${BRAND.orange}; }
    .footer .deco { position:absolute; bottom:0; right:0; width:200px; height:22mm; overflow:hidden; }
    .footer .deco::before { content:""; position:absolute; bottom:0; right:0; width:0; height:0; border-style:solid; border-width:0 0 22mm 130px; border-color: transparent transparent ${BRAND.orange} transparent; }
    .footer .deco::after { content:""; position:absolute; bottom:0; right:100px; width:0; height:0; border-style:solid; border-width:0 0 16mm 80px; border-color: transparent transparent ${BRAND.orange}88 transparent; }
    .contacts { position:absolute; bottom:7mm; left:16mm; display:flex; gap:20px; align-items:center; color:#3f4650; font-size:9.5pt; }
    .contacts .item { display:flex; gap:6px; align-items:center; }
    .ic { width:22px; height:22px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; }
    .ic.wa { background:#25D366; }
    .ic.mail { background:#2b2f36; }
    .ic svg { width:13px; height:13px; }
  </style></head>
  <body>
    <div class="page">
      <div class="corner-tr"></div>

      <div class="head">
        <div class="brand">
          ${logoMarkup()}
          <div class="name">${escapeHtml(BRAND.name)}</div>
          ${BRAND.tagline ? `<div class="tag">${escapeHtml(BRAND.tagline)}</div>` : ""}
        </div>
      </div>

      <h1 class="title">${escapeHtml(BRAND.title)}</h1>
      <div class="subtitle">${escapeHtml(BRAND.subtitle)}</div>

      <div class="meta-row">
        <div class="heading">${escapeHtml(heading)}</div>
        <div class="date">Fecha: <u>${escapeHtml(fecha)}</u></div>
      </div>
      <div class="rule"></div>

      <div class="content">${bodyHtml}</div>

      <div class="sign">
        <svg viewBox="0 0 200 70" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 52 C40 8, 60 8, 66 40 C70 60, 84 60, 96 30 C104 12, 120 12, 122 40 C124 62, 150 30, 186 22"
                stroke="#2b2f36" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        </svg>
        <div class="line"></div>
        <div class="r1">Firma de autorización</div>
        <div class="r2">${escapeHtml(BRAND.committee)}</div>
        <div class="r3">${escapeHtml(BRAND.signer)}</div>
      </div>

      <div class="footer">
        <div class="deco"></div>
        <div class="contacts">
          <span class="item">
            <span class="ic wa"><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.5 14c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.7 1.7c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.5.1.3.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.7c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.5.3.1.2.1.6-.1 1.2Z"/></svg></span>
            ${escapeHtml(BRAND.phone)}
          </span>
          <span class="item">
            <span class="ic mail"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></span>
            ${escapeHtml(BRAND.email)}
          </span>
        </div>
        <div class="bar"></div>
      </div>
    </div>
  </body></html>`;
}

/**
 * Construye el HTML completo (con diseño) de la carta para un ticket, sin
 * generar el PDF. Se usa para la vista previa y para el render a PDF.
 */
export function buildLetterHtml(
  ticketId: number
): { html: string } | { error: string } {
  const ticket = getTicketById(ticketId);
  if (!ticket) return { error: "Ticket no encontrado." };

  const type = getTicketType(ticket.ticketTypeId);
  const raw = type?.letterTemplate?.trim();
  const body =
    raw && !isLegacyTemplate(raw) ? mergeTemplate(raw, ticket) : defaultBody(ticket);

  return { html: wrapDocument(body, ticket) };
}

/**
 * Genera la carta de autorización en PDF para un ticket y la guarda en
 * data/documents. Registra el documento y devuelve su metadata.
 */
export async function generateAuthorizationLetter(
  ticketId: number
): Promise<{ filename: string; path: string } | { error: string }> {
  const built = buildLetterHtml(ticketId);
  if ("error" in built) return built;

  const ticket = getTicketById(ticketId)!;

  await mkdir(DOCUMENTS_DIR, { recursive: true });
  const filename = `carta-${ticket.folio}.pdf`;
  const filePath = path.join(DOCUMENTS_DIR, filename);

  try {
    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(built.html, { waitUntil: "load" });
      await page.pdf({
        path: filePath,
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
    } finally {
      await browser.close();
    }
  } catch (err) {
    return {
      error:
        "No se pudo generar el PDF: " +
        (err instanceof Error ? err.message : String(err)),
    };
  }

  const doc = addDocument({
    ticketId,
    kind: "authorization_letter",
    filename,
    path: filePath,
  });
  return { filename: doc.filename, path: doc.path };
}
