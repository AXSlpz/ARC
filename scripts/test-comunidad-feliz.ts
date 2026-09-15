import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCOUNT_DEGRADED_REPLY,
  buildAccountContext,
  formatDirectAccountReply,
  looksLikeAccountQuestion,
} from "../src/lib/residente-account-reply.js";
import { matchResidenteToProperty } from "../src/lib/comunidad-feliz-accounts.js";
import type { AccountSnapshot } from "../src/lib/comunidad-feliz-accounts.js";
import type { CfProperty } from "../src/lib/comunidad-feliz-client.js";
import type { Residente } from "../src/lib/residentes.js";

function baseResidente(over: Partial<Residente> = {}): Residente {
  return {
    id: 1,
    condominio_id: 1,
    condominio_name: "Test",
    condominio_prefijo: "T",
    num_vivienda: 12,
    num_coto: "T-12",
    cf_property_id: null,
    prototipo_id: null,
    prototipo_name: null,
    nombre: "Ana Perez",
    celular: 3312345678,
    email: "ana@example.com",
    fecha_entrega: null,
    metros_cuadrados: null,
    cuota_int: null,
    cuota_ext: null,
    cuota_completa: null,
    cuota_int_pronpago: null,
    cuota_ext_pronpago: null,
    cuota_comp_pronpago: null,
    servicio_luz: null,
    nombre_contacto1: null,
    celular_contacto1: null,
    parentesco_contacto1: null,
    nombre_contacto2: null,
    celular_contacto2: null,
    parentesco_contacto2: null,
    nombre_contacto3: null,
    celular_contacto3: null,
    parentesco_contacto3: null,
    mes_pago: null,
    nombre_expropietario: null,
    celular_expropietario: null,
    fecha_entrega_primer: null,
    tag1_estatus: null,
    tag1_id: null,
    tag1_placa: null,
    tag1_modelo: null,
    tag1_color: null,
    tag2_estatus: null,
    tag2_id: null,
    tag2_placa: null,
    tag2_modelo: null,
    tag2_color: null,
    active: 1,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

function snapshot(over: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    residente_id: 1,
    property_id: "p-1",
    community_id: "c-1",
    total_to_pay: 0,
    currency: "MXN",
    al_dia: true,
    last_payment_at: "2026-06-01T12:00:00Z",
    last_payment_amount: 1500,
    matched_at: 0,
    fetched_at: 0,
    ...over,
  };
}

describe("residente-account-reply", () => {
  it("detecta preguntas de estado de cuenta", () => {
    assert.equal(looksLikeAccountQuestion("¿Cuál es mi estado de cuenta?"), true);
    assert.equal(looksLikeAccountQuestion("cuánto debo"), true);
    assert.equal(looksLikeAccountQuestion("tengo deuda pendiente"), true);
    assert.equal(looksLikeAccountQuestion("estoy al día"), true);
    assert.equal(looksLikeAccountQuestion("horario de la alberca"), false);
  });

  it("formatea resumen al día y con saldo", () => {
    const ok = formatDirectAccountReply(snapshot(), "T-12");
    assert.match(ok, /al día/i);
    assert.match(ok, /T-12/);

    const debt = formatDirectAccountReply(
      snapshot({ al_dia: false, total_to_pay: 2500.5 }),
      "T-12"
    );
    assert.match(debt, /saldo pendiente/i);
    assert.match(debt, /2[,.]500/);
  });

  it("arma contexto LLM", () => {
    const ctx = buildAccountContext(snapshot({ total_to_pay: 100, al_dia: false }), "mi deuda");
    assert.match(ctx, /Saldo total/);
    assert.match(ctx, /saldo pendiente/);
    assert.equal(buildAccountContext(null, "horario"), "");
    assert.ok(ACCOUNT_DEGRADED_REPLY.length > 10);
  });
});

describe("matchResidenteToProperty", () => {
  it("empareja por email + unidad + nombre", () => {
    const props: CfProperty[] = [
      {
        id: "99",
        community_id: "1",
        name: "T-12",
        owner_name: "Ana Pérez",
        owner_email: "ana@example.com",
        raw: {},
      },
      {
        id: "88",
        community_id: "1",
        name: "T-13",
        owner_name: "Otro",
        owner_email: "otro@example.com",
        raw: {},
      },
    ];
    const match = matchResidenteToProperty(baseResidente(), props);
    assert.equal(match?.id, "99");
  });

  it("no empareja si hay empate ambiguo", () => {
    const props: CfProperty[] = [
      {
        id: "1",
        community_id: "1",
        name: "T-12",
        owner_name: "Ana Perez",
        owner_email: "ana@example.com",
        raw: {},
      },
      {
        id: "2",
        community_id: "1",
        name: "T-12",
        owner_name: "Ana Perez",
        owner_email: "ana@example.com",
        raw: {},
      },
    ];
    assert.equal(matchResidenteToProperty(baseResidente(), props), null);
  });

  it("acepta match único por unidad exacta sin email del propietario", () => {
    const props: CfProperty[] = [
      {
        id: "1782335",
        community_id: "113717",
        name: "1",
        owner_name: null,
        owner_email: null,
        raw: {},
      },
    ];
    const match = matchResidenteToProperty(
      baseResidente({
        num_vivienda: 1,
        num_coto: "1",
        email: "otro@example.com",
        nombre: "Sin Match Nombre",
      }),
      props
    );
    assert.equal(match?.id, "1782335");
  });

  it("prioriza cf_property_id sobre match por unidad", () => {
    const props: CfProperty[] = [
      {
        id: "111",
        community_id: "1",
        name: "T-12",
        owner_name: "Ana Perez",
        owner_email: "ana@example.com",
        raw: {},
      },
      {
        id: "222",
        community_id: "1",
        name: "Otra",
        owner_name: null,
        owner_email: null,
        raw: {},
      },
    ];
    const match = matchResidenteToProperty(
      baseResidente({ cf_property_id: "222" }),
      props
    );
    assert.equal(match?.id, "222");
  });

  it("no matchea si cf_property_id no existe en la comunidad", () => {
    const props: CfProperty[] = [
      {
        id: "111",
        community_id: "1",
        name: "T-12",
        owner_name: "Ana Perez",
        owner_email: "ana@example.com",
        raw: {},
      },
    ];
    assert.equal(
      matchResidenteToProperty(baseResidente({ cf_property_id: "999" }), props),
      null
    );
  });
});

// Modo manual: tsx scripts/test-comunidad-feliz.ts --live
if (process.argv.includes("--live")) {
  void (async () => {
    await import("./env-loader.js");
    const {
      getAccessToken,
      getProperties,
      getPropertyAccounts,
      isComunidadFelizConfigured,
    } = await import("../src/lib/comunidad-feliz-client.js");

    const communityId = process.env.CF_TEST_COMMUNITY_ID?.trim() || "113717";
    console.log("[live] ComunidadFeliz smoke");
    console.log(
      `[live] configured=${isComunidadFelizConfigured()} community_id=${communityId} base=${process.env.COMUNIDAD_FELIZ_BASE_URL ?? ""}`
    );

    console.log("[live] 1) auth...");
    const token = await getAccessToken(true);
    if (!token.ok) {
      console.error(`[live] auth FAIL: ${token.error} status=${token.status ?? "-"}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      `[live] auth OK token_len=${token.data.length} (token omitido)`
    );

    console.log(`[live] 2) properties (filter community ${communityId})...`);
    const props = await getProperties(communityId);
    if (!props.ok) {
      console.error(`[live] properties FAIL: ${props.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[live] properties OK count=${props.data.length}`);
    for (const p of props.data.slice(0, 5)) {
      console.log(
        `[live]   property id=${p.id} name=${JSON.stringify(p.name)} community_id=${p.community_id}`
      );
    }
    if (props.data.length === 0) {
      console.error(
        "[live] Sin propiedades en esa comunidad — revisar acceso broker/owner del usuario"
      );
      process.exitCode = 1;
      return;
    }

    const sampleIds = props.data.slice(0, Math.min(5, props.data.length)).map((p) => p.id);
    console.log(`[live] 3) property_accounts ids=${sampleIds.join(",")}`);
    const accounts = await getPropertyAccounts(sampleIds);
    if (!accounts.ok) {
      console.error(`[live] accounts FAIL: ${accounts.error}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[live] accounts OK count=${accounts.data.length}`);
    for (const a of accounts.data) {
      console.log(
        `[live]   saldo property_id=${a.property_id} total_to_pay=${a.total_to_pay} currency=${a.currency ?? "-"} last_payment_at=${a.last_payment_at ?? "-"} last_payment_amount=${a.last_payment_amount ?? "-"}`
      );
    }
    console.log("[live] smoke PASS");
  })();
}
