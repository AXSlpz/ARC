import { NextRequest, NextResponse } from "next/server";
import {
  getAdminSettings,
  saveAdminSettings,
  type AdminSettings,
  type WeekdayKey,
  WEEKDAY_KEYS,
  DEFAULT_BUSINESS_HOURS,
} from "@/lib/admin-settings";
import { isAuthError, requireAdmin, requireAuth } from "@/lib/auth";
import type { ChatColors } from "@/lib/admin-settings-types";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { auditSettingsChanges } from "@/lib/audit-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  return NextResponse.json(getAdminSettings(), {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" },
  });
}

interface SettingsPayload {
  businessName?: string;
  timezone?: string;
  businessHours?: AdminSettings["businessHours"];
  holidays?: string[];
  chatColors?: ChatColors;
  welcomeMessage?: string;
  menuEnabled?: boolean;
  urgencyKeywords?: string[];
  inactivityFarewellMessage?: string;
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  if (isRateLimited(`ip:${getClientIp(req)}:admin-write`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  try {
    const body = (await req.json()) as SettingsPayload;

    if (body.businessName !== undefined && !body.businessName.trim()) {
      return NextResponse.json(
        { error: "El nombre del negocio no puede estar vacío" },
        { status: 400 }
      );
    }

    if (body.businessHours) {
      for (const key of WEEKDAY_KEYS) {
        const schedule = body.businessHours[key as WeekdayKey];
        if (!schedule) continue;
        if (schedule.enabled && schedule.open >= schedule.close) {
          return NextResponse.json(
            { error: `Horario inválido para ${key}` },
            { status: 400 }
          );
        }
      }
    }

    if (body.holidays) {
      const invalid = body.holidays.some(
        (date) => !/^\d{4}-\d{2}-\d{2}$/.test(date)
      );
      if (invalid) {
        return NextResponse.json(
          { error: "Las fechas festivas deben usar formato YYYY-MM-DD" },
          { status: 400 }
        );
      }
    }

    if (body.chatColors) {
      const hex = /^#[0-9a-fA-F]{6}$/;
      for (const color of Object.values(body.chatColors)) {
        if (!hex.test(color)) {
          return NextResponse.json(
            { error: "Los colores deben ser hex válidos (#RRGGBB)" },
            { status: 400 }
          );
        }
      }
    }

    if (body.inactivityFarewellMessage !== undefined) {
      const msg = body.inactivityFarewellMessage.trim();
      if (!msg) {
        return NextResponse.json(
          { error: "El mensaje de cierre no puede estar vacío" },
          { status: 400 }
        );
      }
      if (msg.length > 2000) {
        return NextResponse.json(
          { error: "El mensaje no puede exceder 2000 caracteres" },
          { status: 400 }
        );
      }
    }

    const before = getAdminSettings();

    const saved = saveAdminSettings({
      businessName: body.businessName?.trim(),
      timezone: body.timezone?.trim(),
      businessHours: body.businessHours ?? DEFAULT_BUSINESS_HOURS,
      holidays: body.holidays?.sort(),
      chatColors: body.chatColors,
      welcomeMessage: body.welcomeMessage,
      menuEnabled: body.menuEnabled,
      urgencyKeywords: body.urgencyKeywords,
      inactivityFarewellMessage: body.inactivityFarewellMessage?.trim(),
    });

    auditSettingsChanges(auth.id, auth.username, before, saved);

    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al guardar" },
      { status: 500 }
    );
  }
}
