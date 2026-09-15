import "./env-loader.js";

import db from "../src/lib/db.js";
import {
  updatePortalProfile,
  changePortalPassword,
} from "../src/lib/portal/auth.js";
import {
  storeAttachment,
  listAttachments,
  getAttachmentStoredPath,
  deleteAttachment,
} from "../src/lib/portal/attachments.js";

function line(msg: string) {
  console.log(msg);
}

async function main() {
  line("== Smoke Fase 2.1 (perfil + adjuntos seguros) ==\n");

  // ── Setup: usuario y ticket de prueba ──────────────────────────────
  const user = db
    .prepare("SELECT id, email, phone FROM portal_users ORDER BY id LIMIT 1")
    .get() as { id: number; email: string; phone: string | null } | undefined;
  if (!user) {
    line("No hay portal_users. Crea uno antes (registro en el portal).");
    process.exit(1);
  }
  line(`Usuario de prueba: #${user.id} ${user.email}`);

  // ── #1 Perfil ──────────────────────────────────────────────────────
  const origPhone = user.phone;
  const upd = updatePortalProfile(user.id, { phone: "5215550001234" });
  line(`Perfil update phone: ${upd.ok ? "OK -> " + upd.user.phone : "ERROR " + upd.error}`);
  // revertir teléfono
  updatePortalProfile(user.id, { phone: origPhone });

  // email duplicado (contra otro usuario si existe)
  const other = db
    .prepare("SELECT email FROM portal_users WHERE id <> ? LIMIT 1")
    .get(user.id) as { email: string } | undefined;
  if (other) {
    const clash = updatePortalProfile(user.id, { email: other.email });
    line(`Perfil email duplicado rechazado: ${!clash.ok ? "OK (" + clash.error + ")" : "FALLO: se permitió"}`);
  }

  const badPwd = changePortalPassword(user.id, "___definitivamente_incorrecta___", "NuevaClave123");
  line(`Cambio de contraseña con actual incorrecta rechazado: ${!badPwd.ok ? "OK (" + badPwd.error + ")" : "FALLO"}`);

  // ── #2 Adjuntos seguros ────────────────────────────────────────────
  let ticket = db
    .prepare("SELECT id FROM tickets ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!ticket) {
    const type = db.prepare("SELECT id FROM ticket_types ORDER BY id LIMIT 1").get() as
      | { id: number }
      | undefined;
    if (!type) {
      line("No hay ticket_types; no se puede crear ticket de prueba. Se omiten adjuntos.");
      process.exit(0);
    }
    const res = db
      .prepare(
        `INSERT INTO tickets (folio, portal_user_id, ticket_type_id, status)
         VALUES ('ARC-SMOKE', ?, ?, 'nuevo')`
      )
      .run(user.id, type.id);
    ticket = { id: Number(res.lastInsertRowid) };
    line(`Ticket temporal creado #${ticket.id}`);
  } else {
    line(`Usando ticket existente #${ticket.id}`);
  }

  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  ]);

  const ok = await storeAttachment({
    ticketId: ticket.id,
    uploaderType: "client",
    originalName: "prueba.png",
    declaredMime: "image/png",
    bytes: pngHeader,
  });
  line(`PNG válido aceptado: ${ok.ok ? "OK (#" + ok.attachment.id + ", scan=" + ok.attachment.scanned + ")" : "FALLO " + ok.error}`);

  const exe = await storeAttachment({
    ticketId: ticket.id,
    uploaderType: "client",
    originalName: "malware.exe",
    declaredMime: "application/octet-stream",
    bytes: Buffer.from([0x4d, 0x5a, 0x90, 0x00]),
  });
  line(`.exe rechazado por whitelist: ${!exe.ok ? "OK (" + exe.error + ")" : "FALLO: se aceptó"}`);

  const badMagic = await storeAttachment({
    ticketId: ticket.id,
    uploaderType: "client",
    originalName: "falso.png",
    declaredMime: "image/png",
    bytes: Buffer.from("esto no es una imagen", "utf8"),
  });
  line(`PNG con magic bytes inválidos rechazado: ${!badMagic.ok ? "OK (" + badMagic.error + ")" : "FALLO: se aceptó"}`);

  const mimeMismatch = await storeAttachment({
    ticketId: ticket.id,
    uploaderType: "client",
    originalName: "raro.png",
    declaredMime: "application/pdf",
    bytes: pngHeader,
  });
  line(`MIME declarado que no coincide con extensión rechazado: ${!mimeMismatch.ok ? "OK (" + mimeMismatch.error + ")" : "FALLO: se aceptó"}`);

  const list = listAttachments(ticket.id);
  line(`listAttachments -> ${list.length} adjunto(s)`);

  if (ok.ok) {
    const found = getAttachmentStoredPath(ticket.id, ok.attachment.id);
    line(`getAttachmentStoredPath: ${found ? "OK (" + found.originalName + ")" : "FALLO"}`);
    const del = await deleteAttachment(ticket.id, ok.attachment.id);
    line(`deleteAttachment (limpieza): ${del ? "OK" : "FALLO"}`);
  }

  // limpieza: borra el ticket temporal si lo creamos
  db.prepare("DELETE FROM tickets WHERE folio = 'ARC-SMOKE'").run();
  line("\n== Smoke Fase 2.1 completado ==");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
