import { generateAuthorizationLetter } from "../src/lib/portal/authorization-letter.js";
import { changeStatus, getTicketById } from "../src/lib/portal/tickets.js";
import {
  createEntry,
  currentMonth,
  monthlyReport,
} from "../src/lib/portal/finance.js";

/**
 * Smoke test de la Fase 2 (partes que requieren admin/2FA por HTTP):
 * genera la carta PDF de autorización y ejercita el módulo de finanzas.
 *
 * Uso: TID=<ticketId> npx tsx scripts/smoke-phase2.ts
 */
const ticketId = Number(process.env.TID || 1);

async function main() {
  console.log("== Ticket base ==");
  const base = getTicketById(ticketId);
  if (!base) {
    console.error(`No existe el ticket ${ticketId}. Crea uno primero.`);
    process.exit(1);
  }
  console.log(`  ${base.folio} — ${base.ticketTypeName} — estatus ${base.status}`);

  console.log("== Autorizar (cambiar estatus) ==");
  const changed = changeStatus({
    ticketId,
    toStatus: "autorizado",
    changedBy: "smoke",
    note: "Autorización de prueba",
  });
  console.log(`  estatus ahora: ${changed?.status}`);

  console.log("== Generar carta PDF (puppeteer) ==");
  const letter = await generateAuthorizationLetter(ticketId);
  if ("error" in letter) {
    console.error("  ERROR PDF:", letter.error);
  } else {
    console.log(`  PDF generado: ${letter.filename}`);
    console.log(`  Ruta: ${letter.path}`);
  }

  console.log("== Finanzas: registros + reporte ==");
  const month = currentMonth();
  const inc = createEntry({
    kind: "income",
    amountCents: 150050,
    description: "Cuota de prueba",
    occurredOn: `${month}-05`,
    createdBy: "smoke",
  });
  const exp = createEntry({
    kind: "expense",
    amountCents: 30000,
    description: "Gasto de prueba",
    occurredOn: `${month}-06`,
    createdBy: "smoke",
  });
  console.log(`  ingreso ok=${inc.ok} egreso ok=${exp.ok}`);
  const report = monthlyReport(month);
  console.log(
    `  reporte ${report.month}: ingresos=${report.totalIncomeCents} egresos=${report.totalExpenseCents} balance=${report.balanceCents}`
  );
  console.log(`  categorías en reporte: ${report.byCategory.length}`);

  console.log("\nSMOKE OK");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL:", err);
  process.exit(1);
});
