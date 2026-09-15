"use client";

import { useEffect, useState } from "react";
import { AuditLogView } from "./AuditLogView";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  keywords: string;
}

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface QuickReply {
  id: number;
  label: string;
  content: string;
}

interface AdminFeaturesProps {
  tab: "faq" | "tags" | "quickreplies" | "ai" | "audit";
  welcomeMessage: string;
  menuEnabled: boolean;
  urgencyKeywords: string[];
  onAiSettingsChange: (v: {
    welcomeMessage: string;
    menuEnabled: boolean;
    urgencyKeywords: string[];
  }) => void;
}

export function AdminFeatures({
  tab,
  welcomeMessage,
  menuEnabled,
  urgencyKeywords,
  onAiSettingsChange,
}: AdminFeaturesProps) {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

  const confirmDelete = (label: string) =>
    window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`);

  const [faqQ, setFaqQ] = useState("");
  const [faqA, setFaqA] = useState("");
  const [faqK, setFaqK] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#6b7280");
  const [qrLabel, setQrLabel] = useState("");
  const [qrContent, setQrContent] = useState("");
  const [urgencyText, setUrgencyText] = useState(urgencyKeywords.join(", "));

  useEffect(() => {
    const fromProps = urgencyKeywords.join(", ");
    setUrgencyText((prev) => {
      const prevCanonical = prev
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(", ");
      // No pisar mientras el usuario escribe espacios, comas o texto a medias.
      if (prevCanonical === fromProps) return prev;
      return fromProps;
    });
  }, [urgencyKeywords]);

  function parseUrgencyKeywordsInput(raw: string): string[] {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  useEffect(() => {
    if (tab === "faq") fetch("/api/admin/faq").then((r) => r.json()).then(setFaqs);
    if (tab === "tags") fetch("/api/admin/tags").then((r) => r.json()).then(setTags);
    if (tab === "quickreplies")
      fetch("/api/admin/quick-replies").then((r) => r.json()).then(setQuickReplies);
  }, [tab]);

  if (tab === "faq") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Preguntas frecuentes que la IA responde antes de buscar en PDFs.
        </p>
        <div className="grid gap-2">
          <input value={faqQ} onChange={(e) => setFaqQ(e.target.value)} placeholder="Pregunta" className="rounded-lg border px-3 py-2 text-sm" />
          <textarea value={faqA} onChange={(e) => setFaqA(e.target.value)} placeholder="Respuesta" className="rounded-lg border px-3 py-2 text-sm" rows={3} />
          <input value={faqK} onChange={(e) => setFaqK(e.target.value)} placeholder="Palabras clave (separadas por coma)" className="rounded-lg border px-3 py-2 text-sm" />
          <button
            onClick={async () => {
              const res = await fetch("/api/admin/faq", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: faqQ, answer: faqA, keywords: faqK }),
              });
              if (res.ok) {
                setFaqs(await (await fetch("/api/admin/faq")).json());
                setFaqQ(""); setFaqA(""); setFaqK("");
              }
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white w-fit"
          >
            Agregar FAQ
          </button>
        </div>
        <ul className="space-y-2">
          {faqs.map((f) => (
            <li key={f.id} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{f.question}</p>
              <p className="text-gray-600 mt-1">{f.answer}</p>
              <button onClick={async () => {
                if (!confirmDelete("esta FAQ")) return;
                await fetch(`/api/admin/faq?id=${f.id}`, { method: "DELETE" });
                setFaqs(await (await fetch("/api/admin/faq")).json());
              }} className="text-red-500 text-xs mt-2 hover:underline">Eliminar</button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (tab === "tags") {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <input value={tagName} onChange={(e) => setTagName(e.target.value)} placeholder="Nombre etiqueta" className="rounded-lg border px-3 py-2 text-sm flex-1" />
          <input type="color" value={tagColor} onChange={(e) => setTagColor(e.target.value)} className="h-10 w-14" />
          <button onClick={async () => {
            await fetch("/api/admin/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tagName, color: tagColor }) });
            setTags(await (await fetch("/api/admin/tags")).json());
            setTagName("");
          }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">Agregar</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-white" style={{ backgroundColor: t.color }}>
              {t.name}
              <button onClick={async () => {
                if (!confirmDelete(`la etiqueta "${t.name}"`)) return;
                await fetch(`/api/admin/tags?id=${t.id}`, { method: "DELETE" });
                setTags(await (await fetch("/api/admin/tags")).json());
              }} className="opacity-80 hover:opacity-100" aria-label={`Eliminar ${t.name}`}>×</button>
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "quickreplies") {
    return (
      <div className="space-y-4">
        <div className="grid gap-2">
          <input value={qrLabel} onChange={(e) => setQrLabel(e.target.value)} placeholder="Etiqueta botón" className="rounded-lg border px-3 py-2 text-sm" />
          <textarea value={qrContent} onChange={(e) => setQrContent(e.target.value)} placeholder="Texto del mensaje" className="rounded-lg border px-3 py-2 text-sm" rows={2} />
          <button onClick={async () => {
            await fetch("/api/admin/quick-replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: qrLabel, content: qrContent }) });
            setQuickReplies(await (await fetch("/api/admin/quick-replies")).json());
            setQrLabel(""); setQrContent("");
          }} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white w-fit">Agregar respuesta</button>
        </div>
        <ul className="space-y-2">
          {quickReplies.map((q) => (
            <li key={q.id} className="border rounded-lg p-3 text-sm">
              <p className="font-medium">{q.label}</p>
              <p className="text-gray-600">{q.content}</p>
              <button onClick={async () => {
                if (!confirmDelete(`"${q.label}"`)) return;
                await fetch(`/api/admin/quick-replies?id=${q.id}`, { method: "DELETE" });
                setQuickReplies(await (await fetch("/api/admin/quick-replies")).json());
              }} className="text-red-500 text-xs mt-1 hover:underline">Eliminar</button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (tab === "ai") {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Mensaje de bienvenida</label>
          <textarea
            value={welcomeMessage}
            onChange={(e) => onAiSettingsChange({ welcomeMessage: e.target.value, menuEnabled, urgencyKeywords })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            rows={3}
            placeholder="Ej. ¡Hola! Soy el asistente del Condominio Paris."
          />
          <p className="mt-1 text-xs text-gray-500">
            Texto base del saludo. Si el checkbox de abajo está activo, el bot también
            agrega ejemplos de preguntas al iniciar la conversación.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={menuEnabled}
            onChange={(e) =>
              onAiSettingsChange({
                welcomeMessage,
                menuEnabled: e.target.checked,
                urgencyKeywords,
              })
            }
          />
          <span>
            Mostrar mensaje de bienvenida con ejemplos al iniciar
            <span className="mt-1 block text-xs font-normal text-gray-500">
              Activo: en el primer mensaje (si solo saludan) envía saludo + 3–4 ejemplos
              (alberca, visitas, cuotas, etc.). Inactivo: no envía ese menú de bienvenida.
            </span>
          </span>
        </label>
        <div>
          <label className="block text-sm font-medium mb-1">
            Palabras de urgencia (separadas por coma y espacio)
          </label>
          <textarea
            value={urgencyText}
            onChange={(e) => {
              const value = e.target.value;
              setUrgencyText(value);
              onAiSettingsChange({
                welcomeMessage,
                menuEnabled,
                urgencyKeywords: parseUrgencyKeywordsInput(value),
              });
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            rows={3}
            placeholder="emergencia, fuga, robo, incendio, sin agua, ambulancia, urgente"
          />
          <p className="mt-1 text-xs text-gray-500">
            Escribe todas las que necesites, separadas por coma (con o sin espacio).
            Ejemplo:{" "}
            <span className="font-mono text-[11px]">
              emergencia, fuga de gas, robo, sin luz, ambulancia
            </span>
            . Si el residente usa alguna, el chat se marca urgente y se pasa a humano.
          </p>
        </div>
      </div>
    );
  }

  if (tab === "audit") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Registro de acciones del equipo. Haz clic en cualquier fila para ver el
          detalle completo.
        </p>
        <AuditLogView />
      </div>
    );
  }

  return <p className="text-sm text-gray-400">Cargando...</p>;
}
