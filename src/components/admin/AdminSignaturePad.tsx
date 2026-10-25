"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

export function AdminSignaturePad({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [hasStroke, setHasStroke] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistory = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      const nextW = Math.max(1, Math.round(width * ratio));
      const nextH = Math.max(1, Math.round(height * ratio));
      if (canvas.width === nextW && canvas.height === nextH) return;
      const previous = canvas.toDataURL("image/png");
      canvas.width = nextW;
      canvas.height = nextH;
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = previous;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function context() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? canvas.width / rect.width : 1;
    ctx.lineWidth = 2.4 * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
    return ctx;
  }

  function snapshot() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = [];
    syncHistory();
  }

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const pos = point(event);
    const ctx = context();
    if (!pos || !ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    snapshot();
    drawing.current = true;
    lastPoint.current = pos;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + 0.01, pos.y + 0.01);
    ctx.stroke();
    setHasStroke(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const pos = point(event);
    const ctx = context();
    const prev = lastPoint.current;
    if (!pos || !ctx || !prev) return;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
  }

  function onPointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function restore(image: ImageData) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.putImageData(image, 0, 0);
    const blank = image.data.every((value, index) => index % 4 !== 3 || value === 0);
    setHasStroke(!blank);
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const previous = undoStack.current.pop();
    if (!canvas || !ctx || !previous) return;
    redoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    restore(previous);
    syncHistory();
  }

  function redo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const next = redoStack.current.pop();
    if (!canvas || !ctx || !next) return;
    undoStack.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    restore(next);
    syncHistory();
  }

  function clearPad() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !hasStroke) return;
    snapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], "firma.png", { type: "image/png" }));
    }, "image/png");
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-md"
        aria-label="Cerrar dibujo de firma"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="signature-pad-title"
        className="relative z-10 w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"
      >
        <h2 id="signature-pad-title" className="text-lg font-semibold text-slate-900">
          Dibuja tu firma
        </h2>
        <p className="mt-1 text-sm text-slate-500">Traza la firma dentro del recuadro.</p>
        <canvas
          ref={canvasRef}
          className="mt-4 h-44 w-full touch-none rounded-xl border border-slate-300 bg-white"
          aria-label="Área para dibujar la firma"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={clearPad}
            disabled={!hasStroke}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            Borrar
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            Rehacer
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!hasStroke}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
