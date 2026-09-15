import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { createTicketType, listTicketTypes } from "@/lib/portal/ticket-types";
import { FIELD_TYPES } from "@/lib/portal/types";
import type { FieldInput } from "@/lib/portal/ticket-types";
import type { FieldType } from "@/lib/portal/types";
import { logAudit } from "@/lib/audit";

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

export async function GET() {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ types: listTicketTypes() });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

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

  const type = createTicketType({
    name: String(name),
    description: description != null ? String(description) : null,
    active: active !== false,
    letterTemplate: letterTemplate != null ? String(letterTemplate) : null,
    fields: parseFields(fields),
  });

  logAudit(auth.id, auth.username, "ticket_type.create", "ticket_type", type.id, {
    name: type.name,
  });
  return NextResponse.json({ type }, { status: 201 });
}
