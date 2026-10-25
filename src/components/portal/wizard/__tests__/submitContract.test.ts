/**
 * Contract test: verifica que el payload del wizard coincida con el contrato
 * del backend (POST /api/portal/modificaciones/submit + SignatureInputSchema).
 *
 * Ejecutar:
 *   npx tsx src/components/portal/wizard/__tests__/submitContract.test.ts
 *
 * Exit code 0 = todo OK, exit code 1 = algún test falló.
 */
import assert from "node:assert/strict";

// ── Tipos del contrato (deben mantenerse sincronizados con el backend) ────────

type DrawnSignature = { method: "drawn"; dataUrl: string };
type TypedSignature = { method: "typed"; typedName: string };
type SignatureInput = DrawnSignature | TypedSignature;

interface SubmitPayload {
  modificationCatalogId: number;
  formData: Record<string, string>;
  draftId?: number;
  signature: SignatureInput;
}

// ── Lógica de construcción (igual que ModificationWizard.tsx) ─────────────────

interface SignatureResult {
  canvasDataUrl: string | null;
  typedName: string;
  hasSignature: boolean;
}

function buildSignaturePayload(
  result: SignatureResult,
  fallbackName: string
): SignatureInput {
  if (result.canvasDataUrl) {
    return { method: "drawn", dataUrl: result.canvasDataUrl };
  }
  return { method: "typed", typedName: result.typedName.trim() || fallbackName };
}

function buildPayload(opts: {
  catalogId: number;
  formData: Record<string, string>;
  signatureResult: SignatureResult;
  fallbackName: string;
  draftId?: number;
}): SubmitPayload {
  const base: SubmitPayload = {
    modificationCatalogId: opts.catalogId,
    formData: opts.formData,
    signature: buildSignaturePayload(opts.signatureResult, opts.fallbackName),
  };
  if (opts.draftId != null) base.draftId = opts.draftId;
  return base;
}

// ── Runner de tests ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

console.log("\nsubmitContract — payload wizard ↔ backend\n");

// ── Tests ─────────────────────────────────────────────────────────────────────

test('drawn: method="drawn", dataUrl presente, sin typedName', () => {
  const p = buildPayload({
    catalogId: 1,
    formData: { area: "12" },
    signatureResult: {
      canvasDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      typedName: "",
      hasSignature: true,
    },
    fallbackName: "Ana López",
  });
  assert.equal(p.signature.method, "drawn");
  assert.ok("dataUrl" in p.signature, "dataUrl debe existir en drawn");
  assert.ok(!("typedName" in p.signature), "typedName NO debe estar en drawn");
});

test('typed: method="typed", typedName presente, sin dataUrl', () => {
  const p = buildPayload({
    catalogId: 2,
    formData: {},
    signatureResult: { canvasDataUrl: null, typedName: "Carlos Martínez", hasSignature: true },
    fallbackName: "Fallback",
  });
  assert.equal(p.signature.method, "typed");
  assert.ok("typedName" in p.signature, "typedName debe existir en typed");
  assert.ok(!("dataUrl" in p.signature), "dataUrl NO debe estar en typed");
});

test("typed usa fallbackName cuando typedName está vacío", () => {
  const p = buildPayload({
    catalogId: 3,
    formData: {},
    signatureResult: { canvasDataUrl: null, typedName: "   ", hasSignature: true },
    fallbackName: "Nombre por defecto",
  });
  assert.equal(p.signature.method, "typed");
  if ("typedName" in p.signature) {
    assert.equal(p.signature.typedName, "Nombre por defecto");
  }
});

test("NO contiene campos raíz legacy (signedContent / signerName / signatureDataUrl)", () => {
  const p = buildPayload({
    catalogId: 1,
    formData: {},
    signatureResult: { canvasDataUrl: null, typedName: "T", hasSignature: true },
    fallbackName: "F",
  }) as unknown as Record<string, unknown>;
  assert.ok(!("signedContent" in p), "signedContent NO debe estar en el payload");
  assert.ok(!("signerName" in p), "signerName NO debe estar en el payload");
  assert.ok(!("signatureDataUrl" in p), "signatureDataUrl NO debe estar en el payload");
});

test("draftId solo presente cuando se provee", () => {
  const sinDraft = buildPayload({
    catalogId: 1, formData: {}, signatureResult: { canvasDataUrl: null, typedName: "T", hasSignature: true },
    fallbackName: "F",
  });
  const conDraft = buildPayload({
    catalogId: 1, formData: {}, signatureResult: { canvasDataUrl: null, typedName: "T", hasSignature: true },
    fallbackName: "F", draftId: 42,
  });
  assert.ok(!("draftId" in sinDraft), "draftId NO debe estar cuando es undefined");
  assert.equal(conDraft.draftId, 42, "draftId debe valer 42");
});

test("modificationCatalogId es number", () => {
  const p = buildPayload({
    catalogId: 99, formData: {}, signatureResult: { canvasDataUrl: null, typedName: "X", hasSignature: true },
    fallbackName: "F",
  });
  assert.equal(typeof p.modificationCatalogId, "number");
  assert.equal(p.modificationCatalogId, 99);
});

test("drawn rechaza canvasDataUrl null (typedName tiene prioridad)", () => {
  // Con canvasDataUrl null debe usar typed, incluso si hay typedName
  const p = buildPayload({
    catalogId: 1, formData: {},
    signatureResult: { canvasDataUrl: null, typedName: "María García", hasSignature: true },
    fallbackName: "F",
  });
  assert.equal(p.signature.method, "typed");
});

// ── Resumen ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
