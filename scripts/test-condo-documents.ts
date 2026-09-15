import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "condo-docs-"));
process.env.REGLAMENTOS_DIR = tempRoot;

const {
  countDocuments,
  deleteDocument,
  listDocuments,
  saveDocument,
  getCondominioDocumentsDir,
} = await import("../src/lib/documents.js");

const {
  assessReglamentoMatch,
  invalidateReglamentosCache,
  loadReglamentosIndex,
  searchReglamentos,
} = await import("../src/lib/reglamentos.js");

const { buildSystemPromptForCondominio } = await import(
  "../src/lib/system-prompt.js"
);

const INDEX_DIR = path.resolve(process.cwd(), "data");
const INDEX_A = path.join(INDEX_DIR, "reglamentos-index-101.json");
const INDEX_B = path.join(INDEX_DIR, "reglamentos-index-202.json");

before(() => {
  for (const p of [INDEX_A, INDEX_B]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  invalidateReglamentosCache();
});

after(() => {
  for (const p of [INDEX_A, INDEX_B]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  invalidateReglamentosCache();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("documents scoped by condominio", () => {
  it("guarda y lista archivos solo en condo-{id}", () => {
    const pdfA = Buffer.from("%PDF-1.4 condo-a");
    const pdfB = Buffer.from("%PDF-1.4 condo-b");

    saveDocument(pdfA, "reglamento-a.pdf", "application/pdf", 101);
    saveDocument(pdfB, "reglamento-b.pdf", "application/pdf", 202);

    const listA = listDocuments(101);
    const listB = listDocuments(202);

    assert.equal(listA.length, 1);
    assert.equal(listA[0]!.name, "reglamento-a.pdf");
    assert.equal(listB.length, 1);
    assert.equal(listB[0]!.name, "reglamento-b.pdf");
    assert.equal(countDocuments(101), 1);
    assert.equal(countDocuments(999), 0);

    const dirA = getCondominioDocumentsDir(101);
    assert.ok(dirA.includes(`${path.sep}condo-101`));
    assert.ok(fs.existsSync(path.join(dirA, "reglamento-a.pdf")));
    assert.ok(
      !fs.existsSync(path.join(getCondominioDocumentsDir(101), "reglamento-b.pdf"))
    );
  });

  it("elimina solo el archivo del condominio indicado", () => {
    deleteDocument("reglamento-a.pdf", 101);
    assert.equal(listDocuments(101).length, 0);
    assert.equal(listDocuments(202).length, 1);
  });
});

describe("reglamentos search isolation", () => {
  it("no cruza chunks entre condominios", () => {
    fs.mkdirSync(INDEX_DIR, { recursive: true });

    fs.writeFileSync(
      INDEX_A,
      JSON.stringify({
        generatedAt: Math.floor(Date.now() / 1000),
        condominioId: 101,
        sources: ["paris-alberca.pdf"],
        chunks: [
          {
            id: "paris-alberca::0",
            source: "paris-alberca",
            kind: "pdf",
            text: "La alberca de Paris abre de 9 a 18 horas. Uso exclusivo residentes Paris.",
          },
        ],
      })
    );

    fs.writeFileSync(
      INDEX_B,
      JSON.stringify({
        generatedAt: Math.floor(Date.now() / 1000),
        condominioId: 202,
        sources: ["lima-cuotas.pdf"],
        chunks: [
          {
            id: "lima-cuotas::0",
            source: "lima-cuotas",
            kind: "pdf",
            text: "La cuota de mantenimiento de Lima es de 2500 pesos mensuales.",
          },
        ],
      })
    );

    invalidateReglamentosCache();

    const indexA = loadReglamentosIndex(101);
    const indexB = loadReglamentosIndex(202);
    assert.ok(indexA);
    assert.ok(indexB);
    assert.equal(indexA!.condominioId, 101);
    assert.equal(indexB!.condominioId, 202);

    const albercaInParis = searchReglamentos("horario alberca", 101);
    const albercaInLima = searchReglamentos("horario alberca", 202);
    assert.ok(albercaInParis.some((c) => c.text.includes("Paris")));
    assert.ok(!albercaInLima.some((c) => c.text.includes("Paris")));

    const cuotaInLima = searchReglamentos("cuota mantenimiento", 202);
    const cuotaInParis = searchReglamentos("cuota mantenimiento", 101);
    assert.ok(cuotaInLima.some((c) => c.text.includes("Lima")));
    assert.ok(!cuotaInParis.some((c) => c.text.includes("Lima")));

    const matchParis = assessReglamentoMatch("alberca horario", 101);
    const matchLimaAlberca = assessReglamentoMatch("alberca horario", 202);
    assert.notEqual(matchParis.level, "none");
    assert.equal(matchLimaAlberca.level, "none");
  });
});

describe("system prompt by condominio", () => {
  it("incluye el nombre del condominio en el prompt", () => {
    const prompt = buildSystemPromptForCondominio("TORRE A");
    assert.match(prompt, /condominio TORRE A/);
    assert.doesNotMatch(prompt, /Paris \(Coto 12/);
  });
});
