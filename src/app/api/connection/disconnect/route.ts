import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { setWaLineState, getWaLine } from "@/lib/db";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { isRateLimited, getClientIp } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { maskPhone } from "@/lib/audit-settings";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;
  if (isRateLimited(`ip:${getClientIp(req)}:admin-write`, 60, 60_000)) {
    return NextResponse.json({ error: "Demasiadas solicitudes" }, { status: 429 });
  }

  let lineId = 1;
  try {
    const body = await req.json();
    if (body?.lineId != null) {
      lineId = parseInt(String(body.lineId), 10);
    }
  } catch {}

  if (lineId !== 1) {
    return NextResponse.json({ error: "lineId inválido" }, { status: 400 });
  }

  const line = getWaLine(lineId);
  if (!line) {
    return NextResponse.json({ error: "Línea no encontrada" }, { status: 404 });
  }

  if (line.provider === "meta") {
    return NextResponse.json(
      {
        error:
          "Esta línea usa Meta Cloud API. Desconecta o cambia el número desde Meta Business, no desde QR.",
      },
      { status: 400 }
    );
  }

  setWaLineState(lineId, {
    status: "disconnected",
    qr_string: null,
    phone: null,
  });

  const authDir = path.resolve(process.cwd(), "auth", `line-${lineId}`);
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }

  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(path.join(dataDir, `.restart-${lineId}`), "");

  logAudit(auth.id, auth.username, "line.disconnect", "wa_line", lineId, {
    lineId,
    lineName: line.name,
    phoneMasked: line.phone ? maskPhone(line.phone) : "—",
    previousStatus: line.status,
  });

  return NextResponse.json({ ok: true, lineId });
}
