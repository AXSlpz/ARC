/**
 * Smoke test de #1 (archivo) y #6 (HTML de la carta).
 *   npx tsx scripts/smoke-phase6c.ts
 */
import db from "../src/lib/db";
import {
  listTicketsAdmin,
  softDeleteTicket,
  restoreTicket,
} from "../src/lib/portal/tickets";
import { buildLetterHtml } from "../src/lib/portal/authorization-letter";

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

function main(): void {
  console.log("== Smoke #6c: archivo de tickets + carta HTML ==\n");

  const row = db
    .prepare("SELECT id FROM tickets WHERE deleted_at IS NULL ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!row) {
    console.log("No hay tickets. Crea uno desde el portal y reintenta.");
    return;
  }
  const ticketId = row.id;

  // #1 Archivo
  console.log("Escenario 1: archivar / restaurar");
  const activeBefore = listTicketsAdmin().some((t) => t.id === ticketId);
  check("aparece en activos antes", activeBefore);

  check("archivar OK", softDeleteTicket(ticketId));
  check("ya NO aparece en activos", !listTicketsAdmin().some((t) => t.id === ticketId));
  check(
    "aparece en archivados",
    listTicketsAdmin({ archived: true }).some((t) => t.id === ticketId)
  );
  check("archivar de nuevo es idempotente (false)", !softDeleteTicket(ticketId));

  check("restaurar OK", restoreTicket(ticketId));
  check("vuelve a activos", listTicketsAdmin().some((t) => t.id === ticketId));
  check("restaurar de nuevo es idempotente (false)", !restoreTicket(ticketId));

  // #6 Carta HTML
  console.log("\nEscenario 2: HTML de la carta");
  const built = buildLetterHtml(ticketId);
  check("genera HTML", "html" in built);
  if ("html" in built) {
    const h = built.html;
    check("incluye título COMITÉ DE ARQUITECTURA", h.includes("COMITÉ DE ARQUITECTURA"));
    check("incluye Firma de autorización", h.includes("Firma de autorización"));
    check("incluye footer de contacto (email)", /@/.test(h) && h.includes("footer"));
    check("es un documento HTML completo", h.trimStart().startsWith("<!doctype html"));
  }

  console.log(`\n== Resultado: ${pass} passed, ${fail} failed ==`);
  if (fail > 0) process.exitCode = 1;
}

main();
