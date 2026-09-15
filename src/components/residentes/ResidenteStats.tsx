"use client";

interface Stats {
  total: number;
  active: number;
  inactive: number;
  vacantes?: number;
  byCondominio: { condominio_name: string; count: number }[];
}

interface ResidenteStatsProps {
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

export function ResidenteStatsBar({
  stats,
  compact = false,
}: ResidenteStatsProps & { compact?: boolean }) {
  if (!stats) return null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <StatCard compact label="Total" value={stats.total} accent="#7c3aed" />
        <StatCard compact label="Activos" value={stats.active} accent="#22c55e" />
        {stats.vacantes != null && (
          <StatCard compact label="Vacantes" value={stats.vacantes} accent="#f59e0b" />
        )}
        <StatCard compact label="De baja" value={stats.inactive} accent="#ef4444" />
        <StatCard
          compact
          label="Condominios"
          value={stats.byCondominio.length}
          accent="#8b5cf6"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <StatCard label="Total" value={stats.total} accent="#7c3aed" />
      <StatCard label="Activos" value={stats.active} accent="#22c55e" />
      {stats.vacantes != null && (
        <StatCard label="Vacantes" value={stats.vacantes} accent="#f59e0b" />
      )}
      <StatCard label="Dados de baja" value={stats.inactive} accent="#ef4444" />
      <StatCard
        label="Condominios"
        value={stats.byCondominio.length}
        accent="#8b5cf6"
      />
    </div>
  );
}
