import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio } from "@/lib/residentes";
import {
  computeNextOccurrences,
  deleteSchedule,
  formatRecurrenceLabel,
  getSchedule,
  updateSchedule,
} from "@/lib/service-schedules";
import { parseBody, ServiceScheduleUpdateSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; scheduleId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id, scheduleId } = await params;
  const condoId = Number(id);
  const schedId = Number(scheduleId);
  if (!Number.isInteger(condoId) || condoId <= 0 || !Number.isInteger(schedId) || schedId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(condoId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  if (!getSchedule(condoId, schedId)) {
    return NextResponse.json({ error: "Programación no encontrada" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = parseBody(ServiceScheduleUpdateSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const updated = updateSchedule(condoId, schedId, {
      ...parsed.data,
      time:
        parsed.data.time === undefined
          ? undefined
          : parsed.data.time || null,
    });
    if (!updated) {
      return NextResponse.json({ error: "Programación no encontrada" }, { status: 404 });
    }

    logAudit(auth.id, auth.username, "schedule.update", "condominio", condoId, {
      scheduleId: schedId,
      fields: Object.keys(parsed.data),
    });

    return NextResponse.json({
      ...updated,
      recurrence_label: formatRecurrenceLabel(updated),
      next_occurrences: computeNextOccurrences(updated, new Date(), 3),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al actualizar" },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const { id, scheduleId } = await params;
  const condoId = Number(id);
  const schedId = Number(scheduleId);
  if (!Number.isInteger(condoId) || condoId <= 0 || !Number.isInteger(schedId) || schedId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(condoId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const ok = deleteSchedule(condoId, schedId);
  if (!ok) {
    return NextResponse.json({ error: "Programación no encontrada" }, { status: 404 });
  }

  logAudit(auth.id, auth.username, "schedule.delete", "condominio", condoId, {
    scheduleId: schedId,
  });

  return NextResponse.json({ ok: true });
}
