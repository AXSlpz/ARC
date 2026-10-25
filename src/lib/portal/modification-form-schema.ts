/**
 * Esquema de campos técnicos y documentos requeridos por tipo de modificación.
 *
 * Fiel a los PDFs de catálogo de Capital Sur y Terrasoles.
 * Los slugs corresponden 1:1 con modification_catalog.slug en la DB.
 *
 * Regla: carta_no_adeudo es obligatoria en TODAS las solicitudes.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type WizardFieldType =
  | "text"
  | "number"
  | "select"
  | "textarea"
  | "boolean";

export interface WizardField {
  key: string;
  label: string;
  type: WizardFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  hint?: string;
  /** Unidad mostrada junto al input (ej. "m", "L") */
  unit?: string;
  min?: number;
  max?: number;
}

export interface DocumentRequirement {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  /** Acepta múltiples archivos (fotos, etc.) */
  multiple?: boolean;
  /** Tipos MIME permitidos */
  accept?: string;
}

export interface ModificationFormSchema {
  slug: string;
  fields: WizardField[];
  /** Documentos requeridos (además de carta_no_adeudo + INE siempre presentes) */
  requiredDocs: DocumentRequirement[];
}

// ── Documento base: siempre requerido ────────────────────────────────────────

const CARTA_NO_ADEUDO: DocumentRequirement = {
  key: "carta_no_adeudo",
  label: "Carta de no adeudo",
  description: "Carta emitida por administración que certifica que la vivienda está al corriente de pagos.",
  required: true,
  accept: "application/pdf,image/jpeg,image/png",
};

// ── Helpers internos ──────────────────────────────────────────────────────────

function croquis(required = true): DocumentRequirement {
  return {
    key: "croquis",
    label: "Croquis o plano",
    description: "Esquema o plano con medidas de la obra a realizar.",
    required,
    accept: "application/pdf,image/jpeg,image/png",
  };
}

function fotos(): DocumentRequirement {
  return {
    key: "fotos",
    label: "Fotografías del área",
    description: "Fotos actuales del área donde se realizará la modificación.",
    required: true,
    multiple: true,
    accept: "image/jpeg,image/png,image/webp",
  };
}

function fichaTecnica(): DocumentRequirement {
  return {
    key: "ficha_tecnica",
    label: "Ficha técnica del material",
    description: "Ficha técnica o especificaciones del material o sistema a instalar.",
    required: true,
    accept: "application/pdf,image/jpeg,image/png",
  };
}

// ── Catálogo de schemas por slug ──────────────────────────────────────────────

const SCHEMAS: Record<string, ModificationFormSchema> = {

  // ── Tanque de gas ──────────────────────────────────────────────────────────
  "tanque-gas": {
    slug: "tanque-gas",
    fields: [
      {
        key: "capacidad_litros",
        label: "Capacidad del tanque",
        type: "number",
        required: true,
        placeholder: "Ej. 300",
        unit: "L",
        hint: "Capacidad en litros del tanque estacionario.",
        min: 100,
        max: 10000,
      },
      {
        key: "marca",
        label: "Marca del tanque",
        type: "text",
        required: true,
        placeholder: "Ej. Rotoplas, Calorex, Repsol",
      },
      {
        key: "ubicacion",
        label: "Ubicación propuesta",
        type: "select",
        required: true,
        options: ["Área posterior", "Lateral derecho", "Lateral izquierdo", "Azotea"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fichaTecnica(),
      fotos(),
    ],
  },

  // ── Toma de gas (Terrasoles) ───────────────────────────────────────────────
  "toma-gas": {
    slug: "toma-gas",
    fields: [
      {
        key: "tipo_toma",
        label: "Tipo de toma",
        type: "select",
        required: true,
        options: ["Individual", "Compartida con vecino"],
      },
      {
        key: "empresa_instaladora",
        label: "Empresa instaladora",
        type: "text",
        required: false,
        placeholder: "Nombre de la empresa",
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fotos(),
    ],
  },

  // ── Calentador solar ──────────────────────────────────────────────────────
  "calentador-solar": {
    slug: "calentador-solar",
    fields: [
      {
        key: "num_tubos",
        label: "Número de tubos",
        type: "number",
        required: true,
        placeholder: "Ej. 20",
        hint: "Cantidad de tubos del colector solar.",
        min: 10,
        max: 60,
      },
      {
        key: "marca",
        label: "Marca del calentador",
        type: "text",
        required: true,
        placeholder: "Ej. Calentasol, Rheem, Solaris",
      },
      {
        key: "capacidad_litros",
        label: "Capacidad del depósito",
        type: "number",
        required: false,
        placeholder: "Ej. 200",
        unit: "L",
        min: 50,
        max: 500,
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fichaTecnica(),
      fotos(),
    ],
  },

  // ── Escalera de azotea ────────────────────────────────────────────────────
  "escalera-azotea": {
    slug: "escalera-azotea",
    fields: [
      {
        key: "material",
        label: "Material de la escalera",
        type: "select",
        required: true,
        options: ["Concreto", "Herrería", "Aluminio", "Madera"],
      },
      {
        key: "largo_m",
        label: "Largo de la escalera",
        type: "number",
        required: true,
        placeholder: "Ej. 3.5",
        unit: "m",
        min: 1,
        max: 10,
      },
      {
        key: "ancho_m",
        label: "Ancho del tramo",
        type: "number",
        required: true,
        placeholder: "Ej. 0.9",
        unit: "m",
        min: 0.5,
        max: 3,
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(),
      fotos(),
    ],
  },

  // ── Muro colindante ───────────────────────────────────────────────────────
  "muro-colindante": {
    slug: "muro-colindante",
    fields: [
      {
        key: "altura_actual_m",
        label: "Altura actual del muro",
        type: "number",
        required: true,
        placeholder: "Ej. 2.0",
        unit: "m",
        min: 0.5,
        max: 6,
      },
      {
        key: "altura_propuesta_m",
        label: "Altura propuesta del muro",
        type: "number",
        required: true,
        placeholder: "Ej. 2.5",
        unit: "m",
        min: 0.5,
        max: 6,
      },
      {
        key: "largo_m",
        label: "Largo del muro",
        type: "number",
        required: true,
        placeholder: "Ej. 6.0",
        unit: "m",
        min: 0.5,
        max: 40,
      },
      {
        key: "material",
        label: "Material",
        type: "select",
        required: true,
        options: ["Block de concreto", "Tabicón", "Tabique rojo", "Piedra", "Otro"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(),
      fotos(),
    ],
  },

  // ── Techumbre cuarto de lavado ────────────────────────────────────────────
  "techumbre-lavado": {
    slug: "techumbre-lavado",
    fields: [
      {
        key: "largo_m",
        label: "Largo de la techumbre",
        type: "number",
        required: true,
        placeholder: "Ej. 2.0",
        unit: "m",
        min: 0.5,
        max: 20,
      },
      {
        key: "ancho_m",
        label: "Ancho de la techumbre",
        type: "number",
        required: true,
        placeholder: "Ej. 1.5",
        unit: "m",
        min: 0.5,
        max: 20,
      },
      {
        key: "material",
        label: "Material de cubierta",
        type: "select",
        required: true,
        options: ["Lámina galvanizada", "Policarbonato", "Teja", "Losa de concreto", "Otro"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(false),
      fotos(),
    ],
  },

  // ── Techumbre área posterior ──────────────────────────────────────────────
  "techumbre-posterior": {
    slug: "techumbre-posterior",
    fields: [
      {
        key: "largo_m",
        label: "Largo de la techumbre",
        type: "number",
        required: true,
        placeholder: "Ej. 4.0",
        unit: "m",
        min: 0.5,
        max: 30,
      },
      {
        key: "ancho_m",
        label: "Ancho de la techumbre",
        type: "number",
        required: true,
        placeholder: "Ej. 3.0",
        unit: "m",
        min: 0.5,
        max: 30,
      },
      {
        key: "material",
        label: "Material de cubierta",
        type: "select",
        required: true,
        options: ["Lámina galvanizada", "Policarbonato", "Teja", "Losa de concreto", "Madera", "Otro"],
      },
      {
        key: "altura_m",
        label: "Altura libre bajo la techumbre",
        type: "number",
        required: false,
        placeholder: "Ej. 2.4",
        unit: "m",
        min: 1,
        max: 5,
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(),
      fotos(),
    ],
  },

  // ── Cuarto de lavado ─────────────────────────────────────────────────────
  "cuarto-lavado": {
    slug: "cuarto-lavado",
    fields: [
      {
        key: "largo_m",
        label: "Largo del cuarto",
        type: "number",
        required: true,
        placeholder: "Ej. 2.0",
        unit: "m",
        min: 0.5,
        max: 10,
      },
      {
        key: "ancho_m",
        label: "Ancho del cuarto",
        type: "number",
        required: true,
        placeholder: "Ej. 1.5",
        unit: "m",
        min: 0.5,
        max: 10,
      },
      {
        key: "altura_m",
        label: "Altura del cuarto",
        type: "number",
        required: false,
        placeholder: "Ej. 2.4",
        unit: "m",
        min: 1.8,
        max: 5,
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(),
      fotos(),
    ],
  },

  // ── Reja lateral ─────────────────────────────────────────────────────────
  "reja-lateral": {
    slug: "reja-lateral",
    fields: [
      {
        key: "largo_m",
        label: "Largo de la reja",
        type: "number",
        required: true,
        placeholder: "Ej. 3.0",
        unit: "m",
        min: 0.5,
        max: 20,
      },
      {
        key: "alto_m",
        label: "Altura de la reja",
        type: "number",
        required: true,
        placeholder: "Ej. 2.0",
        unit: "m",
        min: 0.5,
        max: 5,
      },
      {
        key: "material",
        label: "Material",
        type: "select",
        required: true,
        options: ["Herrería", "Aluminio", "Acero inoxidable", "PVC", "Otro"],
      },
      {
        key: "color",
        label: "Color / acabado",
        type: "text",
        required: false,
        placeholder: "Ej. Negro mate, Beige",
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fotos(),
    ],
  },

  // ── Reja de pasillo ──────────────────────────────────────────────────────
  "reja-pasillo": {
    slug: "reja-pasillo",
    fields: [
      {
        key: "ancho_m",
        label: "Ancho de apertura",
        type: "number",
        required: true,
        placeholder: "Ej. 1.0",
        unit: "m",
        min: 0.5,
        max: 5,
      },
      {
        key: "alto_m",
        label: "Altura de la reja",
        type: "number",
        required: true,
        placeholder: "Ej. 2.0",
        unit: "m",
        min: 0.5,
        max: 5,
      },
      {
        key: "material",
        label: "Material",
        type: "select",
        required: true,
        options: ["Herrería", "Aluminio", "Acero inoxidable", "Otro"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fotos(),
    ],
  },

  // ── Herrería posterior ───────────────────────────────────────────────────
  "herreria-posterior": {
    slug: "herreria-posterior",
    fields: [
      {
        key: "tipo",
        label: "Tipo de herrería",
        type: "select",
        required: true,
        options: ["Puerta de acceso", "Reja de seguridad", "Ventana", "Baranda", "Otro"],
      },
      {
        key: "largo_m",
        label: "Largo total",
        type: "number",
        required: false,
        placeholder: "Ej. 4.0",
        unit: "m",
        min: 0.5,
        max: 30,
      },
      {
        key: "alto_m",
        label: "Alto total",
        type: "number",
        required: false,
        placeholder: "Ej. 2.0",
        unit: "m",
        min: 0.5,
        max: 5,
      },
      {
        key: "color",
        label: "Color / acabado",
        type: "text",
        required: false,
        placeholder: "Ej. Negro mate",
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fotos(),
    ],
  },

  // ── Mosquiteros ──────────────────────────────────────────────────────────
  "mosquiteros": {
    slug: "mosquiteros",
    fields: [
      {
        key: "num_piezas",
        label: "Número de mosquiteros",
        type: "number",
        required: true,
        placeholder: "Ej. 4",
        hint: "Total de puertas y ventanas a cubrir.",
        min: 1,
        max: 50,
      },
      {
        key: "tipo",
        label: "Tipo de mosquitero",
        type: "select",
        required: false,
        options: ["Enrollable", "Corredizo", "Abatible", "Fijo"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
    ],
  },

  // ── Área verde delantera ─────────────────────────────────────────────────
  "area-verde-delantera": {
    slug: "area-verde-delantera",
    fields: [
      {
        key: "descripcion",
        label: "Descripción de la modificación",
        type: "textarea",
        required: true,
        placeholder: "Describe qué cambios harás al área verde delantera.",
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fotos(),
    ],
  },

  // ── Piso / firme posterior (Terrasoles) ───────────────────────────────────
  "piso-firme-posterior": {
    slug: "piso-firme-posterior",
    fields: [
      {
        key: "largo_m",
        label: "Largo del firme",
        type: "number",
        required: true,
        placeholder: "Ej. 6.0",
        unit: "m",
        min: 0.5,
        max: 30,
      },
      {
        key: "ancho_m",
        label: "Ancho del firme",
        type: "number",
        required: true,
        placeholder: "Ej. 4.0",
        unit: "m",
        min: 0.5,
        max: 30,
      },
      {
        key: "color",
        label: "Color del acabado",
        type: "text",
        required: false,
        placeholder: "Ej. Gris natural, Beige",
      },
      {
        key: "acabado",
        label: "Tipo de acabado",
        type: "select",
        required: true,
        options: ["Concreto pulido", "Adocreto", "Azulejo", "Concreto estampado", "Otro"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fichaTecnica(),
      fotos(),
    ],
  },

  // ── Volado de acceso (Capital Sur) ───────────────────────────────────────
  "volado-acceso": {
    slug: "volado-acceso",
    fields: [
      {
        key: "largo_m",
        label: "Largo del volado",
        type: "number",
        required: true,
        placeholder: "Ej. 3.5",
        unit: "m",
        min: 0.5,
        max: 10,
      },
      {
        key: "ancho_m",
        label: "Ancho del volado",
        type: "number",
        required: true,
        placeholder: "Ej. 1.5",
        unit: "m",
        min: 0.5,
        max: 5,
      },
      {
        key: "material",
        label: "Material de cubierta",
        type: "select",
        required: true,
        options: ["Policarbonato", "Lámina", "Teja", "Concreto", "Otro"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(),
      fotos(),
    ],
  },

  // ── Pintura y retoque ─────────────────────────────────────────────────────
  "pintura-retoque": {
    slug: "pintura-retoque",
    fields: [
      {
        key: "area",
        label: "Área a pintar",
        type: "select",
        required: true,
        options: ["Fachada principal", "Muros laterales", "Área posterior", "Todo el exterior"],
      },
      {
        key: "color",
        label: "Color propuesto",
        type: "text",
        required: true,
        placeholder: "Ej. Blanco hueso, Terrazo, o código de color",
        hint: "Debe ser acorde con los colores autorizados del fraccionamiento.",
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fotos(),
    ],
  },

  // ── Instalaciones especiales (Capital Sur) ───────────────────────────────
  "instalaciones-especiales": {
    slug: "instalaciones-especiales",
    fields: [
      {
        key: "descripcion",
        label: "Descripción de la instalación",
        type: "textarea",
        required: true,
        placeholder: "Describe detalladamente la instalación a realizar.",
      },
      {
        key: "empresa",
        label: "Empresa o instalador",
        type: "text",
        required: false,
        placeholder: "Nombre del proveedor o empresa responsable",
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(false),
      fotos(),
    ],
  },

  // ── Pérgola ────────────────────────────────────────────────────────────────
  "pergola": {
    slug: "pergola",
    fields: [
      {
        key: "largo_m",
        label: "Largo de la pérgola",
        type: "number",
        required: true,
        placeholder: "Ej. 4.0",
        unit: "m",
        min: 0.5,
        max: 20,
      },
      {
        key: "ancho_m",
        label: "Ancho de la pérgola",
        type: "number",
        required: true,
        placeholder: "Ej. 3.0",
        unit: "m",
        min: 0.5,
        max: 20,
      },
      {
        key: "altura_m",
        label: "Altura de la pérgola",
        type: "number",
        required: true,
        placeholder: "Ej. 2.4",
        unit: "m",
        min: 1.5,
        max: 6,
      },
      {
        key: "material",
        label: "Material",
        type: "select",
        required: true,
        options: ["Madera", "Aluminio", "Herrería", "PVC", "Bambú", "Otro"],
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      croquis(),
      fotos(),
    ],
  },

  // ── Repellado interior ────────────────────────────────────────────────────
  "repellado-interior": {
    slug: "repellado-interior",
    fields: [
      {
        key: "area",
        label: "Área a repallar",
        type: "select",
        required: true,
        options: ["Sala", "Comedor", "Cocina", "Recámaras", "Baños", "Todo el interior"],
      },
      {
        key: "color",
        label: "Color o acabado propuesto",
        type: "text",
        required: true,
        placeholder: "Ej. Blanco, Beige, Gris",
      },
      {
        key: "metros_cuadrados",
        label: "Metros cuadrados aproximados",
        type: "number",
        required: false,
        placeholder: "Ej. 40",
        unit: "m²",
        min: 1,
        max: 500,
      },
    ],
    requiredDocs: [
      CARTA_NO_ADEUDO,
      fotos(),
    ],
  },
};

// ── Schema genérico (fallback) ────────────────────────────────────────────────

const GENERIC_SCHEMA: ModificationFormSchema = {
  slug: "generic",
  fields: [
    {
      key: "descripcion",
      label: "Descripción de la solicitud",
      type: "textarea",
      required: true,
      placeholder: "Describe detalladamente la modificación que deseas realizar.",
    },
  ],
  requiredDocs: [
    CARTA_NO_ADEUDO,
    fotos(),
  ],
};

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Retorna el schema de campos para un slug de modificación.
 * Si el slug no tiene schema específico, retorna el genérico (nunca null).
 */
export function getModificationFormSchema(
  slug: string
): ModificationFormSchema {
  return SCHEMAS[slug] ?? { ...GENERIC_SCHEMA, slug };
}

/**
 * Retorna los documentos requeridos para un slug.
 * Siempre incluye carta_no_adeudo como primer elemento.
 */
export function getDocumentRequirements(slug: string): DocumentRequirement[] {
  const schema = getModificationFormSchema(slug);
  // Garantizar que carta_no_adeudo sea siempre el primero
  const docs = schema.requiredDocs;
  const hasNoAdeudo = docs.some((d) => d.key === "carta_no_adeudo");
  if (!hasNoAdeudo) {
    return [CARTA_NO_ADEUDO, ...docs];
  }
  return docs;
}

/** Lista de todos los slugs con schema específico definido. */
export const ALL_SLUGS: string[] = Object.keys(SCHEMAS);

/** Valida que los campos required de un schema estén presentes en los datos. */
export function validateFormData(
  slug: string,
  data: Record<string, unknown>
): { valid: boolean; missing: string[] } {
  const schema = getModificationFormSchema(slug);
  const missing: string[] = [];
  for (const field of schema.fields) {
    if (field.required) {
      const val = data[field.key];
      if (val === undefined || val === null || String(val).trim() === "") {
        missing.push(field.label);
      }
    }
  }
  return { valid: missing.length === 0, missing };
}
