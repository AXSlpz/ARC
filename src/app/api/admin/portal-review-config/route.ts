import { NextResponse } from "next/server";
import { isAuthError, requireAuth } from "@/lib/auth";
import db from "@/lib/db";
import {
  disableModificationForDevelopment,
  enableModificationForDevelopment,
  listCatalog,
  listModificationsForDevelopment,
} from "@/lib/portal/modification-catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const developments = db
    .prepare(
      `SELECT id, name, slug FROM developments
       WHERE active = 1
         AND slug NOT LIKE 'sec-dev-%'
         AND slug NOT LIKE 'testdev-%'
         AND slug NOT LIKE 'wizard-dev-%'
         AND slug NOT LIKE 'dev-sig-%'
       ORDER BY name`
    )
    .all() as Array<{ id: number; name: string; slug: string }>;

  const catalog = listCatalog()
    .filter((item) => !/^(sec-|cat-sig-|testdev-|wizard-|dev-sig-)/.test(item.slug))
    .map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
    }));

  const configs = developments.flatMap((dev) =>
    listModificationsForDevelopment(dev.id, { activeOnly: false }).map((row) => ({
      developmentId: dev.id,
      modificationCatalogId: row.modificationCatalogId,
      active: row.active,
    }))
  );

  const committee = db
    .prepare(
      `SELECT development_id AS developmentId, committee_name AS committeeName,
              committee_role AS committeeRole, active
       FROM committee_signature_config`
    )
    .all();

  return NextResponse.json({ developments, catalog, configs, committee });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");

  if (action === "modification") {
    const developmentId = Number(body?.developmentId);
    const modificationCatalogId = Number(body?.modificationCatalogId);
    const active = body?.active === true;
    if (!Number.isInteger(developmentId) || !Number.isInteger(modificationCatalogId)) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }
    if (active) {
      const result = enableModificationForDevelopment({
        developmentId,
        modificationCatalogId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    } else {
      disableModificationForDevelopment(developmentId, modificationCatalogId);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "committee") {
    const developmentId = Number(body?.developmentId);
    const committeeName = String(body?.committeeName ?? "").trim().slice(0, 120);
    const committeeRole = String(body?.committeeRole ?? "Comité de Arquitectura")
      .trim()
      .slice(0, 120);
    if (!Number.isInteger(developmentId) || developmentId <= 0 || committeeName.length < 2) {
      return NextResponse.json(
        { error: "Indica el desarrollo y el nombre de quien firma." },
        { status: 400 }
      );
    }
    db.prepare(
      `INSERT INTO committee_signature_config
         (development_id, committee_name, committee_role, active)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(development_id) DO UPDATE SET
         committee_name = excluded.committee_name,
         committee_role = excluded.committee_role,
         active = 1`
    ).run(developmentId, committeeName, committeeRole);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
}
