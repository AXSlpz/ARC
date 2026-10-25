import assert from "node:assert/strict";
import test from "node:test";
import {
  appendMoneyDigit,
  composeMxnAmount,
  formatMxn,
  parseMoneyInput,
  reconcileLiveMxn,
} from "../src/lib/money.ts";

test("formatMxn usa símbolo de pesos y dos decimales", () => {
  const formatted = formatMxn(1850);
  assert.match(formatted, /\$/);
  assert.match(formatted, /1,850\.00/);
});

test("parseMoneyInput acepta formato mexicano", () => {
  assert.equal(parseMoneyInput("$1,850.00"), 1850);
  assert.equal(parseMoneyInput("1850"), 1850);
  assert.equal(parseMoneyInput("1850.5"), 1850.5);
  assert.equal(parseMoneyInput("1.850,50"), 1850.5);
  assert.equal(parseMoneyInput(""), null);
});

test("mientras se escribe agrega miles y decimales", () => {
  let parts = { integer: "0", fraction: "00" };

  parts = reconcileLiveMxn(parts.integer, parts.fraction, "$01.00");
  assert.equal(composeMxnAmount(parts.integer, parts.fraction), 1);
  assert.equal(formatMxn(1), formatMxn(composeMxnAmount(parts.integer, parts.fraction)));

  parts = reconcileLiveMxn(parts.integer, parts.fraction, "$18.00");
  assert.equal(composeMxnAmount(parts.integer, parts.fraction), 18);

  parts = reconcileLiveMxn(parts.integer, parts.fraction, "$185.00");
  assert.equal(composeMxnAmount(parts.integer, parts.fraction), 185);

  parts = reconcileLiveMxn(parts.integer, parts.fraction, "$1,850.00");
  assert.equal(composeMxnAmount(parts.integer, parts.fraction), 1850);
  assert.match(formatMxn(1850), /1,850\.00/);

  parts = reconcileLiveMxn(parts.integer, parts.fraction, "$1,850.000");
  assert.equal(composeMxnAmount(parts.integer, parts.fraction), 18500);

  parts = reconcileLiveMxn(parts.integer, parts.fraction, "185000");
  assert.equal(composeMxnAmount(parts.integer, parts.fraction), 185000);
  assert.match(formatMxn(185000), /185,000\.00/);
});

test("centavos se editan a la derecha del punto", () => {
  const parts = reconcileLiveMxn("1850", "00", "$1,850.50", true);
  assert.equal(composeMxnAmount(parts.integer, parts.fraction), 1850.5);
});

test("cada dígito arma miles y millones en vivo", () => {
  let state = { integer: "0", fraction: "00", centsCount: 0 };
  for (const digit of "185000") {
    state = appendMoneyDigit(state.integer, state.fraction, digit, false, 0);
  }
  assert.equal(composeMxnAmount(state.integer, state.fraction), 185000);
  assert.match(formatMxn(185000), /185,000\.00/);
});
