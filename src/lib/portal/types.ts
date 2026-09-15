export interface PortalUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  createdAt: number;
}

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "boolean"
  | "phone"
  | "file";

export const FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "boolean",
  "phone",
  "file",
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Texto corto",
  textarea: "Texto largo",
  number: "Número",
  date: "Fecha",
  select: "Lista (selección)",
  boolean: "Sí / No",
  phone: "Teléfono",
  file: "Archivo / foto",
};

export interface TicketTypeField {
  id: number;
  ticketTypeId: number;
  label: string;
  fieldKey: string;
  fieldType: FieldType;
  options: string[] | null;
  placeholder: string | null;
  required: boolean;
  sortOrder: number;
}

export interface TicketType {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  letterTemplate: string | null;
  sortOrder: number;
  createdAt: number;
  fields?: TicketTypeField[];
}

export type TicketStatus =
  | "nuevo"
  | "en_revision"
  | "autorizado"
  | "rechazado"
  | "en_proceso"
  | "completado"
  | "cerrado"
  | "cancelado";

export const TICKET_STATUSES: TicketStatus[] = [
  "nuevo",
  "en_revision",
  "autorizado",
  "rechazado",
  "en_proceso",
  "completado",
  "cerrado",
  "cancelado",
];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  nuevo: "Nuevo",
  en_revision: "En revisión",
  autorizado: "Autorizado",
  rechazado: "Rechazado",
  en_proceso: "En proceso",
  completado: "Completado",
  cerrado: "Cerrado",
  cancelado: "Cancelado",
};

/** Estatus en los que el ticket se considera "activo" (para el bot/WhatsApp). */
export const ACTIVE_TICKET_STATUSES: TicketStatus[] = [
  "nuevo",
  "en_revision",
  "autorizado",
  "en_proceso",
];

/** Estados de espera de respuesta del cliente (via portal o WhatsApp). */
export type TicketAwaitingKind = "none" | "info" | "file" | "answer";

export interface TicketValue {
  fieldKey: string;
  label: string;
  value: string | null;
}

export interface TicketComment {
  id: number;
  ticketId: number;
  authorType: "client" | "admin";
  authorName: string | null;
  body: string;
  internal: boolean;
  createdAt: number;
  attachments?: TicketAttachment[];
}

export interface TicketStatusHistory {
  id: number;
  ticketId: number;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedBy: string | null;
  note: string | null;
  createdAt: number;
}

export interface TicketDocument {
  id: number;
  ticketId: number;
  kind: string;
  filename: string;
  path: string;
  createdAt: number;
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  commentId: number | null;
  uploaderType: "client" | "admin";
  originalName: string;
  mime: string;
  sizeBytes: number;
  scanned: string;
  createdAt: number;
}

/** Origen del ticket: solicitud del cliente o aviso enviado por administración. */
export type TicketOrigin = "client" | "admin_notice";

export interface Ticket {
  id: number;
  folio: string;
  ticketTypeId: number;
  ticketTypeName?: string;
  portalUserId: number;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string | null;
  status: TicketStatus;
  awaitingKind: TicketAwaitingKind;
  awaitingNote: string | null;
  origin?: TicketOrigin;
  residenteId?: number | null;
  notificationTemplateId?: number | null;
  createdAt: number;
  updatedAt: number;
  values?: TicketValue[];
  comments?: TicketComment[];
  history?: TicketStatusHistory[];
  documents?: TicketDocument[];
  attachments?: TicketAttachment[];
}

export interface NotificationTemplate {
  id: number;
  name: string;
  slug: string;
  body: string;
  active: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type FinanceKind = "income" | "expense";

export interface FinanceCategory {
  id: number;
  name: string;
  kind: FinanceKind;
  active: boolean;
  createdAt: number;
}

export interface FinanceEntry {
  id: number;
  kind: FinanceKind;
  categoryId: number | null;
  categoryName?: string | null;
  amountCents: number;
  description: string | null;
  occurredOn: string;
  method: string | null;
  reference: string | null;
  createdBy: string | null;
  createdAt: number;
}

export interface MonthlyReport {
  month: string;
  totalIncomeCents: number;
  totalExpenseCents: number;
  balanceCents: number;
  byCategory: Array<{
    categoryId: number | null;
    categoryName: string;
    kind: FinanceKind;
    totalCents: number;
  }>;
}
