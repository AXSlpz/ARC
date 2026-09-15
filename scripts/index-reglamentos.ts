import "./env-loader.js";
import { buildReglamentosIndex } from "../src/lib/reglamentos.js";

function parseCondominioId(argv: string[]): number {
  for (const arg of argv) {
    if (arg.startsWith("--condominio-id=")) {
      const value = Number(arg.slice("--condominio-id=".length));
      if (Number.isInteger(value) && value > 0) return value;
    }
  }
  const idx = argv.indexOf("--condominio-id");
  if (idx >= 0 && argv[idx + 1]) {
    const value = Number(argv[idx + 1]);
    if (Number.isInteger(value) && value > 0) return value;
  }
  throw new Error(
    "Uso: tsx scripts/index-reglamentos.ts --condominio-id=<id>"
  );
}

const condominioId = parseCondominioId(process.argv.slice(2));
await buildReglamentosIndex(condominioId);
