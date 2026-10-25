import { z } from "zod";
import {
  normalizeSpanishText,
  normalizeEmailText,
} from "./text-normalize";

export const LoginSchema = z.object({
  username: z.string().min(1).max(64).trim(),
  password: z.string().min(1).max(128),
});

export const PasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña no puede exceder 128 caracteres")
  .refine((p) => /[A-Z]/.test(p), "Debe contener al menos una mayúscula")
  .refine((p) => /[a-z]/.test(p), "Debe contener al menos una minúscula")
  .refine((p) => /[0-9]/.test(p), "Debe contener al menos un número")
  .refine(
    (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p),
    "Debe contener al menos un carácter especial (!@#$%...)"
  );

export const AdminUserCreateSchema = z.object({
  username: z
    .string()
    .min(3, "El usuario debe tener al menos 3 caracteres")
    .max(64)
    .trim()
    .regex(
      /^[a-z0-9_.\-\s]+$/i,
      "Solo letras, números, espacios, guiones y puntos"
    ),
  password: PasswordSchema,
  displayName: z.string().max(100).optional(),
  role: z.enum(["super_admin", "admin", "atencion"]).optional(),
  allowedLineIds: z
    .array(z.number().int().positive())
    .min(1, "Selecciona al menos una línea de atención"),
});

export const AdminUserUpdateSchema = z.object({
  displayName: z.string().max(100).optional(),
  password: PasswordSchema.optional(),
  role: z.enum(["super_admin", "admin", "atencion"]).optional(),
  allowedLineIds: z
    .array(z.number().int().positive())
    .min(1, "Selecciona al menos una línea de atención")
    .optional(),
});

export const ModeSchema = z.object({
  mode: z.enum(["AI", "HUMAN"]),
});

export const ConversationAssignSchema = z.object({
  userId: z.number().int().positive().optional().nullable(),
});

export const TagsSchema = z.object({
  tagIds: z.array(z.number().int().nonnegative()).max(20),
});

export const NoteSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
});

export const FaqItemSchema = z.object({
  question: z.string().min(1).max(500).trim(),
  answer: z.string().min(1).max(5000).trim(),
  keywords: z.string().max(500).optional().default(""),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const MessageSchema = z.object({
  content: z.string().min(1).max(4000).trim(),
});

export const LineNameSchema = z.object({
  name: z.string().min(1).max(60).trim(),
});

const optionalNumber = z.number().nullable().optional();
const optionalInt = z.number().int().nullable().optional();
const optionalString = z
  .string()
  .max(500)
  .trim()
  .transform((v) => normalizeSpanishText(v))
  .nullable()
  .optional();
const requiredSpanishName = z
  .string()
  .min(1, "El nombre es obligatorio")
  .max(200)
  .trim()
  .transform((v) => normalizeSpanishText(v) ?? "");
const optionalEmail = z
  .string()
  .email("Email inválido")
  .max(200)
  .trim()
  .transform((v) => normalizeEmailText(v) ?? "")
  .nullable()
  .optional()
  .or(z.literal(""));
const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
const optionalDate = z
  .string()
  .regex(datePattern, "Formato de fecha inválido (DD/MM/AAAA)")
  .nullable()
  .optional();

export const ResidenteSchema = z.object({
  condominio_id: z.number().int().positive("Selecciona un condominio"),
  num_vivienda: optionalInt,
  num_coto: optionalString,
  prototipo_id: optionalInt,
  nombre: requiredSpanishName,
  celular: optionalInt,
  email: optionalEmail,
  metros_cuadrados: optionalNumber,
  nombre_contacto1: optionalString,
  celular_contacto1: optionalInt,
  parentesco_contacto1: optionalString,
  nombre_contacto2: optionalString,
  celular_contacto2: optionalInt,
  parentesco_contacto2: optionalString,
  nombre_contacto3: optionalString,
  celular_contacto3: optionalInt,
  parentesco_contacto3: optionalString,
  nombre_expropietario: optionalString,
  celular_expropietario: optionalInt,
  fecha_entrega_primer: optionalDate,
});

export const ResidenteUpdateSchema = ResidenteSchema.partial();

export const PrototipoSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "El nombre del prototipo es obligatorio")
    .max(100)
    .transform((v) => normalizeSpanishText(v) ?? v),
  active: z.boolean().optional().default(true),
});

export const PrototipoUpdateSchema = PrototipoSchema.partial().refine(
  (data) => data.name !== undefined || data.active !== undefined,
  { message: "Envía name y/o active" }
);

const developmentIdField = z
  .union([z.coerce.number().int().positive(), z.null()])
  .optional();

const newDevelopmentNameField = z
  .string()
  .max(80, "El desarrollo no puede exceder 80 caracteres")
  .trim()
  .optional();

export const CondominioSchema = z.object({
  name: requiredSpanishName,
  prefijo: z.string().min(1, "El prefijo es obligatorio").max(50).trim(),
  tipo: z.enum(["Vivienda", "Terrenos", "Torres"]).default("Vivienda"),
  estatus: z.enum(["Activo", "Entregado"]).default("Activo"),
  documentacion_indexada: z.boolean().optional().default(false),
  tags: z.boolean().optional().default(false),
  developmentId: developmentIdField,
  newDevelopmentName: newDevelopmentNameField,
});

export const CondominioUpdateSchema = z
  .object({
    name: requiredSpanishName.optional(),
    prefijo: z.string().min(1, "El prefijo es obligatorio").max(50).trim().optional(),
    tipo: z.enum(["Vivienda", "Terrenos", "Torres"]).optional(),
    estatus: z.enum(["Activo", "Entregado"]).optional(),
    documentacion_indexada: z.boolean().optional(),
    tags: z.boolean().optional(),
    developmentId: developmentIdField,
    newDevelopmentName: newDevelopmentNameField,
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.prefijo !== undefined ||
      data.tipo !== undefined ||
      data.estatus !== undefined ||
      data.documentacion_indexada !== undefined ||
      data.tags !== undefined ||
      data.developmentId !== undefined ||
      data.newDevelopmentName !== undefined,
    { message: "Debe enviar al menos un campo para actualizar" }
  );

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const ServiceScheduleBaseSchema = z.object({
  service_type_id: z.number().int().positive("Selecciona un tipo de servicio"),
  title: z.string().max(200).trim().nullable().optional(),
  start_date: z.string().regex(DATE_RE, "Fecha inválida (YYYY-MM-DD)"),
  time: z
    .union([
      z.string().regex(TIME_RE, "Hora inválida (HH:MM)"),
      z.literal(""),
      z.null(),
    ])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  recurrence: z.enum([
    "once",
    "daily",
    "weekly",
    "every_n_days",
    "monthly",
  ]),
  interval_days: z.number().int().min(1).max(365).nullable().optional(),
  weekdays: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .nullable()
    .optional(),
  notes: z.string().max(1000).trim().nullable().optional(),
  active: z.boolean().optional().default(true),
});

function refineServiceSchedule(
  data: z.infer<typeof ServiceScheduleBaseSchema>,
  ctx: z.RefinementCtx
): void {
  if (data.recurrence === "every_n_days" && !data.interval_days) {
    ctx.addIssue({
      code: "custom",
      message: "Indica cada cuántos días",
      path: ["interval_days"],
    });
  }
  if (
    data.recurrence === "weekly" &&
    (!data.weekdays || data.weekdays.length === 0)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Selecciona al menos un día de la semana",
      path: ["weekdays"],
    });
  }
}

export const ServiceScheduleSchema =
  ServiceScheduleBaseSchema.superRefine(refineServiceSchedule);

export const ServiceScheduleUpdateSchema = ServiceScheduleBaseSchema.partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  })
  .superRefine((data, ctx) => {
    if (data.recurrence === undefined) return;
    refineServiceSchedule(
      {
        service_type_id: data.service_type_id ?? 1,
        start_date: data.start_date ?? "2000-01-01",
        recurrence: data.recurrence,
        interval_days: data.interval_days,
        weekdays: data.weekdays,
        title: data.title,
        time: data.time ?? null,
        notes: data.notes,
        active: data.active ?? true,
      },
      ctx
    );
  });

export const ServiceTypeSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(200).trim(),
  keywords: z.string().max(1000).trim().optional().default(""),
  sort_order: z.number().int().nonnegative().optional(),
  active: z.boolean().optional().default(true),
});

export const ServiceTypeUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).trim().optional(),
    keywords: z.string().max(1000).trim().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (result.success) return { success: true, data: result.data };
  const issues = result.error.issues;
  const first = issues[0];
  return { success: false, error: first?.message ?? "Datos inválidos" };
}
