"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { PortfolioAnalytics } from "@/lib/portfolio-analytics";
import { isLowEndDevice, motionTokens } from "@/lib/motionTokens";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

function formatMoney(v: number | null): string {
  if (v == null) return "—";
  return money.format(v);
}

function KpiCard({
  label,
  value,
  sub,
  accent = "violet",
  delay = 0,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "violet" | "indigo" | "emerald" | "amber" | "sky";
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const lowEnd = useMemo(() => isLowEndDevice(), []);
  const accents = {
    violet: "border-violet-200 bg-violet-50/60 text-violet-900",
    indigo: "border-indigo-200 bg-indigo-50/60 text-indigo-900",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
    amber: "border-amber-200 bg-amber-50/60 text-amber-900",
    sky: "border-sky-200 bg-sky-50/60 text-sky-900",
  };

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: lowEnd ? 0 : motionTokens.distance.sm }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduce || lowEnd ? motionTokens.duration.fast : motionTokens.duration.normal,
        delay: reduce ? 0 : delay,
        ease: motionTokens.easing.smooth,
      }}
      className={`rounded-xl border p-4 ${accents[accent]}`}
    >
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      {sub ? <p className="mt-1 text-[11px] opacity-70">{sub}</p> : null}
    </motion.div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  pctValue,
  color = "bg-violet-500",
}: {
  label: string;
  value: number;
  total: number;
  pctValue: number;
  color?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate text-gray-700">{label}</span>
        <span className="shrink-0 font-medium text-gray-900">
          {value}
          <span className="ml-1.5 text-xs font-normal text-gray-500">
            {pctValue}%
          </span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className={`h-full w-full origin-left rounded-full ${color}`}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{
            scaleX: Math.min(1, Math.max(0, total > 0 ? value / total : 0)),
          }}
          transition={{
            duration: reduce ? 0.1 : motionTokens.duration.normal,
            ease: motionTokens.easing.smooth,
          }}
        />
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {subtitle ? (
        <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function PortfolioAnalyticsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<PortfolioAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"residentes" | "condominios">("residentes");
  const [condominioId, setCondominioId] = useState<number | "all">("all");
  const reduce = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const q =
          condominioId === "all" ? "" : `?condominioId=${condominioId}`;
        const res = await fetch(`/api/admin/metrics/portfolio${q}`);
        if (!res.ok) throw new Error("No se pudo cargar la analítica");
        const json = (await res.json()) as PortfolioAnalytics;
        if (!cancelled) {
          setData(json);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshKey, condominioId]);

  if (loading && !data) {
    return (
      <div className="flex h-48 items-center justify-center text-gray-400">
        Cargando analítica de portafolio…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex h-48 items-center justify-center text-red-500">{error}</div>
    );
  }

  if (!data) return null;

  const r = data.residentes;
  const c = data.condominios;
  const condoMax = Math.max(1, ...c.byTipo.map((x) => x.count), c.total);
  const resMax = Math.max(1, ...r.byCondominio.map((x) => x.count), r.active);
  const highAlerts = data.alerts.filter((a) => a.severity === "high").length;

  const severityStyles = {
    high: "border-red-200 bg-red-50 text-red-900",
    medium: "border-amber-200 bg-amber-50 text-amber-900",
    low: "border-sky-200 bg-sky-50 text-sky-900",
  } as const;

  const severityLabel = {
    high: "Alta",
    medium: "Media",
    low: "Baja",
  } as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Analítica de residentes y condominios
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {data.filter.condominioName
              ? `Vista filtrada: ${data.filter.condominioName}`
              : "Indicadores de cobertura, perfil y servicios del portafolio."}
            {loading ? (
              <span className="ml-2 text-violet-600">Actualizando…</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="whitespace-nowrap">Condominio</span>
            <select
              value={condominioId === "all" ? "all" : String(condominioId)}
              onChange={(e) => {
                const v = e.target.value;
                setCondominioId(v === "all" ? "all" : Number(v));
              }}
              className="min-w-[12rem] rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-violet-400 focus:outline-none"
            >
              <option value="all">Todos</option>
              {data.condominioOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex rounded-lg border border-violet-200 bg-violet-50/80 p-0.5">
            {(
              [
                ["residentes", "Residentes"],
                ["condominios", "Condominios"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  section === id
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-violet-700 hover:bg-violet-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Alertas</h3>
            <p className="text-xs text-gray-500">
              {data.alerts.length === 0
                ? "Sin pendientes en este alcance"
                : `${data.alerts.length} alerta(s)${
                    highAlerts > 0 ? ` · ${highAlerts} de prioridad alta` : ""
                  }`}
            </p>
          </div>
        </div>
        {data.alerts.length === 0 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"
          >
            Todo en orden: no hay alertas para el filtro seleccionado.
          </motion.div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.alerts.map((alert, i) => (
              <motion.div
                key={alert.id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduce ? 0.1 : motionTokens.duration.fast,
                  delay: reduce ? 0 : Math.min(i * 0.04, 0.24),
                  ease: motionTokens.easing.smooth,
                }}
                className={`rounded-lg border px-3 py-3 ${severityStyles[alert.severity]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {severityLabel[alert.severity]}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-90">{alert.detail}</p>
                <p className="mt-2 text-lg font-bold tabular-nums">{alert.count}</p>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <AnimatePresence mode="wait">
        {section === "residentes" ? (
          <motion.div
            key={`residentes-${condominioId}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{
              duration: reduce ? 0.1 : motionTokens.duration.fast,
              ease: motionTokens.easing.smooth,
            }}
            className="space-y-5"
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Residentes activos"
                value={r.active}
                sub={`${r.activePct}% del total (${r.total})`}
                accent="violet"
                delay={0}
              />
              <KpiCard
                label="Completitud de perfil"
                value={`${r.profileCompletenessPct}%`}
                sub="Campos clave capturados"
                accent="indigo"
                delay={0.04}
              />
              <KpiCard
                label="Con TAG 1"
                value={r.tag1Registered}
                sub={`${r.tagCoveragePct}% · ${r.tag1Active} activos`}
                accent="sky"
                delay={0.08}
              />
              <KpiCard
                label="Cuota promedio"
                value={formatMoney(r.avgCuotaCompleta)}
                sub={
                  r.avgCuotaPronpago != null
                    ? `Pronto pago ${formatMoney(r.avgCuotaPronpago)}`
                    : "Activos con cuota"
                }
                accent="emerald"
                delay={0.12}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel
                title="Cobertura de datos"
                subtitle="Sobre residentes activos"
              >
                <div className="space-y-3">
                  <ProgressRow
                    label="Con celular"
                    value={r.withCelular}
                    total={r.active}
                    pctValue={r.withCelularPct}
                    color="bg-violet-500"
                  />
                  <ProgressRow
                    label="Con email"
                    value={r.withEmail}
                    total={r.active}
                    pctValue={r.withEmailPct}
                    color="bg-indigo-500"
                  />
                  <ProgressRow
                    label="Con vivienda"
                    value={r.withVivienda}
                    total={r.active}
                    pctValue={r.withViviendaPct}
                    color="bg-sky-500"
                  />
                  <ProgressRow
                    label="Contacto de emergencia"
                    value={r.withContacto1}
                    total={r.active}
                    pctValue={r.contactCoveragePct}
                    color="bg-emerald-500"
                  />
                </div>
              </Panel>

              <Panel
                title="TAG vehicular"
                subtitle="Registro y estatus en activos"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-violet-50 px-3 py-3">
                    <p className="text-[11px] font-medium text-violet-600">TAG 1</p>
                    <p className="mt-1 text-xl font-bold text-violet-900">
                      {r.tag1Registered}
                    </p>
                    <p className="text-xs text-violet-700">
                      {r.tag1Active} activos · {r.tag1Registered - r.tag1Active} otros
                    </p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 px-3 py-3">
                    <p className="text-[11px] font-medium text-indigo-600">TAG 2</p>
                    <p className="mt-1 text-xl font-bold text-indigo-900">
                      {r.tag2Registered}
                    </p>
                    <p className="text-xs text-indigo-700">
                      {r.tag2Active} activos · {r.tag2Registered - r.tag2Active} otros
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-gray-500">
                    Contactos adicionales
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                      Cont. 2: <strong>{r.withContacto2}</strong>
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                      Cont. 3: <strong>{r.withContacto3}</strong>
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                      m² prom.: <strong>{r.avgMetros ?? "—"}</strong>
                    </span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
                      Bajas: <strong>{r.inactive}</strong>
                    </span>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Residentes por condominio" subtitle="Top 8 activos">
                {r.byCondominio.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin datos</p>
                ) : (
                  <div className="space-y-3">
                    {r.byCondominio.map((row) => (
                      <ProgressRow
                        key={row.label}
                        label={row.label}
                        value={row.count}
                        total={resMax}
                        pctValue={
                          r.active > 0
                            ? Math.round((row.count / r.active) * 1000) / 10
                            : 0
                        }
                        color="bg-violet-500"
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Mes de pago y colores TAG" subtitle="Distribuciones">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">Mes de pago</p>
                    {r.byMesPago.length === 0 ? (
                      <p className="text-sm text-gray-400">Sin datos</p>
                    ) : (
                      r.byMesPago.slice(0, 6).map((row) => (
                        <div
                          key={row.label}
                          className="flex justify-between text-sm text-gray-700"
                        >
                          <span>{row.label}</span>
                          <span className="font-medium">{row.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500">Color vehículo</p>
                    {r.byTagColor.length === 0 ? (
                      <p className="text-sm text-gray-400">Sin datos</p>
                    ) : (
                      r.byTagColor.map((row) => (
                        <div
                          key={row.label}
                          className="flex justify-between text-sm text-gray-700"
                        >
                          <span>{row.label}</span>
                          <span className="font-medium">{row.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Panel>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`condominios-${condominioId}`}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{
              duration: reduce ? 0.1 : motionTokens.duration.fast,
              ease: motionTokens.easing.smooth,
            }}
            className="space-y-5"
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Condominios"
                value={c.total}
                sub={`${c.activosPct}% activos · ${c.entregados} entregados`}
                accent="violet"
              />
              <KpiCard
                label="Cobertura de servicios"
                value={`${c.servicesCoveragePct}%`}
                sub="Docs, tags, cuenta o agenda"
                accent="indigo"
                delay={0.04}
              />
              <KpiCard
                label="Con documentación"
                value={c.withDocumentacion}
                sub={`${c.withDocumentacionPct}% del portafolio`}
                accent="emerald"
                delay={0.08}
              />
              <KpiCard
                label="Prom. residentes / condo"
                value={c.avgResidentsPerCondo}
                sub={`${c.emptyCondominios} sin residentes (${c.emptyCondominiosPct}%)`}
                accent="amber"
                delay={0.12}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Tipo de condominio" subtitle="Distribución">
                {c.byTipo.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin datos</p>
                ) : (
                  <div className="space-y-3">
                    {c.byTipo.map((row, i) => (
                      <ProgressRow
                        key={row.label}
                        label={row.label}
                        value={row.count}
                        total={condoMax}
                        pctValue={
                          c.total > 0
                            ? Math.round((row.count / c.total) * 1000) / 10
                            : 0
                        }
                        color={
                          ["bg-blue-500", "bg-amber-500", "bg-violet-500"][i % 3]
                        }
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                title="Servicios habilitados"
                subtitle="Flags y programaciones"
              >
                <div className="space-y-3">
                  <ProgressRow
                    label="Documentación indexada"
                    value={c.withDocumentacion}
                    total={c.total}
                    pctValue={c.withDocumentacionPct}
                    color="bg-violet-500"
                  />
                  <ProgressRow
                    label="Tags"
                    value={c.withTags}
                    total={c.total}
                    pctValue={c.withTagsPct}
                    color="bg-sky-500"
                  />
                  <ProgressRow
                    label="Estados de cuenta"
                    value={c.withEstadosCuenta}
                    total={c.total}
                    pctValue={c.withEstadosCuentaPct}
                    color="bg-amber-500"
                  />
                  <ProgressRow
                    label="Con servicios programados"
                    value={c.withSchedules}
                    total={c.total}
                    pctValue={c.withSchedulesPct}
                    color="bg-indigo-500"
                  />
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  {c.totalSchedules} programaciones activas en total
                </p>
              </Panel>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
