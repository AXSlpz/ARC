export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/\s+/g, "-");
}

export const PRODUCT_UNITS = [
  "pza",
  "m",
  "cm",
  "mm",
  "kg",
  "g",
  "L",
  "ml",
  "m2",
  "m3",
  "hr",
  "dia",
  "mes",
  "caja",
  "tarima",
  "paquete",
  "rollo",
  "par",
  "docena",
  "kit",
  "juego",
  "servicio",
] as const;

export type ProductUnit = (typeof PRODUCT_UNITS)[number];

const UNIT_ALIASES: Record<string, ProductUnit> = {
  pza: "pza",
  pz: "pza",
  pieza: "pza",
  piezas: "pza",
  piece: "pza",
  pieces: "pza",
  unit: "pza",
  m: "m",
  metro: "m",
  metros: "m",
  meter: "m",
  meters: "m",
  cm: "cm",
  centimetro: "cm",
  centimetros: "cm",
  mm: "mm",
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogramo: "kg",
  kilogramos: "kg",
  g: "g",
  gr: "g",
  gramo: "g",
  gramos: "g",
  l: "L",
  lt: "L",
  litro: "L",
  litros: "L",
  liter: "L",
  liters: "L",
  ml: "ml",
  m2: "m2",
  m3: "m3",
  hr: "hr",
  hora: "hr",
  horas: "hr",
  hour: "hr",
  hours: "hr",
  dia: "dia",
  dias: "dia",
  day: "dia",
  days: "dia",
  mes: "mes",
  meses: "mes",
  month: "mes",
  months: "mes",
  caja: "caja",
  cajas: "caja",
  box: "caja",
  boxes: "caja",
  tarima: "tarima",
  tarimas: "tarima",
  pallet: "tarima",
  paquete: "paquete",
  paquetes: "paquete",
  pack: "paquete",
  package: "paquete",
  rollo: "rollo",
  rollos: "rollo",
  roll: "rollo",
  par: "par",
  pares: "par",
  pair: "par",
  docena: "docena",
  docenas: "docena",
  dozen: "docena",
  kit: "kit",
  kits: "kit",
  juego: "juego",
  juegos: "juego",
  set: "juego",
  servicio: "servicio",
  servicios: "servicio",
  service: "servicio",
};

export function isProductUnit(value: string): value is ProductUnit {
  return (PRODUCT_UNITS as readonly string[]).includes(value);
}

export function parseProductUnit(value: string | null | undefined): ProductUnit {
  const raw = (value ?? "").trim();
  if (!raw) return "pza";
  if (isProductUnit(raw)) return raw;
  const alias = UNIT_ALIASES[raw.toLowerCase()];
  return alias ?? "pza";
}

export function unitsForSelect(current?: string | null): string[] {
  const extra = (current ?? "").trim();
  if (extra && !isProductUnit(extra) && parseProductUnit(extra) === "pza") {
    return [extra, ...PRODUCT_UNITS];
  }
  return [...PRODUCT_UNITS];
}

export const PRODUCT_STATUSES = ["active", "inactive", "discontinued"] as const;

export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

const STATUS_ALIASES: Record<string, ProductStatus> = {
  active: "active",
  activo: "active",
  activa: "active",
  inactive: "inactive",
  inactivo: "inactive",
  inactiva: "inactive",
  discontinued: "discontinued",
  descontinuado: "discontinued",
  descontinuada: "discontinued",
  archived: "discontinued",
};

export function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value);
}

export function parseProductStatus(
  value: string | null | undefined,
  active?: boolean,
): ProductStatus {
  const raw = (value ?? "").trim();
  if (raw) {
    if (isProductStatus(raw)) return raw;
    const alias = STATUS_ALIASES[raw.toLowerCase()];
    if (alias) return alias;
  }
  if (active === false) return "inactive";
  return "active";
}

export function statusToActive(status: ProductStatus): boolean {
  return status === "active";
}

export function isSellableProduct(product: {
  active?: boolean;
  status?: string | null;
}): boolean {
  if (product.status) {
    return parseProductStatus(product.status, product.active) === "active";
  }
  return product.active !== false;
}

const MAX_UNIT_PRICE = 9_999_999_999.99;

export function isValidUnitPrice(value: unknown): boolean {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_UNIT_PRICE) {
    return false;
  }
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}

export type PriceListLike = {
  is_default: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
};

export function isPriceListCurrent(
  list: Pick<PriceListLike, "valid_from" | "valid_until">,
  asOf = new Date(),
): boolean {
  const day = asOf.toISOString().slice(0, 10);
  if (list.valid_from && list.valid_from > day) return false;
  if (list.valid_until && list.valid_until < day) return false;
  return true;
}

export function pickDefaultPriceList<T extends PriceListLike>(
  lists: T[],
  asOf = new Date(),
): T | null {
  if (lists.length === 0) return null;
  const current = lists.filter((list) => isPriceListCurrent(list, asOf));
  const defaultCurrent = current.find((list) => list.is_default);
  if (defaultCurrent) return defaultCurrent;
  const anyDefault = lists.find((list) => list.is_default);
  if (anyDefault) return anyDefault;
  return current[0] ?? lists[0] ?? null;
}
