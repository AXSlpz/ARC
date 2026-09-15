/**
 * Smoke test: bienvenida incluye ejemplos.
 * npx tsx scripts/test-welcome-examples.ts
 */
import assert from "node:assert/strict";
import { buildWelcomeMessage } from "../src/lib/welcome";

const withExamples = buildWelcomeMessage("Soy el asistente de ARC.", "María");
assert.ok(withExamples.includes("Por ejemplo, puedes preguntarme:"));
assert.ok(withExamples.includes("•"));
assert.ok(/alberca|visita|cuota|mascota|fuga|área|obra|estacionamiento|seguridad|juntas/i.test(withExamples));

const without = buildWelcomeMessage("Hola custom", null, { includeExamples: false });
assert.equal(without.includes("Por ejemplo"), false);
assert.ok(without.includes("Hola") || without.includes("Buenos") || without.includes("Buenas") || without.includes("custom") || without.length > 10);

console.log("OK: welcome examples");
