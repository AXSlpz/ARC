import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import {
  getOrCreateCondominio,
  importResidentesTx,
  type ResidenteInput,
} from "@/lib/residentes";
import { getOrCreatePrototipo } from "@/lib/prototipos";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const HEADER_MAP: Record<
  string,
  keyof ResidenteInput | "_condominio" | "_prefijo" | "_prototipo"
> = {
  "condominio / fraccionamiento": "_condominio",
  "condominio": "_condominio",
  "fraccionamiento": "_condominio",
  "prefijo": "_prefijo",
  "num° vivienda": "num_vivienda",
  "num vivienda": "num_vivienda",
  "vivienda": "num_vivienda",
  "num° coto": "num_coto",
  "num coto": "num_coto",
  "coto": "num_coto",
  "cf property id": "cf_property_id",
  "cf_property_id": "cf_property_id",
  "property id cf": "cf_property_id",
  "property_id": "cf_property_id",
  "prototipo": "_prototipo",
  "nombre": "nombre",
  "celular": "celular",
  "email": "email",
  "correo": "email",
  "fecha entrega": "fecha_entrega",
  "m²": "metros_cuadrados",
  "m2": "metros_cuadrados",
  "metros": "metros_cuadrados",
  "cuota int": "cuota_int",
  "cuota ext": "cuota_ext",
  "cuota completa": "cuota_completa",
  "cuota int (pronpago)": "cuota_int_pronpago",
  "cuota ext (pronpago)": "cuota_ext_pronpago",
  "cuota comp (pronpago)": "cuota_comp_pronpago",
  "servicio luz": "servicio_luz",
  "nombre cont1": "nombre_contacto1",
  "celular cont1": "celular_contacto1",
  "parentesco cont1": "parentesco_contacto1",
  "parentezco cont1": "parentesco_contacto1",
  "nombre cont2": "nombre_contacto2",
  "celular cont2": "celular_contacto2",
  "parentesco cont2": "parentesco_contacto2",
  "nombre cont3": "nombre_contacto3",
  "celular cont3": "celular_contacto3",
  "parentesco cont3": "parentesco_contacto3",
  "mes de pago": "mes_pago",
  "mes pago": "mes_pago",
  "nombre expropietario": "nombre_expropietario",
  "cell expropietario": "celular_expropietario",
  "celular expropietario": "celular_expropietario",
  "fecha entrega 1er": "fecha_entrega_primer",
  "estatus tag 1": "tag1_estatus",
  "tag id 1": "tag1_id",
  "placa tag 1": "tag1_placa",
  "modelo tag 1": "tag1_modelo",
  "color tag 1": "tag1_color",
  "estatus tag 2": "tag2_estatus",
  "tag id 2": "tag2_id",
  "placa tag 2": "tag2_placa",
  "modelo tag 2": "tag2_modelo",
  "color tag 2": "tag2_color",
};

function parseCsvLine(line: string): string[] {
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

function parseNumeric(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,\s]/g, "");
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (!file.name.endsWith(".csv")) {
    return NextResponse.json({ error: "Solo archivos CSV" }, { status: 400 });
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length < 2) {
    return NextResponse.json(
      { error: "El archivo debe tener al menos un encabezado y una fila de datos" },
      { status: 400 }
    );
  }

  const headers = parseCsvLine(lines[0]);
  const colMap: (
    | keyof ResidenteInput
    | "_condominio"
    | "_prefijo"
    | "_prototipo"
    | null
  )[] = headers.map((h) => HEADER_MAP[h.toLowerCase().trim()] ?? null);

  const hasCondominio = colMap.includes("_condominio");
  const hasNombre = colMap.includes("nombre");

  if (!hasCondominio || !hasNombre) {
    return NextResponse.json(
      { error: "El CSV debe incluir al menos las columnas: Condominio/Fraccionamiento y Nombre" },
      { status: 400 }
    );
  }

  const numericFields = new Set<keyof ResidenteInput>([
    "num_vivienda", "celular", "metros_cuadrados",
    "cuota_int", "cuota_ext", "cuota_completa",
    "cuota_int_pronpago", "cuota_ext_pronpago", "cuota_comp_pronpago",
    "servicio_luz", "celular_contacto1", "celular_contacto2", "celular_contacto3",
    "celular_expropietario", "tag1_id", "tag2_id",
  ]);

  const rows: ResidenteInput[] = [];
  const parseErrors: { row: number; message: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const record: Record<string, unknown> = {};
    let condominioName = "";
    let prefijo = "";
    let prototipoName = "";

    for (let j = 0; j < colMap.length; j++) {
      const col = colMap[j];
      if (!col) continue;
      const val = cells[j] ?? "";

      if (col === "_condominio") {
        condominioName = val;
      } else if (col === "_prefijo") {
        prefijo = val;
      } else if (col === "_prototipo") {
        prototipoName = val.trim();
      } else if (numericFields.has(col)) {
        record[col] = parseNumeric(val);
      } else {
        record[col] = val || null;
      }
    }

    if (!condominioName) {
      parseErrors.push({ row: i + 1, message: "Condominio vacío" });
      continue;
    }
    if (!record.nombre) {
      parseErrors.push({ row: i + 1, message: "Nombre vacío" });
      continue;
    }

    try {
      const condo = getOrCreateCondominio(condominioName, prefijo || undefined);
      record.condominio_id = condo.id;
      if (prototipoName) {
        record.prototipo_id = getOrCreatePrototipo(condo.id, prototipoName).id;
      }
      rows.push(record as unknown as ResidenteInput);
    } catch {
      parseErrors.push({ row: i + 1, message: "Error al procesar condominio" });
    }
  }

  const result = importResidentesTx(rows);

  logAudit(auth.id, auth.username, "residente.import", "residente", null, {
    fileName: file.name,
    totalRows: lines.length - 1,
    inserted: result.inserted,
    errors: result.errors.length + parseErrors.length,
  });

  return NextResponse.json({
    inserted: result.inserted,
    errors: [...parseErrors, ...result.errors],
    totalRows: lines.length - 1,
  });
}
