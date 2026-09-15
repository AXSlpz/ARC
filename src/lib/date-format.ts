/** Convierte DD/MM/AAAA → AAAA-MM-DD (para input type="date"). */
export function ddmmyyyyToIso(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return "";
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/** Convierte AAAA-MM-DD → DD/MM/AAAA (formato mexicano). */
export function isoToDdmmyyyy(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  const [yyyy, mm, dd] = parts;
  if (!dd || !mm || !yyyy) return null;
  return `${dd.padStart(2, "0")}/${mm.padStart(2, "0")}/${yyyy}`;
}
