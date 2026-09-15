import path from "node:path";
import fs from "node:fs";

function loadEnvFile(filePath: string, overwrite: boolean): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (overwrite || !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Production: `.env`. Local: `.env.local` overrides when both exist.
loadEnvFile(path.resolve(process.cwd(), ".env"), false);
loadEnvFile(path.resolve(process.cwd(), ".env.local"), true);
