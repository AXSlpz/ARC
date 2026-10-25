/**
 * Campos de la credencial para votar y reglas de comparación.
 * No consulta la lista nominal. No lee ni guarda OCR ni CIC.
 */

export interface IneFields {
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  nombreCompleto: string;
  fechaNacimiento: string;
  curp: string;
  anioVencimiento: number;
  claveElector: string;
  expired: boolean;
}

export interface IneFieldIssue {
  field: string;
  side: "frente" | "reverso";
}

/** Lo que se alcanzó a leer. Puede venir incompleto para que la persona lo corrija. */
export interface IneDraft {
  apellidoPaterno: string;
  apellidoMaterno: string;
  nombres: string;
  nombreCompleto: string;
  fechaNacimiento: string;
  curp: string;
  anioVencimiento: string;
  claveElector: string;
}

export function emptyIneDraft(): IneDraft {
  return {
    apellidoPaterno: "",
    apellidoMaterno: "",
    nombres: "",
    nombreCompleto: "",
    fechaNacimiento: "",
    curp: "",
    anioVencimiento: "",
    claveElector: "",
  };
}

const CURP = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
const CLAVE = /^[A-Z0-9]{18}$/;

function clean(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBirth(value: string): string | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  if (year < 1900 || year > new Date().getFullYear()) return null;
  return `${match[1]}/${match[2]}/${match[3]}`;
}

export function draftIneFields(raw: Record<string, unknown>): {
  draft: IneDraft;
  issues: IneFieldIssue[];
} {
  const apellidoPaterno = clean(raw.apellidoPaterno).toUpperCase();
  const apellidoMaterno = clean(raw.apellidoMaterno).toUpperCase();
  const nombres = clean(raw.nombres).toUpperCase();
  const fechaRaw = clean(raw.fechaNacimiento);
  const fechaNacimiento = parseBirth(fechaRaw) ?? fechaRaw;
  const curp = clean(raw.curp).toUpperCase();
  const claveElector = clean(raw.claveElector).toUpperCase();
  const yearDigits = String(raw.anioVencimiento ?? "").replace(/\D/g, "").slice(0, 4);
  const issues: IneFieldIssue[] = [];
  if (apellidoPaterno.length < 2 || nombres.length < 2) {
    issues.push({ field: "nombre", side: "frente" });
  }
  if (!parseBirth(fechaNacimiento)) {
    issues.push({ field: "fecha de nacimiento", side: "frente" });
  }
  if (!CURP.test(curp)) issues.push({ field: "CURP", side: "frente" });
  if (!CLAVE.test(claveElector.replace(/[^A-Z0-9]/g, ""))) {
    issues.push({ field: "clave de elector", side: "frente" });
  }
  const year = Number(yearDigits);
  if (!Number.isInteger(year) || year < 2015 || year > 2045) {
    issues.push({ field: "vigencia", side: "frente" });
  }
  const nombreCompleto = [apellidoPaterno, apellidoMaterno, nombres]
    .filter((part) => part.length > 0)
    .join(" ");
  return {
    draft: {
      apellidoPaterno,
      apellidoMaterno,
      nombres,
      nombreCompleto,
      fechaNacimiento,
      curp,
      anioVencimiento: yearDigits,
      claveElector,
    },
    issues,
  };
}

export function parseIneFields(raw: Record<string, unknown>): {
  fields: IneFields | null;
  issues: IneFieldIssue[];
} {
  const issues: IneFieldIssue[] = [];
  const apellidoPaterno = clean(raw.apellidoPaterno).toUpperCase();
  const apellidoMaterno = clean(raw.apellidoMaterno).toUpperCase();
  const nombres = clean(raw.nombres).toUpperCase();
  const fechaNacimiento = parseBirth(clean(raw.fechaNacimiento));
  const curp = clean(raw.curp).toUpperCase();
  const claveElector = clean(raw.claveElector).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const year = Number(String(raw.anioVencimiento ?? "").replace(/\D/g, "").slice(0, 4));

  if (apellidoPaterno.length < 2 || nombres.length < 2) {
    issues.push({ field: "nombre", side: "frente" });
  }
  if (!fechaNacimiento) issues.push({ field: "fecha de nacimiento", side: "frente" });
  if (!CURP.test(curp)) issues.push({ field: "CURP", side: "frente" });
  if (!CLAVE.test(claveElector)) issues.push({ field: "clave de elector", side: "frente" });
  if (!Number.isInteger(year) || year < 2015 || year > 2045) {
    issues.push({ field: "vigencia", side: "frente" });
  }

  if (issues.length > 0) return { fields: null, issues };

  const nombreCompleto = [apellidoPaterno, apellidoMaterno, nombres]
    .filter((part) => part.length > 0)
    .join(" ");

  return {
    fields: {
      apellidoPaterno,
      apellidoMaterno,
      nombres,
      nombreCompleto,
      fechaNacimiento: fechaNacimiento!,
      curp,
      anioVencimiento: year,
      claveElector,
      expired: year < new Date().getFullYear(),
    },
    issues: [],
  };
}

/** El nombre escrito trae las mismas palabras que el nombre guardado, sin importar el orden. */
export function namesMatch(stored: string, typed: string): boolean {
  const words = (value: string) =>
    normalizePersonName(value).split(" ").filter((part) => part.length > 0).sort();
  const left = words(stored);
  const right = words(typed);
  return left.length >= 2 && left.join(" ") === right.join(" ");
}

export function fieldsFromManualEntry(
  input: {
    nombre: string;
    fechaNacimiento: string;
    curp: string;
    anioVencimiento: string;
    claveElector: string;
  },
  stored: IneFields
): { fields: IneFields | null; error: string } {
  if (!namesMatch(stored.nombreCompleto, input.nombre)) {
    return { fields: null, error: "El nombre no coincide con la INE guardada." };
  }
  const parsed = parseIneFields({
    apellidoPaterno: stored.apellidoPaterno,
    apellidoMaterno: stored.apellidoMaterno,
    nombres: stored.nombres,
    fechaNacimiento: input.fechaNacimiento,
    curp: input.curp,
    anioVencimiento: input.anioVencimiento,
    claveElector: input.claveElector,
  });
  if (!parsed.fields) {
    const names = parsed.issues.map((issue) => issue.field).join(", ");
    return { fields: null, error: `Revisa estos datos: ${names}.` };
  }
  if (parsed.fields.expired) {
    return {
      fields: null,
      error: `La vigencia ${parsed.fields.anioVencimiento} está vencida. El año debe ser el actual o uno posterior.`,
    };
  }
  return { fields: parsed.fields, error: "" };
}

export function samePerson(current: IneFields, next: IneFields): boolean {
  return (
    normalizePersonName(current.nombreCompleto) ===
      normalizePersonName(next.nombreCompleto) &&
    current.curp === next.curp &&
    current.fechaNacimiento === next.fechaNacimiento
  );
}

export function sameCredential(current: IneFields, next: IneFields): boolean {
  return (
    samePerson(current, next) &&
    current.claveElector === next.claveElector &&
    current.anioVencimiento === next.anioVencimiento
  );
}

export function readStoredIneFields(metadata: Record<string, unknown> | null): IneFields | null {
  if (!metadata) return null;
  return parseIneFields(metadata).fields;
}
