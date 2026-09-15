/**
 * Verifica despedida ("es todo gracias") + mensaje de cierre por inactividad sin encuesta.
 * Ejecutar: npx tsx scripts/test-farewell-and-inactivity.ts
 */
import assert from "node:assert/strict";
import {
  isFarewellMessage,
  buildFarewellWithSurveyResponse,
  buildSurveyTimeoutCloseMessage,
  SURVEY_PROMPT,
} from "../src/lib/conversation-farewell";
import {
  buildInactivityFarewellMessage,
  DEFAULT_INACTIVITY_FAREWELL_MESSAGE,
  isTerminalAssistantMessage,
  looksLikeAwaitingClientReply,
} from "../src/lib/inactivity";

function testFarewellDetection() {
  assert.equal(isFarewellMessage("es todo gracias", true), true);
  assert.equal(isFarewellMessage("Es todo, gracias!", true), true);
  assert.equal(isFarewellMessage("gracias es todo", true), true);
  assert.equal(isFarewellMessage("eso es todo gracias", true), true);
  assert.equal(isFarewellMessage("muchas gracias", true), true);
  assert.equal(isFarewellMessage("hola, ¿cuál es el horario de la alberca?", true), false);
  assert.equal(isFarewellMessage("es todo gracias", false), false);
}

function testFarewellIncludesSurvey() {
  const msg = buildFarewellWithSurveyResponse("Andre Lopez");
  assert.ok(msg.includes(SURVEY_PROMPT));
  assert.ok(/Andre|gusto|gracias|placer|alegra/i.test(msg));
}

function testInactivityHasNoSurvey() {
  const msg = buildInactivityFarewellMessage();
  assert.ok(msg.includes("30"));
  assert.equal(msg.includes("1 al 5"), false);
  assert.equal(msg.includes(SURVEY_PROMPT), false);
  assert.equal(DEFAULT_INACTIVITY_FAREWELL_MESSAGE.includes("1 al 5"), false);
}

function testSurveyTimeoutHasNoSurvey() {
  const msg = buildSurveyTimeoutCloseMessage();
  assert.equal(msg.includes(SURVEY_PROMPT), false);
  assert.equal(msg.includes("1 al 5"), false);
}

function testAwaitingClientReplyHeuristics() {
  assert.equal(
    isTerminalAssistantMessage(
      "Recibí tu archivo para la solicitud *ARC-00004*. ¡Gracias!"
    ),
    true
  );
  assert.equal(
    looksLikeAwaitingClientReply(
      "Recibí tu archivo para la solicitud *ARC-00004*. ¡Gracias!"
    ),
    false
  );
  assert.equal(
    looksLikeAwaitingClientReply(
      "¡Buenas noches, Alejandro! ¿En qué te apoyo?"
    ),
    true
  );
  assert.equal(
    looksLikeAwaitingClientReply(
      "Para la solicitud *ARC-00004* necesitamos un archivo. Envía una *foto* por aquí."
    ),
    true
  );
  assert.equal(
    looksLikeAwaitingClientReply(
      "El horario de la alberca es de 8:00 a 20:00."
    ),
    false
  );
}

testFarewellDetection();
testFarewellIncludesSurvey();
testInactivityHasNoSurvey();
testSurveyTimeoutHasNoSurvey();
testAwaitingClientReplyHeuristics();
console.log("OK: farewell + inactivity tests passed");
