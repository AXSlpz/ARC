import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  crmFail,
  parseCrmBody,
  readJsonBody,
  requireCrmRead,
  requireCrmWrite,
} from "@/lib/crm/http";
import { createPipeline, listPipelines } from "@/lib/crm/pipelines";
import { PipelineCreateSchema } from "@/lib/crm/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCrmRead("crm_pipelines");
  if (isAuthError(auth)) return auth;
  return NextResponse.json({ pipelines: listPipelines() });
}

export async function POST(req: NextRequest) {
  const auth = await requireCrmWrite();
  if (isAuthError(auth)) return auth;
  const parsed = parseCrmBody(PipelineCreateSchema, await readJsonBody(req));
  if (!parsed.ok) return parsed.response;
  try {
    const pipeline = createPipeline(parsed.data.name);
    logAudit(auth.id, auth.username, "crm.pipeline.create", "crm_pipeline", pipeline.id, {
      name: pipeline.name,
    });
    return NextResponse.json({ pipelines: listPipelines() }, { status: 201 });
  } catch (err) {
    return crmFail(err);
  }
}
