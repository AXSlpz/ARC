/**
 * Smoke test del auto-alta de residente "pendiente" al registrarse en el portal (#6).
 *   npx tsx scripts/smoke-phase6b.ts
 */
import db from "../src/lib/db";
import { registerPortalUser } from "../src/lib/portal/auth";
import {
  createCondominio,
  deleteCondominio,
  getResidente,
  updateResidente,
  PENDING_CONDOMINIO_NAME,
} from "../src/lib/residentes";

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
  console.log("== Smoke #6b: auto-alta residente pendiente ==\n");
  const rand = Math.floor(Math.random() * 1e6);
  const email = `smoke6b_${rand}@arc.test`;
  const phone = `55${String(10000000 + rand).slice(-8)}`;

  const reg = registerPortalUser({
    name: `Cliente Smoke ${rand}`,
    email,
    phone,
    password: "SmokePass123",
  });
  check("registro OK", reg.ok === true);
  if (!reg.ok) {
    console.log(reg.error);
    process.exitCode = 1;
    return;
  }

  const pu = db
    .prepare("SELECT residente_id FROM portal_users WHERE id = ?")
    .get(reg.user.id) as { residente_id: number | null };
  check("portal_user tiene residente enlazado", pu.residente_id != null);

  const residenteId = pu.residente_id!;
  const res = getResidente(residenteId);
  check("residente existe", res != null);
  check("marcado pendiente_asignacion=1", res?.pendiente_asignacion === 1);
  check(
    "en condominio placeholder",
    res?.condominio_name === PENDING_CONDOMINIO_NAME
  );
  check("nombre copiado", res?.nombre === `Cliente Smoke ${rand}`);
  check("email copiado", res?.email === email);

  // Asignar condominio real → debe limpiar la marca
  const realCondo = createCondominio({
    name: `Smoke Condo ${rand}`,
    prefijo: `SC${rand}`.slice(0, 6),
  });
  updateResidente(residenteId, {
    condominio_id: realCondo.id,
    num_vivienda: 5,
  });
  const after = getResidente(residenteId);
  check("tras asignar condominio real, deja de estar pendiente", !after?.pendiente_asignacion);
  check("condominio reasignado", after?.condominio_id === realCondo.id);

  // Cleanup
  db.prepare("DELETE FROM portal_sessions WHERE user_id = ?").run(reg.user.id);
  db.prepare("DELETE FROM portal_users WHERE id = ?").run(reg.user.id);
  db.prepare("DELETE FROM residentes WHERE id = ?").run(residenteId);
  deleteCondominio(realCondo.id);
  console.log("  (limpieza realizada)");

  console.log(`\n== Resultado: ${pass} passed, ${fail} failed ==`);
  if (fail > 0) process.exitCode = 1;
}

main();
