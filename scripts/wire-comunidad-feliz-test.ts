/**
 * Configura condominio de prueba + residente, corre sync y valida
 * respuesta de saldo (flujo bot autenticado sin WhatsApp).
 *
 * Uso: npx tsx scripts/wire-comunidad-feliz-test.ts
 */
import "./env-loader.js";
import {
  createCondominio,
  createResidente,
  listCondominios,
  listResidentes,
  updateCondominio,
  updateResidente,
} from "../src/lib/residentes.js";
import {
  getCachedAccountSummary,
  syncComunidadFelizAccounts,
} from "../src/lib/comunidad-feliz-accounts.js";
import { getProperties } from "../src/lib/comunidad-feliz-client.js";
import {
  formatDirectAccountReply,
  looksLikeAccountQuestion,
} from "../src/lib/residente-account-reply.js";

const COMMUNITY_ID = process.env.CF_TEST_COMMUNITY_ID?.trim() || "113717";
const CONDO_NAME = "CF Prueba Capital Sur";
const CONDO_PREFIJO = "CF";

async function main(): Promise<void> {
  console.log(`[wire] community_id=${COMMUNITY_ID}`);

  const props = await getProperties(COMMUNITY_ID);
  if (!props.ok) {
    console.error(`[wire] properties FAIL: ${props.error}`);
    process.exitCode = 1;
    return;
  }
  if (props.data.length === 0) {
    console.error("[wire] sin properties en comunidad");
    process.exitCode = 1;
    return;
  }

  const prop = props.data[0]!;
  console.log(
    `[wire] property id=${prop.id} name=${JSON.stringify(prop.name)} owner_email=${prop.owner_email ?? "-"} owner_name=${prop.owner_name ?? "-"}`
  );

  let condo = listCondominios().find(
    (c) => c.cf_community_id === COMMUNITY_ID || c.name === CONDO_NAME
  );
  if (!condo) {
    condo = createCondominio({
      name: CONDO_NAME,
      prefijo: CONDO_PREFIJO,
      tipo: "Vivienda",
      estatus: "Activo",
      estados_cuenta: true,
      cf_community_id: COMMUNITY_ID,
    });
    console.log(`[wire] condominio creado id=${condo.id}`);
  } else {
    condo = updateCondominio(condo.id, {
      estados_cuenta: true,
      cf_community_id: COMMUNITY_ID,
      estatus: "Activo",
    })!;
    console.log(`[wire] condominio actualizado id=${condo.id}`);
  }

  const unitNum = Number(prop.name);
  const numVivienda = Number.isFinite(unitNum) ? unitNum : 1;
  const email =
    prop.owner_email?.trim() ||
    process.env.COMUNIDAD_FELIZ_EMAIL?.trim() ||
    "capitalsur@prueba.cl";
  const nombre = prop.owner_name?.trim() || "Residente Prueba CF";

  let residente = listResidentes({
    condominio_id: condo.id,
    active: true,
    limit: 100,
    page: 1,
  }).data.find(
    (r) =>
      r.num_vivienda === numVivienda ||
      (r.email && r.email.toLowerCase() === email.toLowerCase())
  );

  if (!residente) {
    residente = createResidente({
      condominio_id: condo.id,
      num_vivienda: numVivienda,
      nombre,
      celular: 56912345678,
      email,
      cf_property_id: prop.id,
    });
    console.log(`[wire] residente creado id=${residente.id}`);
  } else {
    residente = updateResidente(residente.id, {
      num_vivienda: numVivienda,
      nombre,
      email,
      cf_property_id: prop.id,
    })!;
    console.log(`[wire] residente actualizado id=${residente.id}`);
  }

  console.log("[wire] sync ComunidadFeliz...");
  const sync = await syncComunidadFelizAccounts(condo.id);
  console.log(
    `[wire] sync enabled=${sync.enabled} error=${sync.error ?? "-"}`
  );
  for (const s of sync.summaries) {
    console.log(
      `[wire]   condo=${s.condominioId} props=${s.properties} matched=${s.matched} unmatched=${s.unmatched} errors=${JSON.stringify(s.errors)}`
    );
  }

  const snapshot = getCachedAccountSummary(residente.id);
  if (!snapshot) {
    console.error(
      "[wire] FAIL: sin snapshot — match residente↔property insuficiente (email/unidad)"
    );
    process.exitCode = 1;
    return;
  }

  const question = "¿Cuál es mi estado de cuenta?";
  console.log(
    `[wire] looksLikeAccountQuestion=${looksLikeAccountQuestion(question)}`
  );
  const reply = formatDirectAccountReply(
    snapshot,
    residente.num_coto ?? String(residente.num_vivienda)
  );
  console.log("[wire] respuesta bot (residente autenticado):");
  console.log(reply);
  console.log(
    `[wire] snapshot total_to_pay=${snapshot.total_to_pay} currency=${snapshot.currency} al_dia=${snapshot.al_dia} property_id=${snapshot.property_id}`
  );
  console.log("[wire] PASS");
}

void main();
