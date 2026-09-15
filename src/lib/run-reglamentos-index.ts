import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  invalidateReglamentosCache,
  loadReglamentosIndex,
} from "./reglamentos";

export interface ReglamentosIndexResult {
  chunks: number;
  sources: number;
  generatedAt: number;
  condominioId: number;
}

function resolveTsxBin(): string {
  const local = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  return fs.existsSync(local) ? local : "tsx";
}

export function runReglamentosIndexCli(
  condominioId: number
): Promise<ReglamentosIndexResult> {
  if (!Number.isInteger(condominioId) || condominioId <= 0) {
    return Promise.reject(new Error("condominioId inválido"));
  }

  invalidateReglamentosCache(condominioId);

  const script = path.join(process.cwd(), "scripts", "index-reglamentos.ts");
  const tsx = resolveTsxBin();

  return new Promise((resolve, reject) => {
    const child = spawn(
      tsx,
      [script, `--condominio-id=${condominioId}`],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stderr = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() ||
              `La indexación terminó con código ${code ?? "desconocido"}`
          )
        );
        return;
      }

      invalidateReglamentosCache(condominioId);
      const index = loadReglamentosIndex(condominioId);

      if (!index) {
        reject(new Error("No se generó el índice de documentos"));
        return;
      }

      resolve({
        chunks: index.chunks.length,
        sources: index.sources.length,
        generatedAt: index.generatedAt,
        condominioId,
      });
    });
  });
}
