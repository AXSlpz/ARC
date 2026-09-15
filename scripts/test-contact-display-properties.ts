/**
 * npx tsx --test scripts/test-contact-display-properties.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatContactPropertyLine } from "../src/lib/contact-display.js";

describe("formatContactPropertyLine", () => {
  it("formats condo + vivienda", () => {
    assert.equal(
      formatContactPropertyLine({
        id: 1,
        condominio: "Lisboa",
        num_vivienda: 45,
      }),
      "Lisboa · Núm° Vivienda - 45"
    );
  });

  it("formats only vivienda when condo missing", () => {
    assert.equal(
      formatContactPropertyLine({
        id: 2,
        condominio: "",
        num_vivienda: 17,
      }),
      "Núm° Vivienda - 17"
    );
  });
});
