/**
 * npx tsx --test scripts/test-human-timing.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUBBLE_MIN_SPLIT_WORDS,
  countWords,
  splitIntoBubbles,
} from "../src/lib/human-timing.js";

describe("splitIntoBubbles", () => {
  it("keeps short multi-paragraph replies as a single bubble", () => {
    const text =
      "¡Buenos días, Alejandro! Estoy listo para ayudarte. ¿Qué necesitas?\n\n" +
      "Cuando tengas una pregunta, indícame de qué colonia o vivienda es.";
    const bubbles = splitIntoBubbles(text);
    assert.equal(bubbles.length, 1);
    assert.ok(countWords(text) < BUBBLE_MIN_SPLIT_WORDS);
  });

  it("keeps a typical 2–4 sentence FAQ answer as one bubble", () => {
    const text =
      "El reglamento indica que para eventos en la casa club, el número de personas no podrá exceder de 35. " +
      "Además, la música deberá tener un volumen que no moleste a los vecinos. " +
      "¿Quieres que te comparta más detalles sobre este tema?";
    assert.equal(splitIntoBubbles(text).length, 1);
  });

  it("splits only when the message is very long", () => {
    const sentence =
      "Esta es una oración de ejemplo con varias palabras para simular una respuesta extensa del bot. ";
    const text = Array.from({ length: 20 }, () => sentence.trim()).join(" ");
    assert.ok(countWords(text) > BUBBLE_MIN_SPLIT_WORDS);
    const bubbles = splitIntoBubbles(text);
    assert.ok(bubbles.length >= 2);
    assert.equal(bubbles.join(" "), text);
  });

  it("returns empty for blank input", () => {
    assert.deepEqual(splitIntoBubbles("   "), []);
  });
});
