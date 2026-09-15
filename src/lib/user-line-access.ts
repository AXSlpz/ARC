import db from "./db-connection";

export function listWaLineIds(): number[] {
  const rows = db
    .prepare("SELECT id FROM wa_lines ORDER BY sort_order ASC, id ASC")
    .all() as { id: number }[];
  if (rows.length > 0) return rows.map((r) => r.id);
  return [1];
}

export function parseAllowedLineIds(raw: string | null | undefined): number[] {
  if (!raw) return listWaLineIds();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return listWaLineIds();
    const ids = parsed
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    return ids.length > 0 ? ids : listWaLineIds();
  } catch {
    return listWaLineIds();
  }
}

export function serializeAllowedLineIds(lineIds: number[]): string {
  const valid = new Set(listWaLineIds());
  const normalized = [...new Set(lineIds)].filter((id) => valid.has(id)).sort();
  if (normalized.length === 0) {
    throw new Error("Debe seleccionar al menos una línea");
  }
  return JSON.stringify(normalized);
}

export function getUserAllowedLineIds(
  userId: number,
  role?: string
): number[] | null {
  if (role === "admin" || role === "super_admin") return null;

  const row = db
    .prepare("SELECT role, allowed_line_ids FROM admin_users WHERE id = ?")
    .get(userId) as { role: string; allowed_line_ids: string | null } | undefined;

  if (!row) return [];
  if (row.role === "admin" || row.role === "super_admin") return null;
  return parseAllowedLineIds(row.allowed_line_ids);
}
