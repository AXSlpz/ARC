"use client";

import type { SessionUser } from "@/lib/admin-settings-types";
import { ROLE_LABELS } from "@/lib/admin-settings-types";

export interface WaLineStatus {
  id: number;
  name: string;
  status: "disconnected" | "qr" | "connecting" | "connected";
  phone: string | null;
  qrPng: string | null;
  updatedAt: number;
  provider?: "baileys" | "meta";
}

interface LineSetupScreenProps {
  lines: WaLineStatus[];
  connectedCount: number;
  elapsed: number;
  user: SessionUser;
  isAdmin: boolean;
  onLogout: () => void;
  onContinue?: () => void;
}

function LineCard({ line, showQr }: { line: WaLineStatus; showQr: boolean }) {
  const isConnected = line.status === "connected";
  const displayQr =
    showQr &&
    (line.status === "qr" || line.status === "connecting") &&
    line.qrPng;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">{line.name}</h2>
        {isConnected ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Conectada
          </span>
        ) : line.status === "connecting" ? (
          <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
            Conectando...
          </span>
        ) : line.status === "qr" ? (
          <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
            Esperando QR
          </span>
        ) : (
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            Desconectada
          </span>
        )}
      </div>

      {isConnected && line.phone && (
        <p className="text-sm text-gray-600 font-mono mb-3">+{line.phone}</p>
      )}

      {displayQr && (
        <div className="text-center">
          <img
            src={line.qrPng!}
            alt={`QR ${line.name}`}
            className={`mx-auto w-56 h-56 rounded-lg ${
              line.status === "connecting" ? "opacity-50" : ""
            }`}
          />
          <p className="text-xs text-gray-500 mt-2">
            Escanea con WhatsApp → Dispositivos vinculados
          </p>
        </div>
      )}

      {!showQr && !isConnected && line.status !== "connecting" && (
        <div className="py-6 text-center">
          <p className="text-sm text-gray-500">
            Esperando conexión del administrador
          </p>
        </div>
      )}

      {line.status === "disconnected" && showQr && (
        <div className="py-8 text-center">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 mt-3">Generando código QR...</p>
          <p className="text-xs text-gray-400 mt-1">Listo en unos segundos</p>
        </div>
      )}

      {line.status === "connecting" && !line.qrPng && (
        <div className="py-8 text-center">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-gray-500 mt-3">Conectando...</p>
        </div>
      )}
    </div>
  );
}

export function LineSetupScreen({
  lines,
  connectedCount,
  elapsed,
  user,
  isAdmin,
  onLogout,
  onContinue,
}: LineSetupScreenProps) {
  const botIsAlive = lines.some(
    (line) =>
      line.status === "qr" ||
      line.status === "connecting" ||
      line.status === "connected"
  );
  const showBotError = connectedCount === 0 && elapsed > 10 && !botIsAlive;

  if (!isAdmin) {
    return (
      <div className="flex flex-col min-h-dvh bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
          <div>
            <p className="text-sm font-medium text-gray-800">
              {user.displayName || user.username}
            </p>
            <p className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-50"
          >
            Salir
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          {connectedCount >= 1 ? (
            <>
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                <span className="text-emerald-600 text-xl">✓</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Líneas activas
              </h1>
              <p className="text-sm text-gray-500 mb-6 max-w-md">
                {connectedCount} línea{connectedCount !== 1 ? "s" : ""} conectada
                {connectedCount !== 1 ? "s" : ""}. Puedes entrar al panel de
                atención.
              </p>
              {onContinue && (
                <button
                  onClick={onContinue}
                  className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Entrar al panel
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-12 h-12 border-4 border-gray-200 border-t-emerald-500 rounded-full animate-spin mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">
                Esperando conexión
              </h1>
              <p className="text-sm text-gray-500 max-w-md">
                Un administrador debe conectar las líneas de WhatsApp antes de
                que puedas atender conversaciones. Contacta a tu administrador.
              </p>
              {showBotError && (
                <p className="text-sm text-red-500 mt-4">
                  El servicio del bot no está disponible. Avisa al administrador.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div>
          <p className="text-sm font-medium text-gray-800">
            {user.displayName || user.username}
          </p>
          <p className="text-xs text-gray-500">{ROLE_LABELS[user.role]}</p>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          Salir
        </button>
      </div>

      <div className="flex flex-1 flex-col min-h-0">
        <div className="text-center pt-4 pb-2 shrink-0 px-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Conectar líneas WhatsApp
          </h1>
          <p className="text-sm text-gray-500">
            Escanea el código QR de cada línea que quieras activar
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Escanea un QR a la vez — están separados a los lados de la pantalla
          </p>
          {showBotError && (
            <p className="text-sm text-red-500 mt-2">
              No se pudo conectar. Verifica que el bot esté corriendo (
              <code className="text-xs">npm run start:bot</code>)
            </p>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center min-h-0 px-2 sm:px-6 lg:px-10 xl:px-16 pb-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-10 lg:gap-8 w-full max-w-[1400px]">
            {lines.map((line, index) => (
              <div
                key={line.id}
                className={`w-full max-w-sm mx-auto lg:mx-0 lg:max-w-xs shrink-0 ${
                  index === 0 ? "lg:mr-auto" : "lg:ml-auto"
                }`}
              >
                <LineCard line={line} showQr={isAdmin} />
              </div>
            ))}
          </div>
        </div>

        {connectedCount >= 1 && onContinue && (
          <div className="pb-6 text-center shrink-0">
            <button
              onClick={onContinue}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Continuar al panel ({connectedCount} línea
              {connectedCount !== 1 ? "s" : ""} activa
              {connectedCount !== 1 ? "s" : ""})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
