import type { ProductStatus } from "./catalog";
import type { QuoteStatus } from "./quote-math";

export type DealStatus = "open" | "won" | "lost";

export interface Prospecto {
  id: number;
  name: string;
  phone: string;
  phone_normalized: string;
  email: string | null;
  company: string | null;
  notes: string | null;
  tags: string[];
  created_at: number;
  updated_at: number;
}

export interface ProspectoList {
  data: Prospecto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  status: ProductStatus;
  active: boolean;
  created_at: number;
  updated_at: number;
}

export interface PriceListItem {
  product_id: number;
  unit_price: number;
  sku: string;
  name: string;
}

export interface PriceList {
  id: number;
  name: string;
  currency: string;
  is_default: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: number;
  updated_at: number;
  items: PriceListItem[];
}

export interface PipelineStage {
  id: number;
  pipeline_id: number;
  name: string;
  position: number;
  color: string;
}

export interface Pipeline {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
  stages: PipelineStage[];
}

export interface Deal {
  id: number;
  pipeline_id: number;
  stage_id: number;
  prospecto_id: number;
  prospecto_name: string;
  assigned_to_user_id: number | null;
  assignee_name: string | null;
  title: string;
  value: number;
  currency: string;
  notes: string | null;
  expected_close_date: string | null;
  status: DealStatus;
  created_at: number;
  updated_at: number;
}

export interface QuoteLine {
  id: number;
  quote_id: number;
  product_id: number | null;
  name_snapshot: string;
  sku_snapshot: string | null;
  qty: number;
  unit_price: number;
  discount_pct: number;
  line_total: number;
  position: number;
}

export interface Quote {
  id: number;
  number: number;
  prospecto_id: number;
  prospecto_name: string;
  price_list_id: number | null;
  deal_id: number | null;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  currency: string;
  subtotal: number;
  discount_total: number;
  total: number;
  sent_at: number | null;
  pdf_path: string | null;
  created_at: number;
  updated_at: number;
  lines: QuoteLine[];
}

export interface QuoteInputLine {
  product_id?: number | null;
  name_snapshot: string;
  sku_snapshot?: string | null;
  qty: number;
  unit_price: number;
  discount_pct?: number;
}
