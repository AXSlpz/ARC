import db from "./db-connection";

export interface NamedCount {
  label: string;
  count: number;
}

export interface PortfolioAlert {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  count: number;
  condominio_id?: number | null;
  condominio_name?: string | null;
}

export interface CondoOption {
  id: number;
  name: string;
}

export interface PortfolioAnalytics {
  filter: {
    condominioId: number | null;
    condominioName: string | null;
  };
  condominioOptions: CondoOption[];
  alerts: PortfolioAlert[];
  residentes: {
    total: number;
    active: number;
    inactive: number;
    activePct: number;
    withEmail: number;
    withEmailPct: number;
    withCelular: number;
    withCelularPct: number;
    withVivienda: number;
    withViviendaPct: number;
    withContacto1: number;
    withContacto2: number;
    withContacto3: number;
    contactCoveragePct: number;
    missingEmail: number;
    missingCelular: number;
    missingContacto: number;
    missingTag: number;
    incompleteProfiles: number;
    tag1Registered: number;
    tag1Active: number;
    tag2Registered: number;
    tag2Active: number;
    tagCoveragePct: number;
    avgMetros: number | null;
    avgCuotaCompleta: number | null;
    avgCuotaPronpago: number | null;
    profileCompletenessPct: number;
    byCondominio: NamedCount[];
    byMesPago: NamedCount[];
    byTagColor: NamedCount[];
  };
  condominios: {
    total: number;
    activos: number;
    entregados: number;
    activosPct: number;
    byTipo: NamedCount[];
    withDocumentacion: number;
    withDocumentacionPct: number;
    withTags: number;
    withTagsPct: number;
    withEstadosCuenta: number;
    withEstadosCuentaPct: number;
    withSchedules: number;
    withSchedulesPct: number;
    totalSchedules: number;
    emptyCondominios: number;
    emptyCondominiosPct: number;
    avgResidentsPerCondo: number;
    servicesCoveragePct: number;
    withoutDocumentacion: number;
    withoutSchedules: number;
  };
  generatedAt: number;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function condoClause(condominioId: number | null, alias = ""): string {
  if (condominioId == null) return "1=1";
  const col = alias ? `${alias}.condominio_id` : "condominio_id";
  return `${col} = ${condominioId}`;
}

function countWhere(where: string): number {
  return (
    db.prepare(`SELECT COUNT(*) AS c FROM residentes WHERE ${where}`).get() as {
      c: number;
    }
  ).c;
}

function avgWhere(column: string, where: string): number | null {
  const row = db
    .prepare(
      `SELECT AVG(${column}) AS v FROM residentes WHERE ${where} AND ${column} IS NOT NULL`
    )
    .get() as { v: number | null };
  if (row.v == null || Number.isNaN(row.v)) return null;
  return Math.round(row.v * 100) / 100;
}

function buildAlerts(params: {
  condominioId: number | null;
  condominioName: string | null;
  active: number;
  missingEmail: number;
  missingCelular: number;
  missingContacto: number;
  missingTag: number;
  incompleteProfiles: number;
  profileCompletenessPct: number;
  emptyCondominios: number;
  withoutDocumentacion: number;
  withoutSchedules: number;
}): PortfolioAlert[] {
  const {
    condominioId,
    condominioName,
    active,
    missingEmail,
    missingCelular,
    missingContacto,
    missingTag,
    incompleteProfiles,
    profileCompletenessPct,
    emptyCondominios,
    withoutDocumentacion,
    withoutSchedules,
  } = params;

  const scopeLabel = condominioName ? ` en ${condominioName}` : "";
  const alerts: PortfolioAlert[] = [];

  if (withoutDocumentacion > 0) {
    alerts.push({
      id: "no-docs",
      severity: "high",
      title: condominioId
        ? "Sin documentación indexada"
        : "Condominios sin documentación",
      detail: condominioId
        ? `Este condominio aún no tiene documentación indexada para el bot.`
        : `${withoutDocumentacion} condominio(s) sin documentación indexada.`,
      count: withoutDocumentacion,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  if (withoutSchedules > 0) {
    alerts.push({
      id: "no-schedules",
      severity: "high",
      title: condominioId
        ? "Sin servicios programados"
        : "Condominios sin servicios programados",
      detail: condominioId
        ? `No hay programaciones activas de servicios${scopeLabel}.`
        : `${withoutSchedules} condominio(s) sin servicios programados.`,
      count: withoutSchedules,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  if (emptyCondominios > 0) {
    alerts.push({
      id: "empty-condo",
      severity: "medium",
      title: condominioId ? "Sin residentes activos" : "Condominios vacíos",
      detail: condominioId
        ? `No hay residentes activos${scopeLabel}.`
        : `${emptyCondominios} condominio(s) sin residentes activos.`,
      count: emptyCondominios,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  if (active > 0 && profileCompletenessPct < 70) {
    alerts.push({
      id: "low-completeness",
      severity: "medium",
      title: "Perfiles incompletos",
      detail: `Completitud promedio ${profileCompletenessPct}%${scopeLabel}. ${incompleteProfiles} perfil(es) por debajo del 75%.`,
      count: incompleteProfiles,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  if (missingCelular > 0) {
    alerts.push({
      id: "missing-phone",
      severity: "medium",
      title: "Sin celular",
      detail: `${missingCelular} residente(s) activo(s) sin celular${scopeLabel}.`,
      count: missingCelular,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  if (missingEmail > 0) {
    alerts.push({
      id: "missing-email",
      severity: "low",
      title: "Sin email",
      detail: `${missingEmail} residente(s) activo(s) sin email${scopeLabel}.`,
      count: missingEmail,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  if (missingContacto > 0) {
    alerts.push({
      id: "missing-contact",
      severity: "medium",
      title: "Sin contacto de emergencia",
      detail: `${missingContacto} residente(s) sin contacto de emergencia${scopeLabel}.`,
      count: missingContacto,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  if (missingTag > 0) {
    alerts.push({
      id: "missing-tag",
      severity: "low",
      title: "Sin TAG vehicular",
      detail: `${missingTag} residente(s) activo(s) sin TAG 1 registrado${scopeLabel}.`,
      count: missingTag,
      condominio_id: condominioId,
      condominio_name: condominioName,
    });
  }

  const severityRank = { high: 0, medium: 1, low: 2 };
  return alerts.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || b.count - a.count
  );
}

export function getPortfolioAnalytics(
  condominioId: number | null = null
): PortfolioAnalytics {
  const options = db
    .prepare(
      `SELECT id, name FROM condominios ORDER BY name COLLATE NOCASE ASC`
    )
    .all() as CondoOption[];

  let resolvedId: number | null = condominioId;
  let condominioName: string | null = null;
  if (resolvedId != null) {
    const found = options.find((c) => c.id === resolvedId);
    if (!found) {
      resolvedId = null;
    } else {
      condominioName = found.name;
    }
  }

  const condoFilter = condoClause(resolvedId);
  const scope = `active = 1 AND ${condoFilter}`;
  const allScope = condoFilter;

  const total = countWhere(allScope);
  const active = countWhere(scope);
  const inactive = countWhere(`active = 0 AND ${condoFilter}`);
  const base = active;

  const withEmail = countWhere(
    `${scope} AND email IS NOT NULL AND TRIM(email) != ''`
  );
  const withCelular = countWhere(`${scope} AND celular IS NOT NULL`);
  const withVivienda = countWhere(`${scope} AND num_vivienda IS NOT NULL`);
  const withContacto1 = countWhere(
    `${scope} AND ((nombre_contacto1 IS NOT NULL AND TRIM(nombre_contacto1) != '') OR celular_contacto1 IS NOT NULL)`
  );
  const withContacto2 = countWhere(
    `${scope} AND ((nombre_contacto2 IS NOT NULL AND TRIM(nombre_contacto2) != '') OR celular_contacto2 IS NOT NULL)`
  );
  const withContacto3 = countWhere(
    `${scope} AND ((nombre_contacto3 IS NOT NULL AND TRIM(nombre_contacto3) != '') OR celular_contacto3 IS NOT NULL)`
  );

  const missingEmail = countWhere(
    `${scope} AND (email IS NULL OR TRIM(email) = '')`
  );
  const missingCelular = countWhere(`${scope} AND celular IS NULL`);
  const missingContacto = countWhere(
    `${scope} AND NOT ((nombre_contacto1 IS NOT NULL AND TRIM(nombre_contacto1) != '') OR celular_contacto1 IS NOT NULL)`
  );
  const missingTag = countWhere(
    `${scope} AND NOT (tag1_id IS NOT NULL OR (tag1_placa IS NOT NULL AND TRIM(tag1_placa) != ''))`
  );

  const tag1Registered = countWhere(
    `${scope} AND (tag1_id IS NOT NULL OR (tag1_placa IS NOT NULL AND TRIM(tag1_placa) != ''))`
  );
  const tag1Active = countWhere(`${scope} AND tag1_estatus = 'Activo'`);
  const tag2Registered = countWhere(
    `${scope} AND (tag2_id IS NOT NULL OR (tag2_placa IS NOT NULL AND TRIM(tag2_placa) != ''))`
  );
  const tag2Active = countWhere(`${scope} AND tag2_estatus = 'Activo'`);

  const avgMetros = avgWhere("metros_cuadrados", scope);
  const avgCuotaCompleta = avgWhere("cuota_completa", scope);
  const avgCuotaPronpago = avgWhere("cuota_comp_pronpago", scope);

  const completenessRow = db
    .prepare(
      `SELECT AVG(
         (CASE WHEN condominio_id IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN nombre IS NOT NULL AND TRIM(nombre) != '' THEN 1 ELSE 0 END) +
         (CASE WHEN celular IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN email IS NOT NULL AND TRIM(email) != '' THEN 1 ELSE 0 END) +
         (CASE WHEN num_vivienda IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN (nombre_contacto1 IS NOT NULL AND TRIM(nombre_contacto1) != '') OR celular_contacto1 IS NOT NULL THEN 1 ELSE 0 END) +
         (CASE WHEN tag1_id IS NOT NULL OR (tag1_placa IS NOT NULL AND TRIM(tag1_placa) != '') THEN 1 ELSE 0 END) +
         (CASE WHEN mes_pago IS NOT NULL AND TRIM(mes_pago) != '' THEN 1 ELSE 0 END)
       ) AS v
       FROM residentes WHERE ${scope}`
    )
    .get() as { v: number | null };
  const profileCompletenessPct =
    completenessRow.v == null
      ? 0
      : Math.round((completenessRow.v / 8) * 1000) / 10;

  const incompleteProfiles = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM residentes WHERE ${scope} AND (
           (CASE WHEN celular IS NOT NULL THEN 1 ELSE 0 END) +
           (CASE WHEN email IS NOT NULL AND TRIM(email) != '' THEN 1 ELSE 0 END) +
           (CASE WHEN num_vivienda IS NOT NULL THEN 1 ELSE 0 END) +
           (CASE WHEN (nombre_contacto1 IS NOT NULL AND TRIM(nombre_contacto1) != '') OR celular_contacto1 IS NOT NULL THEN 1 ELSE 0 END) +
           (CASE WHEN tag1_id IS NOT NULL OR (tag1_placa IS NOT NULL AND TRIM(tag1_placa) != '') THEN 1 ELSE 0 END) +
           (CASE WHEN mes_pago IS NOT NULL AND TRIM(mes_pago) != '' THEN 1 ELSE 0 END)
         ) < 5`
      )
      .get() as { c: number }
  ).c;

  const byCondominio =
    resolvedId != null
      ? active > 0 && condominioName
        ? [{ label: condominioName, count: active }]
        : []
      : (db
          .prepare(
            `SELECT c.name AS label, COUNT(*) AS count
             FROM residentes r
             JOIN condominios c ON c.id = r.condominio_id
             WHERE r.active = 1
             GROUP BY c.id
             ORDER BY count DESC
             LIMIT 8`
          )
          .all() as NamedCount[]);

  const byMesPago = db
    .prepare(
      `SELECT mes_pago AS label, COUNT(*) AS count
       FROM residentes
       WHERE ${scope} AND mes_pago IS NOT NULL AND TRIM(mes_pago) != ''
       GROUP BY mes_pago
       ORDER BY count DESC`
    )
    .all() as NamedCount[];

  const byTagColor = db
    .prepare(
      `SELECT color AS label, COUNT(*) AS count FROM (
         SELECT tag1_color AS color FROM residentes
         WHERE ${scope} AND tag1_color IS NOT NULL AND TRIM(tag1_color) != ''
         UNION ALL
         SELECT tag2_color AS color FROM residentes
         WHERE ${scope} AND tag2_color IS NOT NULL AND TRIM(tag2_color) != ''
       )
       GROUP BY color
       ORDER BY count DESC
       LIMIT 8`
    )
    .all() as NamedCount[];

  const condoWhere =
    resolvedId != null ? `id = ${resolvedId}` : "1=1";

  const condoTotal = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM condominios WHERE ${condoWhere}`)
      .get() as { c: number }
  ).c;
  const condoActivos = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM condominios WHERE ${condoWhere} AND estatus = 'Activo'`
      )
      .get() as { c: number }
  ).c;
  const condoEntregados = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM condominios WHERE ${condoWhere} AND estatus = 'Entregado'`
      )
      .get() as { c: number }
  ).c;

  const byTipo = db
    .prepare(
      `SELECT tipo AS label, COUNT(*) AS count
       FROM condominios
       WHERE ${condoWhere}
       GROUP BY tipo
       ORDER BY count DESC`
    )
    .all() as NamedCount[];

  const withDocumentacion = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM condominios WHERE ${condoWhere} AND documentacion_indexada = 1`
      )
      .get() as { c: number }
  ).c;
  const withTags = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM condominios WHERE ${condoWhere} AND tags = 1`
      )
      .get() as { c: number }
  ).c;
  const withEstadosCuenta = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM condominios WHERE ${condoWhere} AND estados_cuenta = 1`
      )
      .get() as { c: number }
  ).c;

  let withSchedules = 0;
  let totalSchedules = 0;
  let withoutSchedules = 0;
  try {
    const scheduleCondoFilter =
      resolvedId != null ? `condominio_id = ${resolvedId}` : "1=1";
    withSchedules = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT condominio_id) AS c
           FROM condominio_service_schedules
           WHERE active = 1 AND ${scheduleCondoFilter}`
        )
        .get() as { c: number }
    ).c;
    totalSchedules = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM condominio_service_schedules
           WHERE active = 1 AND ${scheduleCondoFilter}`
        )
        .get() as { c: number }
    ).c;
  } catch {
    withSchedules = 0;
    totalSchedules = 0;
  }

  if (resolvedId != null) {
    withoutSchedules = condoTotal > 0 && withSchedules === 0 ? 1 : 0;
  } else {
    try {
      withoutSchedules = (
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM condominios c
             WHERE NOT EXISTS (
               SELECT 1 FROM condominio_service_schedules s
               WHERE s.condominio_id = c.id AND s.active = 1
             )`
          )
          .get() as { c: number }
      ).c;
    } catch {
      withoutSchedules = condoTotal;
    }
  }

  const withoutDocumentacion = Math.max(0, condoTotal - withDocumentacion);

  const emptyCondominios =
    resolvedId != null
      ? active === 0 && condoTotal > 0
        ? 1
        : 0
      : (
          db
            .prepare(
              `SELECT COUNT(*) AS c FROM condominios c
               WHERE NOT EXISTS (
                 SELECT 1 FROM residentes r
                 WHERE r.condominio_id = c.id AND r.active = 1
               )`
            )
            .get() as { c: number }
        ).c;

  const avgResidentsPerCondo =
    condoTotal > 0 ? Math.round((active / condoTotal) * 10) / 10 : 0;

  let servicesReady = 0;
  try {
    servicesReady = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM condominios c
           WHERE ${resolvedId != null ? `c.id = ${resolvedId}` : "1=1"}
             AND (
               c.documentacion_indexada = 1
               OR c.tags = 1
               OR c.estados_cuenta = 1
               OR EXISTS (
                    SELECT 1 FROM condominio_service_schedules s
                    WHERE s.condominio_id = c.id AND s.active = 1
                  )
             )`
        )
        .get() as { c: number }
    ).c;
  } catch {
    servicesReady = withDocumentacion;
  }

  const alerts = buildAlerts({
    condominioId: resolvedId,
    condominioName,
    active,
    missingEmail,
    missingCelular,
    missingContacto,
    missingTag,
    incompleteProfiles,
    profileCompletenessPct,
    emptyCondominios,
    withoutDocumentacion,
    withoutSchedules,
  });

  return {
    filter: {
      condominioId: resolvedId,
      condominioName,
    },
    condominioOptions: options,
    alerts,
    residentes: {
      total,
      active,
      inactive,
      activePct: pct(active, total),
      withEmail,
      withEmailPct: pct(withEmail, base),
      withCelular,
      withCelularPct: pct(withCelular, base),
      withVivienda,
      withViviendaPct: pct(withVivienda, base),
      withContacto1,
      withContacto2,
      withContacto3,
      contactCoveragePct: pct(withContacto1, base),
      missingEmail,
      missingCelular,
      missingContacto,
      missingTag,
      incompleteProfiles,
      tag1Registered,
      tag1Active,
      tag2Registered,
      tag2Active,
      tagCoveragePct: pct(tag1Registered, base),
      avgMetros,
      avgCuotaCompleta,
      avgCuotaPronpago,
      profileCompletenessPct,
      byCondominio,
      byMesPago,
      byTagColor,
    },
    condominios: {
      total: condoTotal,
      activos: condoActivos,
      entregados: condoEntregados,
      activosPct: pct(condoActivos, condoTotal),
      byTipo,
      withDocumentacion,
      withDocumentacionPct: pct(withDocumentacion, condoTotal),
      withTags,
      withTagsPct: pct(withTags, condoTotal),
      withEstadosCuenta,
      withEstadosCuentaPct: pct(withEstadosCuenta, condoTotal),
      withSchedules,
      withSchedulesPct: pct(withSchedules, condoTotal),
      totalSchedules,
      emptyCondominios,
      emptyCondominiosPct: pct(emptyCondominios, condoTotal),
      avgResidentsPerCondo,
      servicesCoveragePct: pct(servicesReady, condoTotal),
      withoutDocumentacion,
      withoutSchedules,
    },
    generatedAt: Math.floor(Date.now() / 1000),
  };
}
