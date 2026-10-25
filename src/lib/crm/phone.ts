/** Dígitos del teléfono para UNIQUE (colapsa variantes MX 52 / 521). */
export function normalizeProspectoPhone(input: string | null | undefined): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("521")) return digits.slice(3);
  if (digits.length === 12 && digits.startsWith("52")) return digits.slice(2);
  return digits;
}

export function isValidProspectoPhone(normalized: string): boolean {
  return /^\d{10,15}$/.test(normalized);
}
