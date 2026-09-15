"use client";

import type { SessionUser } from "@/lib/admin-settings-types";
import { ROLE_LABELS } from "@/lib/admin-settings-types";
interface QRScreenProps {
  status: "disconnected" | "qr" | "connecting";
  qrPng: string | null;
  elapsed: number;
  user: SessionUser;
  onLogout: () => void;
}

export function QRScreen({
  status,
  qrPng,
  elapsed,
  user,
  onLogout,
}: QRScreenProps) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div>
          <p className="text-sm font-medium text-gray-800">
            {user.displayName || user.username}
          </p>
          <p className="text-xs text-gray-500">
            {ROLE_LABELS[user.role]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Salir
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-sm w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Conectar WhatsApp
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Escanea el codigo QR con tu telefono
          </p>

          {status === "qr" && qrPng && (
            <>
              <img
                src={qrPng}
                alt="Codigo QR de WhatsApp"
                className="mx-auto w-64 h-64 rounded-lg"
              />
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-sm text-amber-600">
                  Esperando escaneo...
                </span>
              </div>
            </>
          )}

          {status === "connecting" && qrPng && (
            <>
              <img
                src={qrPng}
                alt="Codigo QR de WhatsApp"
                className="mx-auto w-64 h-64 rounded-lg opacity-50"
              />
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-sm text-blue-600">
                  Conectando...
                </span>
              </div>
            </>
          )}

          {status === "connecting" && !qrPng && (
            <div className="py-12">
              <div className="w-10 h-10 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-gray-500 mt-4">
                Conectando...
              </p>
            </div>
          )}

          {status === "disconnected" && (
            <div className="py-12">
              {elapsed > 10 ? (
                <div className="text-center">
                  <p className="text-sm text-red-500 font-medium">
                    No se pudo conectar
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Verifica que el proceso bot este corriendo (npm run start:bot)
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-10 h-10 border-4 border-gray-200 border-t-gray-500 rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-gray-500 mt-4">
                    Esperando al bot...
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
