/**
 * Smoke test del enrutador de tickets por WhatsApp (#6, Fases A/B).
 * No usa WhatsApp real: inyecta un transporte falso que captura los textos.
 *
 *   npx tsx scripts/smoke-phase6.ts
 */
import db from "../src/lib/db";
import { getOrCreateConversation } from "../src/lib/db";
import {
  changeStatus,
  getActiveTicketsByPhone,
  getTicketById,
  setTicketAwaiting,
} from "../src/lib/portal/tickets";
import {
  clearWaTicketState,
  getWaTicketState,
} from "../src/lib/portal/wa-ticket-state";
import { handleIncomingTicketMessage } from "../src/lib/baileys/ticket-router";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

function findActive(): { phone: string; ticketId: number } | null {
  const rows = db
    .prepare(
      "SELECT id, phone FROM portal_users WHERE phone IS NOT NULL AND phone <> ''"
    )
    .all() as Array<{ id: number; phone: string }>;
  for (const r of rows) {
    const active = getActiveTicketsByPhone(r.phone);
    if (active.length > 0) return { phone: r.phone, ticketId: active[0]!.id };
  }
  return null;
}

async function main(): Promise<void> {
  console.log("== Smoke #6: enrutador de tickets (transporte falso) ==\n");

  const found = findActive();
  if (!found) {
    console.log(
      "No hay clientes con tickets activos. Crea uno desde el portal y reintenta."
    );
    return;
  }
  const { phone, ticketId } = found;
  const original = getTicketById(ticketId)!;
  console.log(
    `Usando ticket ${original.folio} (estatus ${original.status}), tel ${phone}\n`
  );

  const conv = getOrCreateConversation(phone, "Smoke #6", 1);
  clearWaTicketState(conv.id);

  const sent: string[] = [];
  const transport = {
    provider: "baileys" as const,
    lineId: 1,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async sendText(_to: string, text: string) {
      sent.push(text);
    },
    async setComposing() {},
    // eslint-disable-next-line @typescript-eslint/require-await
    async sendImage() {},
  };

  const call = (text: string) =>
    handleIncomingTicketMessage({
      transport: transport as never,
      jid: `${phone}@s.whatsapp.net`,
      conversationId: conv.id,
      contactPhone: phone,
      text,
    });

  // 1) Mensaje sobre el ticket (keyword) → menú guiado
  console.log("Escenario 1: pregunta sobre la solicitud");
  sent.length = 0;
  const h1 = await call("Hola, ¿cómo va mi solicitud?");
  check("consumió el mensaje", h1 === true);
  check("respondió algo", sent.length > 0);
  check("menciona el folio", sent.join("\n").includes(original.folio));
  check("estado = menu", getWaTicketState(conv.id)?.mode === "menu");

  // 2) Mensaje libre en menú → comentario
  console.log("\nEscenario 2: comentario libre en el menú");
  sent.length = 0;
  const h2 = await call("Quiero agregar una nota: ya tengo el permiso.");
  check("consumió el mensaje", h2 === true);
  check("limpió el estado", getWaTicketState(conv.id) === null);

  // 3) Desambiguación (mensaje genérico sin keyword)
  console.log("\nEscenario 3: desambiguación de duda genérica");
  clearWaTicketState(conv.id);
  sent.length = 0;
  const h3 = await call("Buenas, una duda por favor");
  check("consumió el mensaje", h3 === true);
  check("estado = confirm", getWaTicketState(conv.id)?.mode === "confirm");
  sent.length = 0;
  const h3b = await call("no");
  check("con 'no' devuelve al flujo normal", h3b === false);
  check("limpió el estado", getWaTicketState(conv.id) === null);

  // 4) awaiting_answer → el mensaje se registra como respuesta
  console.log("\nEscenario 4: ticket esperando respuesta del cliente");
  clearWaTicketState(conv.id);
  setTicketAwaiting(ticketId, "answer", "¿Cuál es tu número de medidor?");
  sent.length = 0;
  const h4 = await call("El medidor es 12345");
  check("consumió el mensaje", h4 === true);
  check("limpió awaiting", getTicketById(ticketId)?.awaitingKind === "none");

  // 5) Cancelar por menú (y restaurar)
  console.log("\nEscenario 5: cancelar por menú");
  clearWaTicketState(conv.id);
  await call("estatus de mi solicitud"); // deja estado = menu
  sent.length = 0;
  const h5 = await call("1");
  check("consumió el mensaje", h5 === true);
  check("ticket cancelado", getTicketById(ticketId)?.status === "cancelado");

  // Restaurar estatus original para no ensuciar datos
  changeStatus({
    ticketId,
    toStatus: original.status,
    changedBy: "smoke-phase6 (restaurar)",
    note: "Restaurado tras smoke test",
  });
  setTicketAwaiting(ticketId, "none");
  clearWaTicketState(conv.id);
  check(
    "estatus restaurado",
    getTicketById(ticketId)?.status === original.status
  );

  console.log(`\n== Resultado: ${pass} passed, ${fail} failed ==`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
