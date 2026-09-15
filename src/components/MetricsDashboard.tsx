"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { DashboardMetrics } from "@/lib/db-features";
import { INACTIVITY_TIMEOUT_MINUTES } from "@/lib/inactivity";
import { motionTokens } from "@/lib/motionTokens";
import type { WaLineStatus } from "./LineSetupScreen";
import { PortfolioAnalyticsPanel } from "./analytics/PortfolioAnalyticsPanel";

interface MetricsDashboardProps {
  lines: WaLineStatus[];
  refreshKey?: number;
}

interface Segment {
  label: string;
  value: number;
  color: string;
}

function pct(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function CriticalCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string | number;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        alert ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${alert ? "text-red-700" : "text-gray-900"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: Segment[];
  centerLabel: string;
  centerValue: string | number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-gray-400">
        Sin datos
      </div>
    );
  }

  let gradient = "conic-gradient(";
  let acc = 0;
  segments.forEach((seg, i) => {
    const p = (seg.value / total) * 100;
    gradient += `${seg.color} ${acc}% ${acc + p}%`;
    acc += p;
    if (i < segments.length - 1) gradient += ", ";
  });
  gradient += ")";

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <div
          className="h-full w-full rounded-full"
          style={{ background: gradient }}
        />
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white">
          <span className="text-xl font-bold text-gray-900">{centerValue}</span>
          <span className="text-[10px] text-gray-500">{centerLabel}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="flex-1 truncate text-gray-700">{seg.label}</span>
            <span className="font-medium text-gray-900">{seg.value}</span>
            <span className="w-10 text-right text-gray-500">
              {pct(seg.value, total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBarChart({
  items,
  total,
  emptyLabel = "Sin datos",
}: {
  items: { label: string; value: number; color: string }[];
  total: number;
  emptyLabel?: string;
}) {
  if (items.length === 0 || total === 0) {
    return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate pr-2 text-gray-700">{item.label}</span>
            <span className="shrink-0 text-gray-600">
              <span className="font-semibold text-gray-900">{item.value}</span>
              <span className="ml-2 text-gray-400">{pct(item.value, total)}</span>
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, Math.round((item.value / max) * 100))}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function VerticalBarChart({
  items,
  color = "#34d399",
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...items.map((d) => d.value), 1);
  const chartHeight = 140;

  return (
    <div className="flex items-end justify-between gap-2" style={{ height: chartHeight + 48 }}>
      {items.map((item) => {
        const barPx =
          item.value > 0
            ? Math.max(6, Math.round((item.value / max) * chartHeight))
            : 0;

        return (
          <div
            key={item.label}
            className="flex min-w-0 flex-1 flex-col items-center justify-end"
          >
            <span className="mb-1 text-[11px] font-medium text-gray-700">
              {item.value}
            </span>
            <div
              className="w-full max-w-[48px] rounded-t-md transition-all"
              style={{ height: barPx, backgroundColor: color }}
              title={`${item.label}: ${item.value}`}
            />
            <span className="mt-2 text-center text-[9px] leading-tight text-gray-500">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StackedBar({
  segments,
  total,
}: {
  segments: Segment[];
  total: number;
}) {
  if (total === 0) return <p className="text-sm text-gray-400">Sin datos</p>;

  return (
    <div>
      <div className="flex h-8 overflow-hidden rounded-lg">
        {segments.map((seg) => {
          const width = (seg.value / total) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={seg.label}
              className="h-full"
              style={{ width: `${width}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${seg.value} (${pct(seg.value, total)})`}
            />
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-gray-600">{seg.label}</span>
            <span className="font-medium text-gray-900">{seg.value}</span>
            <span className="text-gray-400">{pct(seg.value, total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const COLORS = {
  emerald: "#77bd1e",
  blue: "#3b82f6",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
  gray: "#9ca3af",
  pink: "#ec4899",
};

export function MetricsDashboard({
  lines,
  refreshKey = 0,
}: MetricsDashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lineFilter, setLineFilter] = useState<number | "all">("all");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [moduleTab, setModuleTab] = useState<"conversaciones" | "portafolio">(
    "conversaciones"
  );
  const reduceMotion = useReducedMotion();

  const lineOptions =
    lines.length > 0
      ? lines
      : [{ id: 1, name: "Línea 1" }];

  const loadMetrics = useCallback(async () => {
    if (moduleTab !== "conversaciones") return;
    try {
      const query =
        lineFilter === "all" ? "" : `?lineId=${lineFilter}`;
      const res = await fetch(`/api/admin/metrics${query}`);
      if (!res.ok) throw new Error("No se pudieron cargar las métricas");
      setMetrics(await res.json());
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [lineFilter, moduleTab]);

  useEffect(() => {
    if (moduleTab !== "conversaciones") return;
    setLoading(true);
    loadMetrics();
    const interval = setInterval(loadMetrics, 30_000);
    return () => clearInterval(interval);
  }, [loadMetrics, refreshKey, moduleTab]);

  const activeLineName =
    lineFilter === "all"
      ? "Todas las líneas"
      : (lineOptions.find((l) => l.id === lineFilter)?.name ??
        `Línea ${lineFilter}`);

  const lineFilterBar = (
    <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2.5 sm:px-6">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {(
          [
            ["conversaciones", "Conversaciones"],
            ["portafolio", "Residentes y condominios"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setModuleTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              moduleTab === id
                ? "bg-violet-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {moduleTab === "conversaciones" ? (
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">{activeLineName}</span>
            <span className="mx-1.5 text-gray-300">·</span>
            {lineFilter === "all"
              ? "Totales combinados"
              : `Solo ${activeLineName}`}
            {loading && metrics ? (
              <span className="ml-2 text-blue-600">Actualizando…</span>
            ) : null}
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-gray-400">
              Actualizado{" "}
              {lastUpdated.toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setLineFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              lineFilter === "all"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Todas juntas
          </button>
          {lineOptions.map((line) => (
            <button
              key={line.id}
              type="button"
              onClick={() => setLineFilter(line.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                lineFilter === line.id
                  ? line.id === 1
                    ? "bg-blue-600 text-white"
                    : "bg-violet-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {line.name}
            </button>
          ))}
        </div>
      </div>
      ) : (
        <p className="text-xs text-gray-500">
          Indicadores del módulo de Residentes y Condominios
        </p>
      )}
    </div>
  );

  const metricsShell = (content: React.ReactNode) => (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      {lineFilterBar}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        {content}
      </div>
    </div>
  );

  if (moduleTab === "portafolio") {
    return metricsShell(
      <AnimatePresence mode="wait">
        <motion.div
          key="portafolio"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0.1 : motionTokens.duration.fast,
            ease: motionTokens.easing.smooth,
          }}
        >
          <PortfolioAnalyticsPanel refreshKey={refreshKey} />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (loading && !metrics) {
    return metricsShell(
      <div className="flex h-48 items-center justify-center text-gray-400">
        Cargando métricas...
      </div>
    );
  }

  if (error && !metrics) {
    return metricsShell(
      <div className="flex h-48 items-center justify-center text-red-500">
        {error}
      </div>
    );
  }

  if (!metrics) return null;

  const surveyTotal = metrics.satisfactionDistribution.reduce(
    (s, d) => s + d.count,
    0
  );

  const categoryTotal = metrics.topCategories.reduce((s, c) => s + c.count, 0);
  const tagTotal = metrics.topTags.reduce((s, t) => s + t.count, 0);
  const faqTotal = metrics.topFaqs.reduce((s, f) => s + f.count, 0);
  const reglamentoSourceTotal = metrics.topReglamentoSources.reduce(
    (s, r) => s + r.count,
    0
  );

  const closeColorMap: Record<string, string> = {
    open: COLORS.emerald,
    inactivity: COLORS.amber,
    survey: COLORS.blue,
    other: COLORS.gray,
  };

  const closeSegments: Segment[] = metrics.closeReasonBreakdown.map((r) => ({
    label: r.label,
    value: r.count,
    color: closeColorMap[r.reason] ?? COLORS.violet,
  }));

  const attentionSegments: Segment[] = metrics.attentionBreakdown.map((a, i) => ({
    label: a.label,
    value: a.count,
    color: i === 0 ? COLORS.cyan : COLORS.violet,
  }));

  const messageSegments: Segment[] = metrics.messageRoleBreakdown.map((m, i) => ({
    label: m.label,
    value: m.count,
    color: [COLORS.blue, COLORS.emerald, COLORS.pink][i % 3],
  }));

  const satisfactionItems = [1, 2, 3, 4, 5].map((rating) => {
    const row = metrics.satisfactionDistribution.find((d) => d.rating === rating);
    return {
      label: `${rating} estrella${rating > 1 ? "s" : ""}`,
      value: row?.count ?? 0,
      color:
        rating >= 4
          ? COLORS.emerald
          : rating === 3
            ? COLORS.amber
            : COLORS.red,
    };
  });

  return metricsShell(
    <>
      {/* Indicadores críticos */}
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CriticalCard
          label="Urgentes abiertas"
          value={metrics.urgentOpen}
          alert={metrics.urgentOpen > 0}
        />
        <CriticalCard
          label="SLA vencido"
          value={metrics.slaBreached}
          sub="Esperando asesor sin atención"
          alert={metrics.slaBreached > 0}
        />
        <CriticalCard
          label="Esperando asesor"
          value={metrics.awaitingHuman}
          alert={metrics.awaitingHuman > 0}
        />
        <CriticalCard
          label="Satisfacción promedio"
          value={
            metrics.avgSatisfaction
              ? `${metrics.avgSatisfaction.toFixed(1)} / 5`
              : "—"
          }
          sub={`${metrics.surveysCount} encuestas`}
        />
      </section>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CriticalCard
          label="Respuestas con info indexada"
          value={metrics.indexedAnswersTotal}
          sub={`${metrics.indexedAnswersToday} hoy (reglamento + FAQ)`}
        />
        <CriticalCard
          label="Reglamento indexado"
          value={metrics.reglamentoHitsTotal}
          sub={`${metrics.reglamentoHitsToday} hoy`}
        />
        <CriticalCard
          label="FAQ utilizadas"
          value={faqTotal}
          sub="Preguntas resueltas desde FAQ"
        />
        <CriticalCard
          label="Documentos citados"
          value={metrics.topReglamentoSources.length}
          sub={`${reglamentoSourceTotal} citas en total`}
        />
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Estado de conversaciones"
          subtitle={`Total: ${metrics.totalConversations}`}
        >
          <DonutChart
            segments={closeSegments}
            centerLabel="total"
            centerValue={metrics.totalConversations}
          />
        </ChartCard>

        <ChartCard
          title="Tipo de atención"
          subtitle={`${pct(metrics.aiResolved, metrics.totalConversations)} IA · ${pct(metrics.humanHandled, metrics.totalConversations)} humano`}
        >
          <DonutChart
            segments={attentionSegments}
            centerLabel="chats"
            centerValue={metrics.totalConversations}
          />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Mensajes por origen"
          subtitle={`Total: ${metrics.totalMessages}`}
        >
          <DonutChart
            segments={messageSegments}
            centerLabel="mensajes"
            centerValue={metrics.totalMessages}
          />
        </ChartCard>

        <ChartCard
          title="Distribución de cierre"
          subtitle={`${metrics.closedConversations} cerradas · ${metrics.openConversations} abiertas`}
        >
          <StackedBar
            segments={closeSegments}
            total={metrics.totalConversations}
          />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Mensajes últimos 7 días"
          subtitle={`Hoy: ${metrics.messagesToday} (${pct(metrics.messagesToday, metrics.totalMessages)} del total)`}
        >
          <VerticalBarChart
            items={metrics.messagesLast7Days.map((d) => ({
              label: d.date,
              value: d.count,
            }))}
            color={COLORS.emerald}
          />
        </ChartCard>

        <ChartCard
          title="Conversaciones nuevas (7 días)"
          subtitle={`Hoy: ${metrics.conversationsToday}`}
        >
          <VerticalBarChart
            items={metrics.conversationsLast7Days.map((d) => ({
              label: d.date,
              value: d.count,
            }))}
            color={COLORS.blue}
          />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Categorías más utilizadas"
          subtitle={`${categoryTotal} detecciones según respuestas con información indexada`}
        >
          {metrics.topCategories.length > 0 ? (
            <>
              <DonutChart
                segments={metrics.topCategories.map((c, i) => ({
                  label: c.category,
                  value: c.count,
                  color: [COLORS.blue, COLORS.emerald, COLORS.amber, COLORS.violet, COLORS.pink, COLORS.cyan, COLORS.red, COLORS.gray][i % 8],
                }))}
                centerLabel="temas"
                centerValue={categoryTotal}
              />
              <div className="mt-4 border-t border-gray-100 pt-4">
                <HorizontalBarChart
                  items={metrics.topCategories.map((c, i) => ({
                    label: c.category,
                    value: c.count,
                    color: [COLORS.blue, COLORS.emerald, COLORS.amber, COLORS.violet, COLORS.pink, COLORS.cyan, COLORS.red, COLORS.gray][i % 8],
                  }))}
                  total={categoryTotal}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">
              Las categorías se detectan al elegir menú o cuando el mensaje coincide con una etiqueta
            </p>
          )}
        </ChartCard>

        <ChartCard
          title="Etiquetas más usadas"
          subtitle={`${tagTotal} etiquetas aplicadas`}
        >
          <HorizontalBarChart
            items={metrics.topTags.map((t) => ({
              label: t.name,
              value: t.count,
              color: t.color,
            }))}
            total={tagTotal}
            emptyLabel="Aún no hay etiquetas aplicadas"
          />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Documentos del reglamento más citados"
          subtitle={`${reglamentoSourceTotal} respuestas con fuente indexada`}
        >
          <HorizontalBarChart
            items={metrics.topReglamentoSources.map((r, i) => ({
              label: r.source,
              value: r.count,
              color: [COLORS.violet, COLORS.blue, COLORS.emerald, COLORS.cyan][i % 4],
            }))}
            total={reglamentoSourceTotal}
            emptyLabel="Se registrarán cuando el bot responda con fragmentos del reglamento"
          />
        </ChartCard>

        <ChartCard
          title="Preguntas frecuentes más usadas"
          subtitle={`${faqTotal} respuestas automáticas por FAQ`}
        >
          <HorizontalBarChart
            items={metrics.topFaqs.map((f, i) => ({
              label: f.question,
              value: f.count,
              color: [COLORS.cyan, COLORS.blue, COLORS.emerald, COLORS.violet][i % 4],
            }))}
            total={faqTotal}
            emptyLabel="Las FAQ se registrarán cuando el bot las utilice"
          />
        </ChartCard>

        <ChartCard
          title="Calificaciones de satisfacción"
          subtitle={
            surveyTotal > 0
              ? `Promedio ${metrics.avgSatisfaction?.toFixed(1) ?? "—"} / 5`
              : "Sin encuestas aún"
          }
        >
          <HorizontalBarChart
            items={satisfactionItems}
            total={surveyTotal}
            emptyLabel="Sin encuestas respondidas"
          />
        </ChartCard>
      </div>

      <ChartCard
        title="Cola y operación"
        subtitle="Indicadores operativos con proporción sobre el total"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Handoffs totales", value: metrics.handoffsTotal, color: COLORS.violet },
            { label: "Handoffs hoy", value: metrics.handoffsToday, color: COLORS.blue },
            { label: "Chats asignados", value: metrics.assignedActive, color: COLORS.emerald },
            { label: "Imágenes recibidas", value: metrics.imagesReceived, color: COLORS.amber },
            {
              label: "Cerradas por inactividad",
              value: metrics.closedByInactivity,
              color: COLORS.gray,
            },
            {
              label: "Promedio msg/chat",
              value: metrics.avgMessagesPerConversation,
              color: COLORS.cyan,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="mt-1 text-lg font-bold text-gray-900">{item.value}</p>
              {metrics.totalConversations > 0 && item.label !== "Promedio msg/chat" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, Math.round((Number(item.value) / metrics.totalConversations) * 100))}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-gray-400">
          Inactividad: cierre automático tras {INACTIVITY_TIMEOUT_MINUTES} min sin respuesta
        </p>
      </ChartCard>
    </>
  );
}
