/**
 * Importación CSV de viviendas para el catálogo del portal.
 *
 * Diseño:
 *  - Las viviendas se representan como residentes "placeholder" con solo
 *    num_vivienda y condominio_id, sin PII (nombre genérico, sin email/celular).
 *  - Un placeholder NUNCA sobrescribe un residente con datos reales (nombre
 *    no genérico, o email/celular presentes).
 *  - Vincula el condominio al desarrollo en development_condominios.
 *
 * Formato CSV:
 *   development_id,condominio_id,num_vivienda
 *   5,12,101
 *   5,12,102
 *
 * Invariantes:
 *  - Si ya existe un residente en (condo_id, num_vivienda), se salta la fila.
 *  - El placeholder se crea con nombre="Vivienda-{num}", email=NULL, celular=NULL.
 *  - No expone PII en ninguna función pública de este módulo.
 */

import db from "../db-connection";
import { initRegistrationAdminSchema } from "./schema-registration-admin";
import { linkCondominioToDevelopment } from "./catalog";

initRegistrationAdminSchema();

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface CsvRowValid {
  developmentId: number;
  condominioId: number;
  numVivienda: number;
  /** Número de fila (1-indexed, incluyendo header) para reporte de errores tardíos. */
  rowNum: number;
  /** Contenido original de la fila CSV. */
  line: string;
}

export interface CsvRowError {
  row: number;
  /** Contenido original de la línea que causó el error. */
  line?: string;
  message: string;
}

export interface CsvPreviewResult {
  totalRows: number;
  valid: CsvRowValid[];
  errors: CsvRowError[];
}

export interface CsvImportResult {
  totalRows: number;
  inserted: number;
  skipped: number;
  errors: CsvRowError[];
}

// ── Plantilla CSV (sin PII) ────────────────────────────────────────────────────

const TEMPLATE_HEADERS = ["development_id", "condominio_id", "num_vivienda"];

/**
 * Retorna la línea de encabezados del CSV de plantilla.
 * Solo incluye campos de identificación de vivienda, sin PII.
 */
export function getViviendasCsvTemplate(): string {
  return `${TEMPLATE_HEADERS.join(",")}\n# Ejemplo:\n# 1,3,101\n# 1,3,102\n`;
}

// ── Parseo CSV ─────────────────────────────────────────────────────────────────

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseRows(
  csv: string
): { headers: string[]; dataLines: string[] } | { error: string } {
  if (!csv?.trim()) {
    return { error: "El archivo CSV está vacío." };
  }

  // Filtrar líneas de comentario (#) y vacías
  const lines = csv
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"));

  if (lines.length < 1) {
    return { error: "El archivo CSV no tiene contenido." };
  }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().trim());

  const devCol = headers.indexOf("development_id");
  const condoCol = headers.indexOf("condominio_id");
  const vivCol = headers.indexOf("num_vivienda");

  if (devCol === -1 || condoCol === -1 || vivCol === -1) {
    return {
      error: `Encabezados requeridos: development_id, condominio_id, num_vivienda. Encontrados: ${headers.join(", ")}`,
    };
  }

  return { headers, dataLines: lines.slice(1) };
}

// ── Preview (no inserta) ───────────────────────────────────────────────────────

/**
 * Analiza el CSV y retorna las filas válidas e inválidas SIN insertar nada.
 * Útil para mostrar una vista previa al usuario antes de confirmar la importación.
 */
export function previewViviendasCsv(csv: string): CsvPreviewResult {
  const parsed = parseRows(csv);
  if ("error" in parsed) {
    return {
      totalRows: 0,
      valid: [],
      errors: [{ row: 0, message: parsed.error }],
    };
  }

  const headers = parseLine(
    csv
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"))[0] ?? ""
  ).map((h) => h.toLowerCase().trim());

  const devCol = headers.indexOf("development_id");
  const condoCol = headers.indexOf("condominio_id");
  const vivCol = headers.indexOf("num_vivienda");

  const { dataLines } = parsed;
  const valid: CsvRowValid[] = [];
  const errors: CsvRowError[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const cells = parseLine(line);
    const rowNum = i + 2; // 1-indexed, +1 for header

    const developmentId = parseInt(cells[devCol] ?? "", 10);
    const condominioId = parseInt(cells[condoCol] ?? "", 10);
    const numVivienda = parseInt(cells[vivCol] ?? "", 10);

    if (isNaN(developmentId) || developmentId <= 0) {
      errors.push({ row: rowNum, line, message: "development_id inválido" });
      continue;
    }
    if (isNaN(condominioId) || condominioId <= 0) {
      errors.push({ row: rowNum, line, message: "condominio_id inválido" });
      continue;
    }
    if (isNaN(numVivienda) || numVivienda <= 0) {
      errors.push({ row: rowNum, line, message: "num_vivienda inválido o vacío" });
      continue;
    }

    valid.push({ developmentId, condominioId, numVivienda, rowNum, line });
  }

  return { totalRows: dataLines.length, valid, errors };
}

// ── Importación real ──────────────────────────────────────────────────────────

const PLACEHOLDER_PREFIX = "Vivienda-";

function isPlaceholder(nombre: string): boolean {
  return nombre.startsWith(PLACEHOLDER_PREFIX);
}

/**
 * Importa viviendas desde un CSV.
 *
 * Por cada fila válida:
 *   1. Si ya existe un residente con datos reales en (condo_id, num_vivienda) → skip.
 *   2. Si ya existe un placeholder → skip (idempotente).
 *   3. Si no existe → crea placeholder: nombre="Vivienda-{num}", sin PII.
 *   4. Vincula condominio al desarrollo (idempotente).
 */
export function importViviendasFromCsv(csv: string): CsvImportResult {
  const preview = previewViviendasCsv(csv);

  if (preview.valid.length === 0 && preview.totalRows === 0) {
    return {
      totalRows: 0,
      inserted: 0,
      skipped: 0,
      errors: preview.errors,
    };
  }

  let inserted = 0;
  let skipped = 0;
  const errors: CsvRowError[] = [...preview.errors];

  const tx = db.transaction(() => {
    for (const row of preview.valid) {
      const { developmentId, condominioId, numVivienda, rowNum, line: csvLine } = row;

      // Verificar que el condominio existe
      const condoExists = db
        .prepare("SELECT id FROM condominios WHERE id = ?")
        .get(condominioId) as { id: number } | undefined;
      if (!condoExists) {
        errors.push({
          row: rowNum,
          line: csvLine,
          message: `Condominio ${condominioId} no existe`,
        });
        skipped++;
        continue;
      }

      // Verificar si ya existe un residente en esa vivienda
      const existing = db
        .prepare(
          "SELECT id, nombre, email, celular FROM residentes WHERE condominio_id = ? AND num_vivienda = ?"
        )
        .get(condominioId, numVivienda) as
        | { id: number; nombre: string; email: string | null; celular: number | null }
        | undefined;

      if (existing) {
        // Si tiene datos reales (no es placeholder), skip sin modificar
        if (!isPlaceholder(existing.nombre) || existing.email || existing.celular) {
          skipped++;
          continue;
        }
        // Ya es placeholder, también skip (idempotente)
        skipped++;
        continue;
      }

      // Crear placeholder sin PII.
      // pendiente_asignacion=1 indica que este residente fue creado como
      // placeholder y aún no tiene propietario verificado.
      try {
        db.prepare(
          `INSERT INTO residentes (condominio_id, nombre, num_vivienda, pendiente_asignacion)
           VALUES (?, ?, ?, 1)`
        ).run(condominioId, `${PLACEHOLDER_PREFIX}${numVivienda}`, numVivienda);
        inserted++;

        // Vincular condominio al desarrollo (idempotente)
        linkCondominioToDevelopment(developmentId, condominioId);
      } catch (err) {
        errors.push({
          row: rowNum,
          line: csvLine,
          message: err instanceof Error ? err.message : "Error al insertar",
        });
      }
    }
  });

  tx();

  return {
    totalRows: preview.totalRows,
    inserted,
    skipped,
    errors,
  };
}
