/**
 * npx tsx scripts/test-property-choice.ts
 */
import assert from "node:assert/strict";
import {
  buildPropertyChoicePrompt,
  formatPropertyLabel,
  parsePropertyChoice,
  parsePropertyMentionInQuestion,
} from "../src/lib/property-choice";
import {
  looksLikeContactQuestion,
  looksLikePropertyScopedQuestion,
  shouldPromptPropertyChoice,
} from "../src/lib/property-scoped-question";
import type { Residente } from "../src/lib/residentes";

function stub(partial: Partial<Residente> & Pick<Residente, "id" | "nombre" | "condominio_name">): Residente {
  return {
    condominio_id: 1,
    condominio_prefijo: "X",
    num_vivienda: 1,
    num_coto: "1-1",
    cf_property_id: null,
    prototipo_id: null,
    celular: null,
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
    ocupacion: "Ocupado",
    active: 1,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

const lima = stub({
  id: 1,
  nombre: "Alejandro Lopez",
  condominio_name: "Lima",
  num_vivienda: 1,
  num_coto: "17-1",
});
const lisboa = stub({
  id: 2,
  nombre: "Alejandro Lopez",
  condominio_name: "Lisboa",
  num_vivienda: 45,
  num_coto: "18-45",
  condominio_id: 2,
});

const props = [lima, lisboa];
const prompt = buildPropertyChoicePrompt(props);
assert.ok(prompt.includes("1) Lima · vivienda 17-1"));
assert.ok(prompt.includes("2) Lisboa · vivienda 18-45"));

assert.equal(parsePropertyChoice("1", props)?.id, 1);
assert.equal(parsePropertyChoice("2)", props)?.id, 2);
assert.equal(parsePropertyChoice("lisboa", props)?.id, 2);
assert.equal(parsePropertyChoice("17-1", props)?.id, 1);
assert.equal(parsePropertyChoice("hola", props), null);
assert.ok(formatPropertyLabel(lima).includes("Lima"));

assert.equal(
  parsePropertyMentionInQuestion("¿Cuántos tags tengo activos?", props),
  null,
  "un número de vivienda suelto no debe elegir propiedad"
);
assert.equal(
  parsePropertyMentionInQuestion("tengo 1 tag activo", props),
  null
);
assert.equal(
  parsePropertyMentionInQuestion("¿Cuántos tags tengo en Lisboa?", props)?.id,
  2
);
assert.equal(
  parsePropertyMentionInQuestion("tags de Lima vivienda 1", props)?.id,
  1
);

assert.equal(looksLikePropertyScopedQuestion("Hola"), false);
assert.equal(looksLikePropertyScopedQuestion("¿Cuántos tags tengo activos?"), true);
assert.equal(looksLikePropertyScopedQuestion("cuál es mi estado de cuenta"), true);
assert.equal(looksLikeContactQuestion("cuáles son mis contactos de emergencia"), true);
assert.equal(
  looksLikePropertyScopedQuestion("horario de la alberca en el reglamento"),
  true
);

assert.equal(
  shouldPromptPropertyChoice("¿Cuántos tags tengo activos?", props, {
    propertyExplicitlyChosen: false,
  }),
  true
);
assert.equal(
  shouldPromptPropertyChoice("Hola", props, { propertyExplicitlyChosen: false }),
  false
);
assert.equal(
  shouldPromptPropertyChoice("¿Cuántos tags tengo activos?", props, {
    propertyExplicitlyChosen: true,
  }),
  false
);
assert.equal(
  shouldPromptPropertyChoice("¿Cuántos tags tengo en Lisboa?", props, {
    propertyExplicitlyChosen: false,
  }),
  false,
  "si ya nombró la colonia, no volver a preguntar"
);
assert.equal(
  shouldPromptPropertyChoice("¿Cuántos tags tengo activos?", [lima], {
    propertyExplicitlyChosen: false,
  }),
  false
);

console.log("OK: property-choice");
