import { z } from "zod";
import { PRODUCT_STATUSES, PRODUCT_UNITS } from "./catalog";
import { QUOTE_STATUSES } from "./quote-math";

const emptyToNull = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
};

const optionalText = (max: number) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max).nullable().optional(),
  );

export const ProspectoCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  phone: z.string().trim().min(1, "El teléfono es obligatorio").max(40),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email("Email inválido").max(200).nullable().optional(),
  ),
  company: optionalText(200),
  notes: optionalText(4000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
});

export const ProspectoUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200).optional(),
    phone: z.string().trim().min(1, "El teléfono es obligatorio").max(40).optional(),
    email: z.preprocess(
      emptyToNull,
      z.string().trim().email("Email inválido").max(200).nullable().optional(),
    ),
    company: optionalText(200),
    notes: optionalText(4000),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Envía al menos un campo",
  });

export const ProductCreateSchema = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio").max(80),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  description: optionalText(4000),
  unit: z.enum(PRODUCT_UNITS).optional().default("pza"),
  status: z.enum(PRODUCT_STATUSES).optional().default("active"),
});

export const ProductUpdateSchema = z
  .object({
    sku: z.string().trim().min(1, "El SKU es obligatorio").max(80).optional(),
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200).optional(),
    description: optionalText(4000),
    unit: z.enum(PRODUCT_UNITS).optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Envía al menos un campo",
  });

export const PriceListCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  currency: z.string().trim().min(3).max(3).optional().default("MXN"),
  is_default: z.boolean().optional().default(false),
  valid_from: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
  ),
  valid_until: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
  ),
});

export const PriceListUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre es obligatorio").max(200).optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    is_default: z.boolean().optional(),
    valid_from: z.preprocess(
      emptyToNull,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
    ),
    valid_until: z.preprocess(
      emptyToNull,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
    ),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Envía al menos un campo",
  });

export const PriceListItemSchema = z.object({
  product_id: z.number().int().positive("Producto inválido"),
  unit_price: z
    .number()
    .finite()
    .min(0, "El precio no puede ser negativo")
    .max(9_999_999_999.99),
});

export const PipelineCreateSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(200),
});

export const PipelineUpdateSchema = PipelineCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Envía al menos un campo" },
);

export const PipelineStagesSchema = z.object({
  stages: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().trim().min(1, "El nombre de la etapa es obligatorio").max(120),
        position: z.number().int().min(0).max(200),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
          .optional()
          .default("#3b82f6"),
      }),
    )
    .min(1, "Indica al menos una etapa")
    .max(30),
});

export const DealCreateSchema = z.object({
  pipeline_id: z.number().int().positive("Embudo inválido"),
  stage_id: z.number().int().positive("Etapa inválida"),
  prospecto_id: z.number().int().positive("Prospecto inválido"),
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  value: z.number().finite().min(0).max(9_999_999_999.99).optional().default(0),
  currency: z.string().trim().min(3).max(3).optional().default("MXN"),
  notes: optionalText(4000),
  expected_close_date: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
  ),
  status: z.enum(["open", "won", "lost"]).optional().default("open"),
  assigned_to_user_id: z.number().int().positive().nullable().optional(),
});

export const DealUpdateSchema = z
  .object({
    pipeline_id: z.number().int().positive("Embudo inválido").optional(),
    stage_id: z.number().int().positive("Etapa inválida").optional(),
    prospecto_id: z.number().int().positive("Prospecto inválido").optional(),
    title: z.string().trim().min(1, "El título es obligatorio").max(200).optional(),
    value: z.number().finite().min(0).max(9_999_999_999.99).optional(),
    currency: z.string().trim().min(3).max(3).optional(),
    notes: optionalText(4000),
    expected_close_date: z.preprocess(
      emptyToNull,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
    ),
    status: z.enum(["open", "won", "lost"]).optional(),
    assigned_to_user_id: z.number().int().positive().nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Envía al menos un campo",
  });

export const QuoteLineSchema = z.object({
  product_id: z.number().int().positive().nullable().optional(),
  name_snapshot: z.string().trim().min(1, "El nombre de la partida es obligatorio").max(200),
  sku_snapshot: optionalText(80),
  qty: z.number().finite().gt(0, "La cantidad debe ser mayor a 0").max(1_000_000),
  unit_price: z.number().finite().min(0).max(9_999_999_999.99),
  discount_pct: z.number().finite().min(0).max(100).optional().default(0),
});

export const QuoteCreateSchema = z.object({
  prospecto_id: z.number().int().positive("Prospecto inválido"),
  price_list_id: z.number().int().positive().nullable().optional(),
  deal_id: z.number().int().positive().nullable().optional(),
  valid_until: z.preprocess(
    emptyToNull,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
  ),
  notes: optionalText(4000),
  currency: z.string().trim().min(3).max(3).optional().default("MXN"),
  lines: z.array(QuoteLineSchema).min(1, "Agrega al menos una partida").max(200),
});

export const QuoteUpdateSchema = z
  .object({
    prospecto_id: z.number().int().positive("Prospecto inválido").optional(),
    price_list_id: z.number().int().positive().nullable().optional(),
    deal_id: z.number().int().positive().nullable().optional(),
    valid_until: z.preprocess(
      emptyToNull,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)").nullable().optional(),
    ),
    notes: optionalText(4000),
    currency: z.string().trim().min(3).max(3).optional(),
    lines: z.array(QuoteLineSchema).min(1, "Agrega al menos una partida").max(200).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Envía al menos un campo",
  });

export const QuoteStatusSchema = z.object({
  status: z.enum(QUOTE_STATUSES),
});
