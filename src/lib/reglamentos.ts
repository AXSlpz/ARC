import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import {
  getCondominioDocumentsDir,
  listCondominioIdsWithDocumentFolders,
} from "./documents";
import {
  detectQueryTopics,
  expandTokens,
  getSearchTokens,
  normalizeQuery,
  tokensMatch,
} from "./query-enrichment";

export interface ReglamentoChunk {
  id: string;
  source: string;
  kind: "pdf" | "image";
  text: string;
}

export interface ReglamentoIndex {
  generatedAt: number;
  condominioId: number;
  sources: string[];
  chunks: ReglamentoChunk[];
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const IMAGE_EXTENSIONS = new Set([".jpeg", ".jpg", ".png", ".webp"]);

function assertCondoId(condominioId: number): number {
  if (!Number.isInteger(condominioId) || condominioId <= 0) {
    throw new Error("condominioId inválido");
  }
  return condominioId;
}

export function getReglamentosIndexPath(condominioId: number): string {
  return path.join(
    DATA_DIR,
    `reglamentos-index-${assertCondoId(condominioId)}.json`
  );
}

function getVisionModel(): string {
  return (
    process.env.OPENROUTER_VISION_MODEL ??
    process.env.OPENROUTER_MODEL ??
    "openai/gpt-4o-mini"
  );
}

function isPdfFile(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function isSupportedFile(name: string): boolean {
  return isPdfFile(name) || isImageFile(name);
}

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => isSupportedFile(name))
    .sort();
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function chunkText(
  text: string,
  source: string,
  kind: ReglamentoChunk["kind"]
): ReglamentoChunk[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  if (kind === "image") {
    return [
      {
        id: `${source}::0`,
        source,
        kind,
        text: normalized,
      },
    ];
  }

  const paragraphs = normalized.split(/\n\n+/);
  const chunks: ReglamentoChunk[] = [];
  let current = "";
  let index = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length > 1200 && current.length > 0) {
      chunks.push({
        id: `${source}::${index++}`,
        source,
        kind,
        text: current.trim(),
      });
      current = trimmed;
      continue;
    }

    current = current ? `${current}\n\n${trimmed}` : trimmed;
  }

  if (current.trim()) {
    chunks.push({
      id: `${source}::${index}`,
      source,
      kind,
      text: current.trim(),
    });
  }

  return chunks;
}

async function extractPdfText(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractImageTextWithOcr(filePath: string): Promise<string> {
  const worker = await createWorker("spa");
  try {
    const {
      data: { text },
    } = await worker.recognize(filePath);
    return text;
  } finally {
    await worker.terminate();
  }
}

async function extractImageTextWithVision(
  filePath: string,
  source: string
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY no configurada para extraer imágenes");
  }

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : "image/jpeg";

  const base64 = fs.readFileSync(filePath).toString("base64");

  const response = await client.chat.completions.create({
    model: getVisionModel(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extrae toda la información útil de esta imagen titulada "${source}".
Incluye títulos, fechas, horarios, instrucciones, correos, teléfonos y ejemplos.
Devuelve solo texto plano en español, organizado en párrafos cortos.
No inventes información que no aparezca en la imagen.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mime};base64,${base64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 1500,
    temperature: 0,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

async function extractImageText(
  filePath: string,
  source: string
): Promise<string> {
  try {
    console.log(`[reglamentos] Extrayendo imagen con visión: ${source}`);
    const visionText = await extractImageTextWithVision(filePath, source);
    if (visionText.length >= 40) return visionText;
    console.warn(`[reglamentos] Visión devolvió poco texto — usando OCR`);
  } catch (err) {
    console.warn(`[reglamentos] Visión falló para ${source}, usando OCR:`, err);
  }

  console.log(`[reglamentos] Extrayendo imagen con OCR: ${source}`);
  return extractImageTextWithOcr(filePath);
}

function sourcesMatch(existing: string[], current: string[]): boolean {
  if (existing.length !== current.length) return false;
  return existing.every((file, index) => file === current[index]);
}

const indexCache = new Map<number, ReglamentoIndex | null>();

export function invalidateReglamentosCache(condominioId?: number): void {
  if (condominioId != null) {
    indexCache.delete(assertCondoId(condominioId));
    return;
  }
  indexCache.clear();
}

export function deleteReglamentosIndex(condominioId: number): void {
  const id = assertCondoId(condominioId);
  const indexPath = getReglamentosIndexPath(id);
  if (fs.existsSync(indexPath)) {
    fs.unlinkSync(indexPath);
  }
  invalidateReglamentosCache(id);
}

export async function buildReglamentosIndex(
  condominioId: number
): Promise<ReglamentoIndex> {
  const id = assertCondoId(condominioId);
  const dir = getCondominioDocumentsDir(id);
  const sourceFiles = listSourceFiles(dir);
  const allChunks: ReglamentoChunk[] = [];

  for (const fileName of sourceFiles) {
    const filePath = path.join(dir, fileName);
    const source = fileName.replace(/\.[^.]+$/, "");

    if (isPdfFile(fileName)) {
      console.log(`[reglamentos] condo-${id} PDF: ${fileName}`);
      const text = await extractPdfText(filePath);
      const chunks = chunkText(text, source, "pdf");
      allChunks.push(...chunks);
      console.log(`[reglamentos] ${fileName}: ${chunks.length} fragmentos`);
      continue;
    }

    const text = await extractImageText(filePath, source);
    const chunks = chunkText(text, source, "image");
    allChunks.push(...chunks);
    console.log(`[reglamentos] ${fileName}: ${chunks.length} fragmento(s)`);
  }

  const index: ReglamentoIndex = {
    generatedAt: Math.floor(Date.now() / 1000),
    condominioId: id,
    sources: sourceFiles,
    chunks: allChunks,
  };

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const indexPath = getReglamentosIndexPath(id);
  fs.writeFileSync(indexPath, JSON.stringify(index), "utf-8");
  indexCache.set(id, index);

  console.log(
    `[reglamentos] Índice condo-${id}: ${allChunks.length} fragmentos → ${indexPath}`
  );

  return index;
}

export function getReglamentosIndexStatus(condominioId: number): {
  lastIndexedAt: number | null;
  chunks: number;
  sources: number;
} {
  const index = loadReglamentosIndex(condominioId);
  if (!index) {
    return { lastIndexedAt: null, chunks: 0, sources: 0 };
  }

  return {
    lastIndexedAt: index.generatedAt,
    chunks: index.chunks.length,
    sources: index.sources.length,
  };
}

export function loadReglamentosIndex(
  condominioId: number
): ReglamentoIndex | null {
  const id = assertCondoId(condominioId);
  if (indexCache.has(id)) {
    return indexCache.get(id) ?? null;
  }

  const indexPath = getReglamentosIndexPath(id);
  if (!fs.existsSync(indexPath)) {
    indexCache.set(id, null);
    return null;
  }

  try {
    const parsed = JSON.parse(
      fs.readFileSync(indexPath, "utf-8")
    ) as ReglamentoIndex;
    const index: ReglamentoIndex = {
      ...parsed,
      condominioId: parsed.condominioId ?? id,
    };
    indexCache.set(id, index);
    return index;
  } catch {
    indexCache.set(id, null);
    return null;
  }
}

export async function ensureReglamentosIndex(
  condominioId: number
): Promise<ReglamentoIndex> {
  const id = assertCondoId(condominioId);
  const dir = getCondominioDocumentsDir(id);
  const currentFiles = listSourceFiles(dir);
  const existing = loadReglamentosIndex(id);

  if (existing && sourcesMatch(existing.sources, currentFiles)) {
    console.log(
      `[reglamentos] Índice condo-${id} cargado (${existing.chunks.length} fragmentos, ${existing.sources.length} archivos)`
    );
    return existing;
  }

  if (currentFiles.length === 0) {
    const empty: ReglamentoIndex = {
      generatedAt: Math.floor(Date.now() / 1000),
      condominioId: id,
      sources: [],
      chunks: [],
    };
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(getReglamentosIndexPath(id), JSON.stringify(empty), "utf-8");
    indexCache.set(id, empty);
    return empty;
  }

  if (existing) {
    console.log(`[reglamentos] condo-${id}: archivos cambiaron — re-indexando...`);
  } else {
    console.log(`[reglamentos] condo-${id}: índice no encontrado — generando...`);
  }

  return buildReglamentosIndex(id);
}

export async function ensureAllCondominioReglamentosIndexes(): Promise<void> {
  const ids = listCondominioIdsWithDocumentFolders();
  for (const id of ids) {
    try {
      await ensureReglamentosIndex(id);
    } catch (err) {
      console.warn(`[reglamentos] No se pudo indexar condo-${id}:`, err);
    }
  }
}

function tokenize(text: string): string[] {
  return getSearchTokens(text);
}

function getTopicSourceChunks(
  condominioId: number,
  topics: ReturnType<typeof detectQueryTopics>
): ReglamentoChunk[] {
  const index = loadReglamentosIndex(condominioId);
  if (!index || topics.length === 0) return [];

  const patterns: RegExp[] = [];
  if (topics.includes("tag") || topics.includes("acceso")) {
    patterns.push(/tag|acceso principal|entrega de tags/i);
  }
  if (topics.includes("alberca")) {
    patterns.push(/alberca|piscina|amenidad/i);
  }
  if (topics.includes("mascota")) {
    patterns.push(/mascota|animal|reglamento/i);
  }
  if (topics.includes("cuota")) {
    patterns.push(/cuota|pago|mantenimiento/i);
  }

  if (patterns.length === 0) return [];

  return index.chunks.filter((chunk) =>
    patterns.some((pattern) => pattern.test(`${chunk.source} ${chunk.text}`))
  );
}

function dedupeChunks(chunks: ReglamentoChunk[]): ReglamentoChunk[] {
  const seen = new Set<string>();
  return chunks.filter((chunk) => {
    if (seen.has(chunk.id)) return false;
    seen.add(chunk.id);
    return true;
  });
}

function scoreChunks(
  query: string,
  condominioId: number
): { chunk: ReglamentoChunk; score: number }[] {
  const index = loadReglamentosIndex(condominioId);
  if (!index || index.chunks.length === 0) return [];

  const baseTokens = tokenize(query);
  const queryTokens = expandTokens(baseTokens);
  const queryHay = normalizeQuery(query);
  const topics = detectQueryTopics(query);

  if (queryTokens.length === 0) {
    return index.chunks.map((chunk) => ({ chunk, score: 1 }));
  }

  const scored = index.chunks
    .map((chunk) => {
      const sourceTokens = tokenize(chunk.source.replace(/[_-]/g, " "));
      const chunkText = normalizeQuery(chunk.text);
      const chunkTokenList = tokenize(chunk.text);
      const chunkTokens = new Set([...chunkTokenList, ...sourceTokens]);
      let score = 0;

      for (const token of queryTokens) {
        if (chunkTokens.has(token)) score += 2;
        if (chunkText.includes(token)) score += 1;
        for (const chunkToken of chunkTokens) {
          if (tokensMatch(token, chunkToken)) score += 2;
        }
      }

      if (queryHay.length >= 8 && chunkText.includes(queryHay.slice(0, 24))) {
        score += 3;
      }

      if (chunk.kind === "image") {
        for (const token of queryTokens) {
          if (sourceTokens.some((st) => tokensMatch(token, st))) score += 3;
        }
      }

      if (
        (topics.includes("tag") || topics.includes("acceso")) &&
        /tag|acceso principal|entrega de tags/i.test(chunk.source)
      ) {
        score += 5;
      }

      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) return scored;

  return index.chunks
    .map((chunk) => {
      const chunkText = normalizeQuery(chunk.text);
      let score = 0;
      for (const token of baseTokens) {
        if (chunkText.includes(token)) score += 1;
      }
      return { chunk, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type ReglamentoMatchLevel = "strong" | "related" | "none";

export function assessReglamentoMatch(
  query: string,
  condominioId: number
): {
  level: ReglamentoMatchLevel;
  topScore: number;
  topics: string[];
  chunks: ReglamentoChunk[];
} {
  const scored = scoreChunks(query, condominioId);
  if (scored.length === 0) {
    return { level: "none", topScore: 0, topics: [], chunks: [] };
  }

  const topScore = scored[0]!.score;
  const chunks = scored.slice(0, 6).map((s) => s.chunk);
  const topics = [
    ...new Set(
      chunks.map((chunk) =>
        chunk.kind === "image" ? `${chunk.source} (aviso)` : chunk.source
      )
    ),
  ].slice(0, 4);

  let level: ReglamentoMatchLevel = "none";
  if (topScore >= 5) level = "strong";
  else if (topScore >= 2) level = "related";

  return { level, topScore, topics, chunks };
}

export function getContextChunkLimit(
  query: string,
  condominioId: number
): number {
  const match = assessReglamentoMatch(query, condominioId);
  // Pocos fragmentos: el modelo responde puntual; el resto se ofrece si piden más.
  if (match.level === "strong") return 3;
  if (match.level === "related") return 2;
  return 2;
}

export function searchReglamentos(
  query: string,
  condominioId: number,
  limit?: number
): ReglamentoChunk[] {
  const chunkLimit = limit ?? getContextChunkLimit(query, condominioId);
  const topics = detectQueryTopics(query);
  const topicChunks = getTopicSourceChunks(condominioId, topics);
  const ranked = scoreChunks(query, condominioId).map((item) => item.chunk);
  const merged = dedupeChunks([...topicChunks, ...ranked]);
  return merged.slice(0, chunkLimit);
}

export function getReglamentoSourceLabels(
  query: string,
  condominioId: number,
  limit = 6
): string[] {
  const chunks = searchReglamentos(query, condominioId, limit);
  const labels = chunks.map((chunk) =>
    chunk.kind === "image" ? `${chunk.source} (aviso)` : chunk.source
  );
  return [...new Set(labels)];
}

export function buildReglamentoContext(
  query: string,
  condominioId: number
): string {
  const chunks = searchReglamentos(query, condominioId);
  if (chunks.length === 0) return "";

  return chunks
    .map((chunk) => {
      const label =
        chunk.kind === "image"
          ? `${chunk.source} (aviso/imagen)`
          : chunk.source;
      return `### ${label}\n${chunk.text.trim()}`;
    })
    .join("\n\n---\n\n");
}

export function hasReglamentoContext(
  query: string,
  condominioId: number
): boolean {
  return searchReglamentos(query, condominioId, 3).length > 0;
}
