/**
 * GET /api/admin/portal-claims
 * Lista claims del portal para revisión del admin.
 * Requiere autenticación admin.
 *
 * Query params:
 *   status  — "pending" | "conflict" | "approved" | "rejected" (default: pending,conflict)
 */
import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireAdmin } from "@/lib/auth";
import { listPendingClaimsAdmin } from "@/lib/portal/registration-admin";
import type { PropertyClaimStatus } from "@/lib/portal/property-claims";

export const dynamic = "force-dynamic";

const VALID_STATUSES: PropertyClaimStatus[] = [
  "pending",
  "conflict",
  "approved",
  "rejected",
];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (isAuthError(auth)) return auth;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");

  let statuses: PropertyClaimStatus[] | undefined;
  if (statusParam) {
    // Acepta comma-separated: "pending,conflict"
    const parts = statusParam.split(",").map((s) => s.trim());
    statuses = parts.filter((s): s is PropertyClaimStatus =>
      (VALID_STATUSES as string[]).includes(s)
    );
    if (statuses.length === 0) statuses = undefined;
  }

  const claims = listPendingClaimsAdmin(statuses ? { status: statuses } : {});
  return NextResponse.json({ claims });
}
