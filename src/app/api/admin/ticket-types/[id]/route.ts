import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import {
  deleteTicketType,
  getTicketType,
  updateTicketType,
} from "@/lib/portal/ticket-types";
import { FIELD_TYPES } from "@/lib/portal/types";
import type { FieldInput } from "@/lib/portal/ticket-types";
import type { FieldType } from "@/lib/portal/types";
import { logAudit } from "@/lib/audit";

interface Ctx {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

function parseFields(raw: unknown): FieldInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map((f) => {
      const fieldType = String(f.fieldType ?? "text");
      const options = Array.isArray(f.options)
        ? (f.options as unknown[]).map(String)
        : null;
      return {
        label: String(f.label ?? "").trim(),
        fieldKey: f.fieldKey ? String(f.fieldKey) : undefined,
        fieldType: (FIELD_TYPES as string[]).includes(fieldType)
          ? (fieldType as FieldType)
          : "text",
        options,
        placeholder: f.placeholder != null ? String(f.placeholder) : null,
        required: Boolean(f.required),
      } satisfies FieldInput;
    })
    .filter((f) => f.label.length > 0);
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const type = getTicketType(parseInt(id, 10));
  if (!type) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ type });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const { id } = await params;
  const typeId = parseInt(id, 10);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }
  const { name, description, active, letterTemplate, fields } = body as Record<
    string,
    unknown
  >;
  if (!name || String(name).trim().length < 2) {
    return NextResponse.json({ error: "Nombre inválido." }, { status: 400 });
  }

  const type = updateTicketType(typeId, {
    name: String(name),
    description: description != null ? String(description) : null,
    active: active !== false,
    letterTemplate: letterTemplate != null ? String(letterTemplate) : null,
    fields: parseFields(fields),
  });
  if (!type) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  logAudit(auth.id, auth.username, "ticket_type.update", "ticket_type", typeId, {
    name: type.name,
  });
  return NextResponse.json({ type });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const { id } = await params;
  const typeId = parseInt(id, 10);
  const deleted = deleteTicketType(typeId);
  logAudit(auth.id, auth.username, "ticket_type.delete", "ticket_type", typeId, {
    hardDeleted: deleted,
  });
  return NextResponse.json({ deleted, deactivated: !deleted });
}
