/**
 * Capa de envío de correo intercambiable por variables de entorno.
 *
 * Drivers (elegido automáticamente):
 *   - "resend": si EMAIL_PROVIDER=resend o hay RESEND_API_KEY (API HTTP, sin dependencias).
 *   - "smtp":   si EMAIL_PROVIDER=smtp o hay SMTP_HOST (usa nodemailer si está instalado,
 *               ideal para Mailpit en local: SMTP_HOST=localhost SMTP_PORT=1025).
 *   - "log":    por defecto. No envía nada real; escribe a consola (útil en dev).
 *
 * Variables:
 *   EMAIL_PROVIDER, EMAIL_FROM,
 *   RESEND_API_KEY,
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type SendEmailResult =
  | { ok: true; driver: string; id?: string }
  | { ok: false; driver: string; error: string };

function resolveDriver(): "resend" | "smtp" | "log" {
  const explicit = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === "resend" || explicit === "smtp" || explicit === "log") {
    return explicit;
  }
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.SMTP_HOST?.trim()) return "smtp";
  return "log";
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "ARC <no-reply@arc.axsolutions.tech>";
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, driver: "resend", error: "Falta RESEND_API_KEY." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text ?? htmlToText(input.html),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, driver: "resend", error: `HTTP ${res.status} ${detail}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, driver: "resend", id: data.id };
  } catch (err) {
    return {
      ok: false,
      driver: "resend",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return { ok: false, driver: "smtp", error: "Falta SMTP_HOST." };
  try {
    // nodemailer es opcional: si no está instalado, degradar a log.
    // Especificador no literal para que TS no exija los tipos del módulo.
    const specifier = "nodemailer";
    const mod = (await import(specifier).catch(() => null)) as
      | { createTransport: (opts: unknown) => { sendMail: (m: unknown) => Promise<{ messageId?: string }> } }
      | null;
    if (!mod) {
      console.warn("[email] nodemailer no instalado; usando driver log.");
      return sendViaLog(input);
    }
    const transport = mod.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
    });
    const info = await transport.sendMail({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
    });
    return { ok: true, driver: "smtp", id: info.messageId };
  } catch (err) {
    return {
      ok: false,
      driver: "smtp",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function sendViaLog(input: SendEmailInput): SendEmailResult {
  console.log(
    `[email:log] Para: ${input.to} | Asunto: ${input.subject}\n${htmlToText(input.html).slice(0, 500)}`
  );
  return { ok: true, driver: "log" };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = input.to?.trim();
  if (!to) return { ok: false, driver: "none", error: "Destinatario vacío." };

  const driver = resolveDriver();
  if (driver === "resend") return sendViaResend(input);
  if (driver === "smtp") return sendViaSmtp(input);
  return sendViaLog(input);
}
