import type { Metadata } from "next";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { PendingClaimBanner } from "@/components/portal/PendingClaimBanner";
import { PortalStatusToast } from "@/components/portal/PortalStatusToast";
import { getPortalUser } from "@/lib/portal/auth";
import { getUserActiveClaim } from "@/lib/portal/registration-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ARC — Portal de clientes",
  description: "Consulta y da seguimiento a tus solicitudes con ARC.",
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPortalUser();

  // Pre-cargar el claim en el servidor para que PendingClaimBanner no parpadee.
  const activeClaim = user ? getUserActiveClaim(user.id) : null;
  const initialClaim =
    activeClaim && (activeClaim.status === "pending" || activeClaim.status === "conflict")
      ? {
          id: activeClaim.id,
          status: activeClaim.status,
          developmentId: activeClaim.developmentId,
          propertyIdentifier: activeClaim.propertyIdentifier,
          createdAt: activeClaim.createdAt,
        }
      : null;

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <PortalHeader initialUser={user} />
      {user ? <PortalStatusToast userId={user.id} /> : null}
      <main className="relative z-10 isolate mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PendingClaimBanner initialClaim={initialClaim} />
        {children}
      </main>
    </div>
  );
}
