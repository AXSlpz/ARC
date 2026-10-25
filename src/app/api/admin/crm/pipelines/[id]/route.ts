import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  crmFail,
  parseCrmBody,
  parsePositiveId,
  readJsonBody,
  requireCrmWrite,
} from "@/lib/crm/http";
import { deletePipeline, listPipelines, updatePipeline } from "@/lib/crm/pipelines";
import { PipelineUpdateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(PipelineUpdateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    if (!parsed.data.name) {
      return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
    }
    updatePipeline(id, parsed.data.name);
    logAudit(auth.id, auth.username, "crm.pipeline.update", "crm_pipeline", id);
    return NextResponse.json({ pipelines: listPipelines() });
  } catch (err) {
    return crmFail(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  try {
    const id = parsePositiveId((await params).id);
    deletePipeline(id);
    logAudit(auth.id, auth.username, "crm.pipeline.delete", "crm_pipeline", id);
    return NextResponse.json({ pipelines: listPipelines() });
  } catch (err) {
    return crmFail(err);
  }
}
