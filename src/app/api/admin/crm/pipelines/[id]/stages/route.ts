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
import { listPipelines, replacePipelineStages } from "@/lib/crm/pipelines";
import { PipelineStagesSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(PipelineStagesSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const id = parsePositiveId((await params).id);
    replacePipelineStages(id, parsed.data.stages);
    logAudit(auth.id, auth.username, "crm.pipeline.stages", "crm_pipeline", id, {
      count: parsed.data.stages.length,
    });
    return NextResponse.json({ pipelines: listPipelines() });
  } catch (err) {
    return crmFail(err);
  }
}
