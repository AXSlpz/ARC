"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { IneDraft, IneFields } from "@/lib/portal/ine-fields";
import { IneManualDialog, type ManualIneInput } from "@/components/portal/IneManualDialog";

const ASPECT = 85.6 / 54;
const MIN_WIDTH = 900;

const FIELD_ROWS: Array<{ key: keyof IneFields; label: string }> = [
  { key: "nombreCompleto", label: "Nombre" },
  { key: "fechaNacimiento", label: "Nacimiento" },
  { key: "curp", label: "CURP" },
  { key: "anioVencimiento", label: "Vigencia" },
  { key: "claveElector", label: "Clave de elector" },
];

export interface IneReadResult {
  token?: string;
  fields: IneFields;
}

type Side = "front" | "back";
type Shot = { blob: Blob; url: string };

const ENDPOINT: Record<"register" | "profile" | "match", string> = {
  register: "/api/portal/identity/read",
  profile: "/api/portal/identity/save",
  match: "/api/portal/identity/match",
};

export function IneFieldsList({ fields }: { fields: IneFields }) {
  const reduced = useReducedMotion();
  return (
    <dl className="space-y-1.5 text-sm">
      {FIELD_ROWS.map((row, index) => (
        <motion.div
          key={row.key}
          className="flex justify-between gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduced ? 0 : index * 0.12, duration: 0.3 }}
        >
          <dt className="text-slate-500">{row.label}</dt>
          <dd
            className={`text-right font-medium ${
              fields[row.key] === "" ? "text-amber-700" : "text-slate-800"
            }`}
          >
            {fields[row.key] === "" ? "No leído" : String(fields[row.key])}
          </dd>
        </motion.div>
      ))}
    </dl>
  );
}

export function IneCapture({
  purpose,
  onReady,
  onClear,
  compact = false,
}: {
  purpose: "register" | "profile" | "match";
  onReady: (result: IneReadResult) => void;
  onClear?: () => void;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [side, setSide] = useState<Side>("front");
  const [shots, setShots] = useState<Partial<Record<Side, Shot>>>({});
  const [preview, setPreview] = useState<Shot | null>(null);
  const [fileImage, setFileImage] = useState<HTMLImageElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cameraOn, setCameraOn] = useState(false);
  const [phase, setPhase] = useState<"aim" | "analyze" | "review" | "done">("aim");
  const [fields, setFields] = useState<IneFields | null>(null);
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState<IneDraft | null>(null);
  const [issueFields, setIssueFields] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualError, setManualError] = useState("");
  const [error, setError] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const preferCamera = useRef(false);

  const bothReady = Boolean(shots.front && shots.back);
  const showScan = phase === "analyze" && Boolean(shots.front);
  const sideLabel = side === "front" ? "frente" : "reverso";
  const frameImage = fileImage ? null : preview?.url ?? null;
  const guide =
    phase === "analyze"
      ? "Estamos leyendo la credencial."
      : phase === "review"
        ? "Revisa los datos de abajo."
        : bothReady
          ? "No se pudo completar la lectura."
          : side === "front"
            ? "Coloca el frente de tu INE dentro del marco"
            : "Ahora el reverso, con el código de barras arriba";

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [cameraOn, preview, fileImage, side, phase]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    setError("");
    setFileImage(null);
    preferCamera.current = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraOn(false);
      setError("Este equipo no tiene cámara. Elige el archivo de la foto.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraOn(false);
      setError("No se pudo abrir la cámara. Elige el archivo de la foto.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  function acceptShot(blob: Blob) {
    const previous = shots[side];
    if (previous) URL.revokeObjectURL(previous.url);
    const shot = { blob, url: URL.createObjectURL(blob) };
    const next = { ...shots, [side]: shot };
    setShots(next);
    setPreview(null);
    setFileImage(null);
    setError("");
    if (side === "front") {
      setSide("back");
      if (preferCamera.current) void startCamera();
      else stopCamera();
      return;
    }
    stopCamera();
    if (next.front) void analyze(next.front, shot);
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 2) {
      setError("La cámara todavía no está lista.");
      return;
    }
    const canvas = cropCover(video);
    const problem = qualityMessage(canvas, sideLabel);
    if (problem) {
      setError(problem);
      return;
    }
    acceptShot(await canvasToJpeg(canvas));
  }

  async function useFileFrame() {
    if (!fileImage) return;
    const frameW = frameRef.current?.clientWidth || 320;
    const canvas = cropImage(fileImage, pan.x, pan.y, frameW);
    const problem = qualityMessage(canvas, sideLabel);
    if (problem) {
      setError(problem);
      return;
    }
    setFileImage(null);
    acceptShot(await canvasToJpeg(canvas));
  }

  function retakeSide(which: Side) {
    setShots((current) => {
      const shot = current[which];
      if (shot) URL.revokeObjectURL(shot.url);
      const next = { ...current };
      delete next[which];
      return next;
    });
    setSide(which);
    setPreview(null);
    setFileImage(null);
    setPan({ x: 0, y: 0 });
    setPhase("aim");
    setError("");
    if (preferCamera.current) void startCamera();
    else stopCamera();
  }

  function resetAll() {
    for (const shot of Object.values(shots)) {
      if (shot) URL.revokeObjectURL(shot.url);
    }
    if (preview) URL.revokeObjectURL(preview.url);
    setShots({});
    setPreview(null);
    setFileImage(null);
    setFields(null);
    setToken("");
    setDraft(null);
    setIssueFields([]);
    setSide("front");
    setPhase("aim");
    setError("");
    onClear?.();
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      setError("Para leer la credencial necesitamos una foto de cada lado, no un PDF.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Usa una foto JPG, PNG o WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(`La foto del ${sideLabel} pesa más de 10 MB.`);
      return;
    }
    preferCamera.current = false;
    stopCamera();
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      setPan({ x: 0, y: 0 });
      setFileImage(image);
      setError("");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("No se pudo abrir esa foto.");
    };
    image.src = url;
  }

  async function analyze(front: Shot, back: Shot) {
    setPhase("analyze");
    setError("");
    const body = new FormData();
    body.append("front", front.blob, "frente.jpg");
    body.append("back", back.blob, "reverso.jpg");
    try {
      const res = await fetch(ENDPOINT[purpose], { method: "POST", body });
      const data = (await res.json().catch(() => null)) as {
        token?: string;
        draft?: IneDraft;
        issues?: Array<{ field: string }>;
        warning?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.token || !data.draft) {
        setError(data?.error ?? "No se pudo leer la credencial.");
        setPhase("aim");
        return;
      }
      setToken(data.token);
      setDraft(data.draft);
      setIssueFields((data.issues ?? []).map((issue) => issue.field));
      setError(data.warning ?? "");
      setPhase("review");
    } catch {
      setError("No se pudo leer la credencial. Revisa tu conexión.");
      setPhase("aim");
    }
  }

  async function confirmDraft() {
    if (!draft || !token) return;
    setConfirming(true);
    setError("");
    try {
      const res = await fetch("/api/portal/identity/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ...draft }),
      });
      const data = (await res.json().catch(() => null)) as {
        token?: string;
        fields?: IneFields;
        error?: string;
      } | null;
      if (!res.ok || !data?.fields) {
        setError(data?.error ?? "Revisa los datos.");
        setConfirming(false);
        return;
      }
      setFields(data.fields);
      setPhase("done");
      setConfirming(false);
      onReady({ token: data.token ?? token, fields: data.fields });
    } catch {
      setError("No se pudieron guardar los datos. Revisa tu conexión.");
      setConfirming(false);
    }
  }

  async function saveManual(input: ManualIneInput) {
    setConfirming(true);
    setManualError("");
    try {
      const res = await fetch("/api/portal/identity/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose, ...input }),
      });
      const data = (await res.json().catch(() => null)) as {
        token?: string;
        fields?: IneFields;
        error?: string;
      } | null;
      if (!res.ok || !data?.fields) {
        setManualError(data?.error ?? "No se pudieron guardar los datos.");
        setConfirming(false);
        return;
      }
      setFields(data.fields);
      setManualOpen(false);
      setPhase("done");
      setConfirming(false);
      onReady({ token: data.token, fields: data.fields });
    } catch {
      setManualError("No se pudieron guardar los datos. Revisa tu conexión.");
      setConfirming(false);
    }
  }

  function patchDraft(patch: Partial<IneDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  return (
    <div className="space-y-4">
      {compact ? null : (
      <div>
        <h2 className="text-base font-semibold text-slate-800">Identificación (INE)</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {phase === "done"
            ? "Datos leídos de la credencial."
            : "Dos fotos, primero el frente y después el reverso."}
        </p>
      </div>
      )}

      {phase !== "done" && (
        <>
          <p className="text-sm text-slate-600">
            Son dos fotos: primero el frente y después el reverso.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <SideChip
              title="Frente"
              ready={Boolean(shots.front)}
              pendingHint={side === "front" ? "Tómala ahora" : "Pendiente"}
              onRetake={shots.front && phase === "aim" ? () => retakeSide("front") : undefined}
            />
            <SideChip
              title="Reverso"
              ready={Boolean(shots.back)}
              pendingHint={shots.front ? "Falta esta" : "Después del frente"}
              onRetake={shots.back && phase === "aim" ? () => retakeSide("back") : undefined}
            />
          </div>
          <p className="text-sm font-medium text-slate-800">{guide}</p>
          {side === "front" && phase === "aim" && !shots.front && (
            <p className="text-xs text-slate-500">La foto del ciudadano queda a la izquierda del marco.</p>
          )}

          {(phase === "analyze" || (bothReady && !fileImage)) && (
            <div className="grid grid-cols-2 gap-2">
              <ScanPhoto src={shots.front?.url} scanning={showScan} reduced={reduced} label="Frente" />
              <ScanPhoto src={shots.back?.url} scanning={showScan} reduced={reduced} label="Reverso" />
            </div>
          )}
          {phase === "analyze" && (
            <div
              className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
              role="status"
            >
              <span
                className={
                  reduced
                    ? "h-4 w-4 rounded-full bg-emerald-500"
                    : "h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
                }
                aria-hidden="true"
              />
              <p className="text-sm font-medium text-emerald-800">Leyendo tu INE…</p>
            </div>
          )}

          {phase === "aim" && !bothReady && (
            <div
              ref={frameRef}
              className="relative mx-auto w-full max-w-xl overflow-hidden rounded-xl border-2 border-emerald-500 bg-slate-900"
              style={{ aspectRatio: `${ASPECT}` }}
            >
              {fileImage ? (
                <FileFrame image={fileImage} pan={pan} onPan={setPan} dragRef={dragRef} />
              ) : frameImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frameImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
              )}
              {!cameraOn && !frameImage && !fileImage && (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white">
                  Elige una foto de tu INE y encuádrala en el marco.
                </p>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}{" "}
              {purpose !== "register" && error.includes("perfil") && (
                <Link href="/portal/perfil" className="font-semibold underline">
                  Ir a Mi perfil
                </Link>
              )}
            </p>
          )}

          {phase === "aim" && (
            <div className="flex flex-wrap gap-2">
              {bothReady && !fileImage ? (
                <button
                  type="button"
                  onClick={() => shots.front && shots.back && void analyze(shots.front, shots.back)}
                  className={btn}
                >
                  Reintentar lectura
                </button>
              ) : fileImage ? (
                <button type="button" onClick={() => void useFileFrame()} className={btn}>
                  Usar este encuadre
                </button>
              ) : cameraOn ? (
                <button type="button" onClick={() => void takePhoto()} className={btn}>
                  Tomar foto
                </button>
              ) : (
                <button type="button" onClick={() => void startCamera()} className={btn}>
                  Abrir cámara
                </button>
              )}
              {!fileImage && !bothReady && (
                <label className={btnGhost}>
                  Elegir archivo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      void onPickFile(event.target.files?.[0] ?? null);
                      event.target.value = "";
                    }}
                  />
                </label>
              )}
              {!fileImage && !bothReady && !cameraOn && purpose !== "register" && (
                <button
                  type="button"
                  onClick={() => {
                    setManualError("");
                    setManualOpen(true);
                  }}
                  className={btnGhost}
                >
                  Ingresar manualmente
                </button>
              )}
            </div>
          )}
          {phase === "aim" && (
            <p className="text-xs text-slate-400">JPG, PNG o WEBP · Máximo 10 MB por lado</p>
          )}
        </>
      )}

      {phase === "review" && draft && (
        <div
          className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void confirmDraft();
          }}
        >
          <p className="text-sm font-medium text-slate-800">
            {issueFields.length > 0
              ? "Algunos datos no se leyeron bien. Corrígelos y continúa."
              : "Revisa los datos. Corrige cualquiera que no se haya leído bien."}
          </p>
          <ManualField
            id="ine-paterno"
            label="Apellido paterno"
            value={draft.apellidoPaterno}
            bad={issueFields.includes("nombre")}
            onChange={(value) => patchDraft({ apellidoPaterno: value.toUpperCase() })}
          />
          <ManualField
            id="ine-materno"
            label="Apellido materno"
            value={draft.apellidoMaterno}
            onChange={(value) => patchDraft({ apellidoMaterno: value.toUpperCase() })}
          />
          <ManualField
            id="ine-nombres"
            label="Nombres"
            value={draft.nombres}
            bad={issueFields.includes("nombre")}
            onChange={(value) => patchDraft({ nombres: value.toUpperCase() })}
          />
          <ManualField
            id="ine-nacimiento"
            label="Fecha de nacimiento"
            value={draft.fechaNacimiento}
            bad={issueFields.includes("fecha de nacimiento")}
            placeholder="DD/MM/AAAA"
            onChange={(value) => patchDraft({ fechaNacimiento: value })}
          />
          <ManualField
            id="ine-curp"
            label="CURP"
            value={draft.curp}
            bad={issueFields.includes("CURP")}
            onChange={(value) => patchDraft({ curp: value.toUpperCase() })}
          />
          <ManualField
            id="ine-vigencia"
            label="Año de vigencia"
            value={draft.anioVencimiento}
            bad={issueFields.includes("vigencia")}
            inputMode="numeric"
            onChange={(value) => patchDraft({ anioVencimiento: value.replace(/\D/g, "").slice(0, 4) })}
          />
          <ManualField
            id="ine-clave"
            label="Clave de elector"
            value={draft.claveElector}
            bad={issueFields.includes("clave de elector")}
            onChange={(value) => patchDraft({ claveElector: value.toUpperCase() })}
          />
          <button type="button" onClick={() => void confirmDraft()} disabled={confirming} className={btn}>
            {confirming ? "Guardando…" : purpose === "profile" ? "Guardar" : "Continuar con estos datos"}
          </button>
        </div>
      )}

      <IneManualDialog
        open={manualOpen}
        saving={confirming}
        error={manualError}
        onClose={() => {
          if (confirming) return;
          setManualOpen(false);
        }}
        onSave={(input) => void saveManual(input)}
      />

      {phase === "done" && fields && (
        <motion.div
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0.2 : 0.35 }}
        >
          <p className="mb-3 text-sm font-semibold text-emerald-800">INE leída</p>
          <IneFieldsList fields={fields} />
          <button type="button" onClick={resetAll} className={`${btnGhost} mt-4`}>
            Volver a tomar las fotos
          </button>
        </motion.div>
      )}
    </div>
  );
}

const btn =
  "rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50";
const btnGhost =
  "cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700";

function ManualField({
  id,
  label,
  value,
  onChange,
  bad = false,
  placeholder,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  bad?: boolean;
  placeholder?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:outline-none focus:ring-2 sm:text-sm ${
          bad
            ? "border-amber-400 focus:border-amber-500 focus:ring-amber-400/40"
            : "border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/40"
        }`}
      />
    </label>
  );
}

function SideChip({
  title,
  ready,
  pendingHint,
  onRetake,
}: {
  title: string;
  ready: boolean;
  pendingHint: string;
  onRetake?: () => void;
}) {
  return (
    <div
      className={
        ready
          ? "rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2"
          : "rounded-lg border border-slate-200 bg-white px-3 py-2"
      }
    >
      <p className={ready ? "text-sm font-semibold text-emerald-800" : "text-sm font-semibold text-slate-700"}>
        {title}
      </p>
      <p className={ready ? "text-xs text-emerald-700" : "text-xs text-amber-700"}>
        {ready ? "Tomada" : pendingHint}
      </p>
      {onRetake && (
        <button type="button" onClick={onRetake} className="mt-1 text-xs font-medium text-slate-500 underline">
          Repetir
        </button>
      )}
    </div>
  );
}

function ScanPhoto({
  src,
  scanning,
  reduced,
  label,
}: {
  src?: string;
  scanning: boolean;
  reduced: boolean | null;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(120);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setHeight(node.clientHeight || 120);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-lg border border-emerald-200 bg-slate-900"
      style={{ aspectRatio: `${ASPECT}` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : null}
      {scanning && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]"
          animate={reduced ? { opacity: [0.35, 1, 0.35] } : { y: [0, Math.max(height - 2, 0)] }}
          transition={
            reduced
              ? { duration: 1.2, repeat: Infinity }
              : { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
          }
        />
      )}
    </div>
  );
}

function FileFrame({
  image,
  pan,
  onPan,
  dragRef,
}: {
  image: HTMLImageElement;
  pan: { x: number; y: number };
  onPan: (pan: { x: number; y: number }) => void;
  dragRef: MutableRefObject<{ x: number; y: number; panX: number; panY: number } | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * 2);
    canvas.height = Math.round(rect.height * 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = rect.width > 0 ? canvas.width / rect.width : 1;
    drawCover(ctx, image, canvas.width, canvas.height, pan.x * dpr, pan.y * dpr);
  }, [image, pan]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none"
      aria-label="Arrastra para centrar la credencial"
      onPointerDown={(event) => {
        dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        onPan({
          x: drag.panX + (event.clientX - drag.x),
          y: drag.panY + (event.clientY - drag.y),
        });
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
    />
  );
}

function coverRect(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
  panX = 0,
  panY = 0
) {
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const displayedW = srcW * scale;
  const displayedH = srcH * scale;
  const maxX = Math.max(0, (displayedW - boxW) / 2);
  const maxY = Math.max(0, (displayedH - boxH) / 2);
  const offsetX = clamp((displayedW - boxW) / 2 - panX, 0, maxX * 2);
  const offsetY = clamp((displayedH - boxH) / 2 - panY, 0, maxY * 2);
  return {
    sx: offsetX / scale,
    sy: offsetY / scale,
    sw: boxW / scale,
    sh: boxH / scale,
  };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  boxW: number,
  boxH: number,
  panX: number,
  panY: number
) {
  const { sx, sy, sw, sh } = coverRect(image.width, image.height, boxW, boxH, panX, panY);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, boxW, boxH);
}

function cropCover(video: HTMLVideoElement): HTMLCanvasElement {
  const boxW = video.clientWidth || 640;
  const boxH = video.clientHeight || boxW / ASPECT;
  const { sx, sy, sw, sh } = coverRect(video.videoWidth, video.videoHeight, boxW, boxH);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cropImage(
  image: HTMLImageElement,
  panX: number,
  panY: number,
  frameCssWidth: number
): HTMLCanvasElement {
  const boxW = 1600;
  const boxH = Math.round(boxW / ASPECT);
  const scale = boxW / Math.max(frameCssWidth, 1);
  const canvas = document.createElement("canvas");
  canvas.width = boxW;
  canvas.height = boxH;
  const ctx = canvas.getContext("2d");
  if (ctx) drawCover(ctx, image, boxW, boxH, panX * scale, panY * scale);
  return canvas;
}

function qualityMessage(canvas: HTMLCanvasElement, label: string): string | null {
  if (canvas.width < MIN_WIDTH) {
    return `La foto del ${label} quedó muy pequeña. Acerca la credencial al marco y repítela.`;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "No se pudo revisar la foto.";
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  let count = 0;
  const pixels = Math.floor(data.length / 4);
  const pixelStep = Math.max(4, Math.floor(pixels / 2000));
  for (let pixel = 0; pixel < pixels; pixel += pixelStep) {
    const index = pixel * 4;
    sum += (data[index]! + data[index + 1]! + data[index + 2]!) / 3;
    count += 1;
  }
  if (count > 0 && sum / count < 28) {
    return `La foto del ${label} está muy oscura. Busca más luz y repítela.`;
  }
  return null;
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("foto"))),
      "image/jpeg",
      0.92
    );
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
