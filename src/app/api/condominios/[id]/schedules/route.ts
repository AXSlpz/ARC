import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import { getCondominio } from "@/lib/residentes";
import {
  computeNextOccurrences,
  createSchedule,
  formatRecurrenceLabel,
  listSchedulesForCondominio,
} from "@/lib/service-schedules";
import { parseBody, ServiceScheduleSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseCondoId(id: string): number | null {
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) return null;
  return numId;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const numId = parseCondoId((await params).id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const schedules = listSchedulesForCondominio(numId).map((s) => ({
    ...s,
    recurrence_label: formatRecurrenceLabel(s),
    next_occurrences: computeNextOccurrences(s, new Date(), 3),
  }));

  return NextResponse.json({
    condominio: { id: condo.id, name: condo.name },
    schedules,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const numId = parseCondoId((await params).id);
  if (!numId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const condo = getCondominio(numId);
  if (!condo) {
    return NextResponse.json({ error: "Condominio no encontrado" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = parseBody(ServiceScheduleSchema, body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const schedule = createSchedule(numId, {
      ...parsed.data,
      time: parsed.data.time || null,
    });

    logAudit(auth.id, auth.username, "schedule.create", "condominio", numId, {
      scheduleId: schedule.id,
      serviceTypeId: schedule.service_type_id,
      recurrence: schedule.recurrence,
    });

    return NextResponse.json(
      {
        ...schedule,
        recurrence_label: formatRecurrenceLabel(schedule),
        next_occurrences: computeNextOccurrences(schedule, new Date(), 3),
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al crear programación" },
      { status: 400 }
    );
  }
}
