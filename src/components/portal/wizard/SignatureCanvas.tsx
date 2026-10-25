"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface SignatureResult {
  /** Base64 PNG del trazo (solo para presentación, no se persiste en DB) */
  canvasDataUrl: string | null;
  /** Nombre completo escrito (para modo accesible) */
  typedName: string;
  /** Indica si hay firma válida (trazo o nombre confirmado) */
  hasSignature: boolean;
}

interface Props {
  signerName?: string;
  onSign: (result: SignatureResult) => void;
  disabled?: boolean;
  className?: string;
}

export function SignatureCanvas({
  signerName = "",
  onSign,
  disabled = false,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [mode, setMode] = useState<"canvas" | "text">("canvas");
  const [typedName, setTypedName] = useState(signerName);
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Refs para preservar trazo al redimensionar
  const hasStrokeRef = useRef(false);
  const savedImageRef = useRef<string | null>(null);

  // ID único para aria-describedby
  const hintId = useId();

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? canvas.width / rect.width : 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2.5 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }, []);

  // El bitmap sigue al tamaño visible. Sin ctx.scale, para que el trazo no se desplace.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applySize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = window.devicePixelRatio ?? 1;
      const nextW = Math.max(1, Math.round(width * ratio));
      const nextH = Math.max(1, Math.round(height * ratio));
      if (canvas.width === nextW && canvas.height === nextH) return;

      const saved = hasStrokeRef.current ? canvas.toDataURL("image/png") : null;
      if (saved) savedImageRef.current = saved;

      canvas.width = nextW;
      canvas.height = nextH;

      if (saved) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = saved;
      }
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const getPos = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (disabled) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const pos = getPos(e);
      if (!pos) return;
      const ctx = getCtx();
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      lastPoint.current = pos;
      setIsDrawing(true);
    },
    [disabled, getCtx, getPos]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing || disabled) return;
      const pos = getPos(e);
      if (!pos) return;
      const ctx = getCtx();
      if (!ctx) return;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastPoint.current = pos;
    },
    [isDrawing, disabled, getCtx, getPos]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasStroke(true);
    hasStrokeRef.current = true;
    lastPoint.current = null;
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      savedImageRef.current = dataUrl;
      onSign({
        canvasDataUrl: dataUrl,
        typedName,
        hasSignature: true,
      });
    }
  }, [isDrawing, onSign, typedName]);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    hasStrokeRef.current = false;
    savedImageRef.current = null;
    onSign({ canvasDataUrl: null, typedName, hasSignature: false });
  }, [onSign, typedName]);

  // Modo texto: confirmar nombre
  const handleConfirmName = useCallback(() => {
    if (!typedName.trim()) return;
    setNameConfirmed(true);
    onSign({
      canvasDataUrl: null,
      typedName: typedName.trim(),
      hasSignature: true,
    });
  }, [typedName, onSign]);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Selector de modo */}
      <div className="flex gap-2 text-sm" role="group" aria-label="Modo de firma">
        <button
          type="button"
          onClick={() => setMode("canvas")}
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            mode === "canvas"
              ? "bg-slate-800 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
          aria-pressed={mode === "canvas"}
        >
          Trazar firma
        </button>
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
            mode === "text"
              ? "bg-slate-800 text-white"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
          aria-pressed={mode === "text"}
        >
          Escribir nombre
        </button>
      </div>

      {mode === "canvas" ? (
        <div className="space-y-2">
          {/* Instrucción para usuarios de teclado/lector de pantalla */}
          <p id={hintId} className="text-xs text-slate-400">
            Si usas teclado o lector de pantalla, activa{" "}
            <strong>«Escribir nombre»</strong> para firmar sin necesidad de trazado.
          </p>
          {/* Canvas de firma */}
          <div
            className={`relative overflow-hidden rounded-xl border-2 transition-colors motion-reduce:transition-none ${
              isDrawing
                ? "border-emerald-400"
                : hasStroke
                  ? "border-emerald-300"
                  : "border-slate-200"
            } bg-white`}
            style={{ touchAction: "none" }}
          >
            <canvas
              ref={canvasRef}
              className="block h-32 w-full cursor-crosshair touch-none sm:h-36"
              aria-label="Área de firma — traza tu firma con el puntero"
              aria-describedby={hintId}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            {!hasStroke && !isDrawing && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="select-none text-sm text-slate-300">
                  Traza tu firma aquí
                </span>
              </div>
            )}
          </div>

          {hasStroke && (
            <button
              type="button"
              onClick={clearCanvas}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              Borrar y volver a trazar
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={typedName}
              onChange={(e) => {
                setTypedName(e.target.value);
                setNameConfirmed(false);
              }}
              placeholder="Escribe tu nombre completo"
              disabled={disabled}
              autoComplete="name"
              className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              aria-label="Nombre completo para firma alternativa"
            />
            <button
              type="button"
              onClick={handleConfirmName}
              disabled={!typedName.trim() || disabled}
              className="rounded-lg bg-emerald-600 px-3.5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirmar
            </button>
          </div>
          {nameConfirmed && (
            <p className="text-xs text-emerald-600" role="status">
              ✓ Nombre confirmado como firma alternativa.
            </p>
          )}
          <p className="text-xs text-slate-400">
            Al confirmar tu nombre, aceptas que esta declaración tiene el mismo valor que una firma trazada.
          </p>
        </div>
      )}
    </div>
  );
}
