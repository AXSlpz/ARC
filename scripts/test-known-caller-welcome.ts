import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  identifyCallerOnResidente,
  type KnownCallerMatch,
} from "../src/lib/resident-identity.js";
import { buildKnownCallerWelcome } from "../src/lib/personalized-replies.js";
import type { Residente } from "../src/lib/residentes.js";

function baseResidente(overrides: Partial<Residente> = {}): Residente {
  return {
    id: 1,
    condominio_id: 1,
    condominio_name: "Demo",
    condominio_prefijo: "D",
    nombre: "Juan Pérez García",
    email: "juan@example.com",
    celular: 8181234567,
    num_vivienda: "12",
    num_coto: null,
    cf_property_id: null,
    prototipo_id: null,
    prototipo_nombre: null,
    servicio_luz: null,
    nombre_contacto1: "María López",
    celular_contacto1: 8187654321,
    parentesco_contacto1: "Esposa",
    nombre_contacto2: null,
    celular_contacto2: null,
    parentesco_contacto2: null,
    nombre_contacto3: null,
    celular_contacto3: null,
    parentesco_contacto3: null,
    nombre_expropietario: "Carlos Ruiz",
    celular_expropietario: 8111111111,
    active: true,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("identifyCallerOnResidente", () => {
  it("detecta propietario por celular", () => {
    const match = identifyCallerOnResidente("8181234567", baseResidente());
    assert.ok(match);
    assert.equal(match!.role, "owner");
    assert.equal(match!.displayName, "Juan Pérez García");
  });

  it("detecta contacto por celular_contacto1 con 52", () => {
    const match = identifyCallerOnResidente(
      "528187654321",
      baseResidente()
    );
    assert.ok(match);
    assert.equal(match!.role, "contact");
    assert.equal(match!.displayName, "María López");
  });

  it("detecta expropietario", () => {
    const match = identifyCallerOnResidente("8111111111", baseResidente());
    assert.ok(match);
    assert.equal(match!.role, "ex_owner");
    assert.equal(match!.displayName, "Carlos Ruiz");
  });

  it("regresa null si el teléfono no coincide", () => {
    const match: KnownCallerMatch | null = identifyCallerOnResidente(
      "8000000000",
      baseResidente()
    );
    assert.equal(match, null);
  });
});

describe("buildKnownCallerWelcome", () => {
  it("con solicitud no pregunta en qué ayudar", () => {
    const msg = buildKnownCallerWelcome("Alejandro Lopez", {
      hasRequest: true,
    });
    assert.match(msg, /Alejandro/i);
    assert.doesNotMatch(msg, /en qué te apoyo|cómo te ayudo|qué necesitas/i);
    assert.match(
      msg,
      /solicitud|consulta|revis|verific|instant|respuesta|apoyo en eso/i
    );
  });

  it("sin solicitud invita a decir en qué ayudar", () => {
    const msg = buildKnownCallerWelcome("Alejandro Lopez", {
      hasRequest: false,
    });
    assert.match(msg, /Alejandro/i);
    assert.match(msg, /en qué|cómo te ayudo|qué necesitas/i);
  });
});
