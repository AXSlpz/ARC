export type CrmId = string | number;

export type CrmRole = "super_admin" | "admin" | "atencion";

export interface AuthMeResponse {
  user: { role?: string };
}

export interface Prospecto {
  id: CrmId;
  name: string;
  phone: string;
  email?: string | null;
  company?: string | null;
  notes?: string | null;
  tags?: string[] | string | null;
  created_at?: string | number | null;
  updated_at?: string | number | null;
}

export interface ProspectosPage {
  data: Prospecto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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

export type ProductStatus = "active" | "inactive" | "discontinued";

export interface Product {
  id: CrmId;
  sku: string;
  name: string;
  description?: string | null;
  unit: ProductUnit | string;
  status: ProductStatus | string;
}

export interface PriceListItem {
  product_id: CrmId;
  unit_price: number;
  sku?: string;
  name?: string;
}

export interface PriceList {
  id: CrmId;
  name: string;
  currency: string;
  is_default?: boolean;
  valid_from?: string | null;
  valid_until?: string | null;
  items: PriceListItem[];
}

export interface PipelineStage {
  id: CrmId;
  name: string;
  position: number;
  color: string;
}

export interface Pipeline {
  id: CrmId;
  name: string;
  stages: PipelineStage[];
}

export type DealStatus = "open" | "won" | "lost";

export interface CrmAssignee {
  id: number;
  name: string;
}

export interface Deal {
  id: CrmId;
  title: string;
  value: number;
  currency: string;
  status: DealStatus | string;
  pipeline_id: CrmId;
  stage_id: CrmId;
  prospecto_id: CrmId;
  prospecto_name?: string | null;
  notes?: string | null;
  expected_close_date?: string | null;
  assigned_to_user_id?: number | null;
  assignee_name?: string | null;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

export interface QuoteLine {
  id?: CrmId;
  product_id?: CrmId | null;
  name_snapshot: string;
  sku_snapshot?: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
}

export interface Quote {
  id: CrmId;
  number: string;
  status: QuoteStatus | string;
  total: number;
  currency: string;
  prospecto_id?: CrmId;
  prospecto_name?: string | null;
  prospecto?: Prospecto | null;
  price_list_id?: CrmId | null;
  deal_id?: CrmId | null;
  valid_until?: string | null;
  notes?: string | null;
  lines?: QuoteLine[];
  created_at?: string | number | null;
}

export interface QuoteDetail extends Quote {
  lines: QuoteLine[];
}

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  active: "Activo",
  inactive: "Inactivo",
  discontinued: "Descontinuado",
};

export const PRODUCT_STATUS_CLASS: Record<ProductStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-200 text-slate-700",
  discontinued: "bg-amber-100 text-amber-800",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
  expired: "Vencida",
};

export const QUOTE_STATUS_CLASS: Record<QuoteStatus, string> = {
  draft: "bg-slate-200 text-slate-700",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
};

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  open: "Abierto",
  won: "Ganado",
  lost: "Perdido",
};

export const DEAL_STATUS_CLASS: Record<DealStatus, string> = {
  open: "bg-blue-100 text-blue-800",
  won: "bg-emerald-100 text-emerald-800",
  lost: "bg-red-100 text-red-800",
};

export const UNIT_LABELS: Record<ProductUnit, string> = {
  pza: "Pieza",
  m: "Metro",
  cm: "Centímetro",
  mm: "Milímetro",
  kg: "Kilogramo",
  g: "Gramo",
  L: "Litro",
  ml: "Mililitro",
  m2: "Metro²",
  m3: "Metro³",
  hr: "Hora",
  dia: "Día",
  mes: "Mes",
  caja: "Caja",
  tarima: "Tarima",
  paquete: "Paquete",
  rollo: "Rollo",
  par: "Par",
  docena: "Docena",
  kit: "Kit",
  juego: "Juego",
  servicio: "Servicio",
};

export const DEFAULT_CURRENCY = "MXN";

export const CURRENCIES = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "INR", label: "Indian Rupee" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "BRL", label: "Brazilian Real" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "AED", label: "UAE Dirham" },
  { code: "ZAR", label: "South African Rand" },
  { code: "NGN", label: "Nigerian Naira" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "COP", label: "Colombian Peso" },
] as const;

export const STAGE_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
] as const;
