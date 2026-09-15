"use client";

interface Stats {
  total: number;
  activos: number;
  entregados: number;
}

interface CondominioStatsProps {
  stats: Stats | null;
}

function StatCard({
  label,
  value,
  accent,
  compact,
}: {
  label: string;
  value: number;
  accent?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex min-w-[5rem] flex-col items-center justify-center rounded-lg border border-violet-100 bg-white px-2 py-1.5 shadow-sm text-center">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-violet-400 leading-tight">
          {label}
        </p>
        <p
          className="text-base font-bold leading-tight mt-0.5"
          style={{ color: accent ?? "#7c3aed" }}
        >
          {value.toLocaleString("es-MX")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-violet-400 uppercase tracking-wide">
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-bold"
        style={{ color: accent ?? "#7c3aed" }}
      >
        {value.toLocaleString("es-MX")}
      </p>
    </div>
  );
}

export function CondominioStatsBar({
  stats,
  compact = false,
}: CondominioStatsProps & { compact?: boolean }) {
  if (!stats) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <StatCard compact label="Total" value={stats.total} accent="#7c3aed" />
        <StatCard compact label="Activos" value={stats.activos} accent="#22c55e" />
        <StatCard compact label="Entregados" value={stats.entregados} accent="#3b82f6" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <StatCard label="Total" value={stats.total} accent="#7c3aed" />
      <StatCard label="Activos" value={stats.activos} accent="#22c55e" />
      <StatCard label="Entregados" value={stats.entregados} accent="#3b82f6" />
    </div>
  );
}
