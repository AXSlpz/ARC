import type { Metadata } from "next";
import { PortalHeader } from "@/components/portal/PortalHeader";

export const metadata: Metadata = {
  title: "ARC — Portal de clientes",
  description: "Consulta y da seguimiento a tus solicitudes con ARC.",
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <PortalHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
