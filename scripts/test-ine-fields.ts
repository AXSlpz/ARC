/**
 * Campos de la INE: formato y comparación.
 * npx tsx scripts/test-ine-fields.ts
 */
import assert from "node:assert/strict";
import {
  draftIneFields,
  fieldsFromManualEntry,
  namesMatch,
  parseIneFields,
  readStoredIneFields,
  sameCredential,
  samePerson,
} from "../src/lib/portal/ine-fields.js";

const currentYear = new Date().getFullYear();
const valid = {
  apellidoPaterno: "López",
  apellidoMaterno: "Avalos",
  nombres: "Alejandro",
  fechaNacimiento: "15/03/1990",
  curp: "LOAA900315HJCPVL01",
  claveElector: "LPAVLN90031501H200",
  numCic: "123456789",
  numOcr: "1234567890123",
  anioVencimiento: String(currentYear),
};

const parsed = parseIneFields(valid);
assert.ok(parsed.fields);
assert.equal(parsed.fields.nombreCompleto, "LÓPEZ AVALOS ALEJANDRO");
assert.equal(parsed.fields.claveElector, "LPAVLN90031501H200");
assert.equal("numOcr" in parsed.fields, false);
assert.equal("numCic" in parsed.fields, false);
assert.equal(parsed.fields.expired, false);

const other = parseIneFields({ ...valid, curp: "LOAA900315HJCPVL02" });
assert.ok(other.fields);
assert.equal(samePerson(parsed.fields, other.fields), false);
assert.equal(sameCredential(parsed.fields, parsed.fields), true);

const expired = parseIneFields({ ...valid, anioVencimiento: "2020" });
assert.ok(expired.fields);
assert.equal(expired.fields.expired, true);

const broken = parseIneFields({ ...valid, claveElector: "CORTA" });
assert.equal(broken.fields, null);
assert.ok(broken.issues.some((issue) => issue.field === "clave de elector"));

const partial = draftIneFields({ ...valid, curp: "MAL", claveElector: "" });
assert.equal(partial.draft.curp, "MAL");
assert.ok(partial.issues.some((issue) => issue.field === "CURP"));
assert.equal(parseIneFields(partial.draft).fields, null);

const stored = readStoredIneFields(valid);
assert.ok(stored);
assert.equal(stored.curp, valid.curp);
assert.equal("numOcr" in stored, false);
assert.equal("numCic" in stored, false);

assert.equal(namesMatch(stored.nombreCompleto, "alejandro lopez avalos"), true);
assert.equal(namesMatch(stored.nombreCompleto, "OTRO NOMBRE"), false);

const manualOk = fieldsFromManualEntry(
  {
    nombre: stored.nombreCompleto,
    fechaNacimiento: valid.fechaNacimiento,
    curp: valid.curp,
    anioVencimiento: String(currentYear),
    claveElector: valid.claveElector,
  },
  stored
);
assert.ok(manualOk.fields);
assert.equal(manualOk.fields.expired, false);

const manualExpired = fieldsFromManualEntry(
  {
    nombre: stored.nombreCompleto,
    fechaNacimiento: valid.fechaNacimiento,
    curp: valid.curp,
    anioVencimiento: String(currentYear - 1),
    claveElector: valid.claveElector,
  },
  stored
);
assert.equal(manualExpired.fields, null);
assert.match(manualExpired.error, /vencida/);

console.log("OK: ine fields");
