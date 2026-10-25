import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthError, requireAdmin } from "@/lib/auth";
import {
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/lib/admin-notifications";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const readSchema = z
  .object({
    id: z.number().int().positive().optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || value.id != null, {
    message: "Indica la notificación.",
  });

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const ip = getClientIp(req);
  if (isRateLimited(`admin-notices:${auth.id}:${ip}`, 90, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiadas consultas." }, { status: 429 });
  }
  return NextResponse.json(listAdminNotifications(auth.id));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  const ip = getClientIp(req);
  if (isRateLimited(`admin-notices-read:${auth.id}:${ip}`, 60, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Demasiados intentos." }, { status: 429 });
  }

  const parsed = readSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  if (parsed.data.all) {
    markAllAdminNotificationsRead(auth.id);
    return NextResponse.json({ ok: true });
  }

  const id = parsed.data.id;
  if (id == null || !markAdminNotificationRead(auth.id, id)) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
