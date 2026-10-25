/**
 * Smoke: despedida sin encuesta.
 * npx tsx scripts/test-farewell-survey.ts
 */
import assert from "node:assert/strict";
import {
  SURVEY_PROMPT,
  buildFarewellWithSurveyResponse,
  isFarewellMessage,
} from "../src/lib/conversation-farewell.js";

assert.equal(isFarewellMessage("gracias", true), true);
assert.equal(isFarewellMessage("Listo, Gracias", true), true);
assert.equal(isFarewellMessage("listo gracias", true), true);
assert.equal(isFarewellMessage("es todo gracias", true), true);
assert.equal(isFarewellMessage("listo", true), true);
assert.equal(isFarewellMessage("hola", true), false);
assert.equal(isFarewellMessage("gracias por el horario de la alberca?", true), false);
assert.equal(isFarewellMessage("gracias", false), false);

const reply = buildFarewellWithSurveyResponse("Ana", "Ana");
assert.notEqual(reply, SURVEY_PROMPT);
assert.equal(reply.includes("1 al 5"), false);
assert.ok(/ARC|reglamento/i.test(reply));

console.log("OK: farewell sin encuesta");
