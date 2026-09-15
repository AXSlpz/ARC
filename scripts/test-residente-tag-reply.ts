import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDirectTagVehicularReply,
  looksLikeTagVehicularQuestion,
} from "../src/lib/residente-tag-reply.js";
import type { Residente } from "../src/lib/residentes.js";

function baseResidente(over: Partial<Residente> = {}): Residente {
  return {
    id: 1,
    condominio_id: 1,
    condominio_name: "Test",
    condominio_prefijo: "T",
    num_vivienda: 1,
    num_coto: "T-1",
    nombre: "Ana Perez",
    celular: 3312345678,
    email: null,
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
    tag1_estatus: "Activo",
    tag1_id: 101,
    tag1_placa: "ABC-123-D",
    tag1_modelo: "Toyota Corolla",
    tag1_color: "Blanco",
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

describe("residente-tag-reply", () => {
  it("detecta preguntas de TAG/placa", () => {
    assert.equal(looksLikeTagVehicularQuestion("Cuál es mi placa?"), true);
    assert.equal(looksLikeTagVehicularQuestion("Quiero saber mi TAG"), true);
    assert.equal(looksLikeTagVehicularQuestion("Mi tag 2"), true);
    assert.equal(looksLikeTagVehicularQuestion("Cuándo pasa la basura?"), false);
  });

  it("responde con datos del TAG 1", () => {
    const reply = formatDirectTagVehicularReply(
      baseResidente(),
      "Cuál es mi placa?"
    );
    assert.ok(reply);
    assert.match(reply!, /ABC-123-D/);
    assert.match(reply!, /TAG ID: 101/);
    assert.match(reply!, /Toyota Corolla/);
  });

  it("filtra solo TAG 2 si lo piden", () => {
    const r = baseResidente({
      tag2_estatus: "Activo",
      tag2_id: 202,
      tag2_placa: "XYZ-999",
      tag2_modelo: "Honda Civic",
      tag2_color: "Negro",
    });
    const reply = formatDirectTagVehicularReply(r, "datos del tag 2");
    assert.ok(reply);
    assert.match(reply!, /TAG 2/);
    assert.match(reply!, /XYZ-999/);
    assert.doesNotMatch(reply!, /ABC-123-D/);
  });

  it("avisa si no hay TAG registrado", () => {
    const r = baseResidente({
      tag1_estatus: null,
      tag1_id: null,
      tag1_placa: null,
      tag1_modelo: null,
      tag1_color: null,
    });
    const reply = formatDirectTagVehicularReply(r, "mi tag vehicular");
    assert.ok(reply);
    assert.match(reply!, /No tengo TAG/i);
  });
});
