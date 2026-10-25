"use client";

import Link from "next/link";
import type { PortalUser } from "@/lib/portal/types";

interface Props {
  user: PortalUser;
}

export function PortalInicioClient({ user }: Props) {
  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          Bienvenido, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Portal de residentes · ARC Desarrollo
        </p>
      </div>

      {/* Cards principales */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Solicitar modificación */}
        <Link
          href="/portal/modificaciones/nueva"
          className="group flex flex-col gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-5 transition-all hover:border-emerald-300 hover:shadow-sm active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-base font-semibold text-slate-900 group-hover:text-emerald-700">
              Solicitar modificación
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Inicia una solicitud de modificación a tu vivienda: pérgola, tanque de gas, calentador solar y más.
          </p>
        </Link>

        {/* Mis solicitudes */}
        <Link
          href="/portal/tickets"
          className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-sm active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <span className="text-base font-semibold text-slate-900 group-hover:text-slate-700">
              Mis solicitudes
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Consulta el estado y el seguimiento de tus solicitudes activas e históricas.
          </p>
        </Link>

        {/* Servicios ARC */}
        <Link
          href="/portal/servicios"
          className="group flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-5 transition-all hover:border-blue-300 hover:shadow-sm active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <span className="text-base font-semibold text-slate-900 group-hover:text-blue-700">
              Servicios ARC
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Consulta y solicita servicios disponibles para tu vivienda: instalaciones, mantenimiento y más.
          </p>
        </Link>

        {/* Mi perfil */}
        <Link
          href="/portal/perfil"
          className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-slate-300 hover:shadow-sm active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <span className="text-base font-semibold text-slate-900 group-hover:text-blue-700">
              Mi perfil
            </span>
          </div>
          <p className="text-sm text-slate-600">
            Actualiza tus datos, INE y contraseña.
          </p>
        </Link>
      </div>

      {/* Contexto informativo */}
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
        <div className="flex gap-3">
          <div className="mt-0.5 flex-shrink-0 text-amber-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-800">¿Cómo funciona?</p>
            <ul className="space-y-1 text-sm text-amber-700">
              <li>• Cada solicitud corresponde a <strong>una modificación</strong> específica.</li>
              <li>• El proceso incluye revisión de documentos e inspección.</li>
              <li>• Recibirás respuesta dentro del tiempo establecido por ARC.</li>
              <li>• Las modificaciones deben estar autorizadas antes de iniciar obra.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
