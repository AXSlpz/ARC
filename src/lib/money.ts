const DEFAULT_CURRENCY = "MXN";
const MAX_INTEGER_DIGITS = 12;

/** `$1,850.00` en es-MX, siempre con 2 decimales y símbolo de pesos. */
export function formatMxn(value: number, currency = DEFAULT_CURRENCY): string {
  const amount = Number.isFinite(value) ? value : 0;
  const code = (currency || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function splitMxnAmount(value: number): { integer: string; fraction: string } {
  const cents = Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100);
  return {
    integer: String(Math.floor(cents / 100)),
    fraction: String(cents % 100).padStart(2, "0"),
  };
}

export function appendMoneyDigit(
  integer: string,
  fraction: string,
  digit: string,
  intoCents: boolean,
  centsCount = 0,
): { integer: string; fraction: string; centsCount: number } {
  if (!/^\d$/.test(digit)) {
    return { integer: normalizeIntegerDigits(integer), fraction, centsCount };
  }
  if (intoCents) {
    if (centsCount <= 0) {
      return {
        integer: normalizeIntegerDigits(integer),
        fraction: `${digit}0`,
        centsCount: 1,
      };
    }
    if (centsCount === 1) {
      return {
        integer: normalizeIntegerDigits(integer),
        fraction: `${fraction[0] ?? "0"}${digit}`,
        centsCount: 2,
      };
    }
    return {
      integer: normalizeIntegerDigits(integer),
      fraction: (fraction + "00").slice(0, 2),
      centsCount: 2,
    };
  }
  const next = `${integer === "0" ? "" : integer}${digit}`;
  return {
    integer: normalizeIntegerDigits(next),
    fraction: (fraction + "00").slice(0, 2),
    centsCount: 0,
  };
}

export function backspaceMoney(
  integer: string,
  fraction: string,
  intoCents: boolean,
  centsCount = 0,
): { integer: string; fraction: string; centsCount: number } {
  if (intoCents && centsCount > 0) {
    if (centsCount === 1) {
      return { integer: normalizeIntegerDigits(integer), fraction: "00", centsCount: 0 };
    }
    return {
      integer: normalizeIntegerDigits(integer),
      fraction: `${fraction[0] ?? "0"}0`,
      centsCount: 1,
    };
  }
  if (integer.length <= 1) {
    return { integer: "0", fraction: (fraction + "00").slice(0, 2), centsCount: 0 };
  }
  return {
    integer: normalizeIntegerDigits(integer.slice(0, -1)),
    fraction: (fraction + "00").slice(0, 2),
    centsCount: 0,
  };
}

export function composeMxnAmount(integer: string, fraction: string): number {
  const whole = normalizeIntegerDigits(integer);
  const cents = (fraction.replace(/\D/g, "") + "00").slice(0, 2);
  const amount = Number(whole) + Number(cents) / 100;
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
}

/**
 * Reescribe lo tecleado a pesos mexicanos en vivo:
 * comas de miles, punto decimal y dos centavos.
 */
export function reconcileLiveMxn(
  prevInteger: string,
  prevFraction: string,
  nextRaw: string,
  editingCents = false,
): { integer: string; fraction: string } {
  const before = digitsBeforeDecimal(nextRaw);
  const after = digitsAfterDecimal(nextRaw);
  const rawDigits = nextRaw.replace(/\D/g, "");

  if (!rawDigits) {
    return { integer: "0", fraction: "00" };
  }

  if (editingCents) {
    return {
      integer: normalizeIntegerDigits(prevInteger),
      fraction: (after.slice(0, 2) + "00").slice(0, 2),
    };
  }

  if (!nextRaw.includes(".")) {
    return {
      integer: normalizeIntegerDigits(rawDigits),
      fraction: "00",
    };
  }

  let integer = normalizeIntegerDigits(before);
  let fraction = prevFraction;

  if (after.length > 2) {
    integer = normalizeIntegerDigits(before + after.slice(0, after.length - 2));
    fraction = after.slice(-2);
  } else if (after.length > 0) {
    fraction = (after + "00").slice(0, 2);
  }

  return { integer, fraction };
}

/**
 * Acepta `$1,850.00`, `1850.5`, `1.850,00` y texto con símbolo.
 * Vacío o inválido → `null`.
 */
export function parseMoneyInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/[^\d.,\-]/g, "");
  if (!digits || digits === "-" || digits === "." || digits === ",") return null;

  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      digits = digits.replace(/\./g, "").replace(",", ".");
    } else {
      digits = digits.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    const fraction = digits.length - lastComma - 1;
    if (fraction === 1 || fraction === 2) {
      digits = digits.replace(/,/g, ".");
    } else {
      digits = digits.replace(/,/g, "");
    }
  } else if ((digits.match(/\./g) || []).length > 1) {
    digits = digits.replace(/\./g, "");
  }

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function digitsBeforeDecimal(raw: string): string {
  const dot = raw.lastIndexOf(".");
  const before = dot >= 0 ? raw.slice(0, dot) : raw;
  return before.replace(/\D/g, "");
}

function digitsAfterDecimal(raw: string): string {
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return "";
  return raw.slice(dot + 1).replace(/\D/g, "");
}

function normalizeIntegerDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "0";
  return digits.slice(0, MAX_INTEGER_DIGITS);
}
