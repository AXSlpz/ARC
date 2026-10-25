"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CrmSheet,
  ErrorBanner,
  Field,
  fieldClass,
  primaryBtn,
  secondaryBtn,
} from "./CrmUi";
import { asNumericId, crmFetch, errorMessage, pathId, toDateInput } from "./helpers";
import { MoneyInput } from "./MoneyInput";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  type CrmAssignee,
  type Deal,
  type PipelineStage,
  type Prospecto,
  type ProspectosPage,
} from "./types";

export function DealModal({
  open,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  canWrite,
  onClose,
  onSaved,
}: {
  open: boolean;
  deal: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [title, setTitle] = useState("");
  const [prospectoId, setProspectoId] = useState("");
  const [value, setValue] = useState(0);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [closeDate, setCloseDate] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<"won" | "lost" | "open" | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  const currencyOptions = useMemo(() => {
    if (CURRENCIES.some((item) => item.code === currency)) return CURRENCIES;
    return [{ code: currency, label: currency }, ...CURRENCIES];
  }, [currency]);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setError("");
    if (deal) {
      setTitle(deal.title);
      setValue(Number(deal.value) || 0);
      setCurrency(deal.currency || DEFAULT_CURRENCY);
      setProspectoId(deal.prospecto_id != null ? String(deal.prospecto_id) : "");
      setStageId(String(deal.stage_id));
      setAssignedTo(
        deal.assigned_to_user_id != null ? String(deal.assigned_to_user_id) : ""
      );
      setCloseDate(toDateInput(deal.expected_close_date));
      setNotes(deal.notes ?? "");
    } else {
      setTitle("");
      setValue(0);
      setCurrency(DEFAULT_CURRENCY);
      setProspectoId("");
      setStageId(defaultStageId || (stages[0] ? String(stages[0].id) : ""));
      setAssignedTo("");
      setCloseDate("");
      setNotes("");
    }
  }, [open, deal, defaultStageId, stages]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [prospectosData, assigneesData] = await Promise.all([
          crmFetch<ProspectosPage>("/api/admin/crm/prospectos?limit=100"),
          crmFetch<{ users: CrmAssignee[] }>("/api/admin/crm/assignees").catch(
            () => ({ users: [] as CrmAssignee[] })
          ),
        ]);
        if (cancelled) return;
        setProspectos(prospectosData.data ?? []);
        setAssignees(assigneesData.users ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "No se pudieron cargar los contactos."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function save() {
    if (!title.trim() || !asNumericId(prospectoId) || !asNumericId(stageId)) {
      setError("El título, el contacto y la etapa son obligatorios.");
      return;
    }
    if (!deal && !asNumericId(pipelineId)) {
      setError("Falta el embudo para crear el trato.");
      return;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("El valor debe ser un número válido.");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      title: title.trim(),
      prospecto_id: asNumericId(prospectoId),
      value: Number.isFinite(amount) ? amount : 0,
      currency,
      expected_close_date: closeDate || null,
      notes: notes.trim() || null,
      stage_id: asNumericId(stageId),
      assigned_to_user_id: asNumericId(assignedTo) ?? null,
      ...(deal ? {} : { pipeline_id: asNumericId(pipelineId) }),
    };
    try {
      if (deal) {
        await crmFetch(`/api/admin/crm/deals/${pathId(deal.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await crmFetch("/api/admin/crm/deals", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el trato."));
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: "won" | "lost" | "open") {
    if (!deal) return;
    // TODO(ARC): si status === "won" y hay cotización aceptada, convertir
    // el prospecto a Residente (cliente). Pendiente de configurar.
    setStatusAction(status);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/deals/${pathId(deal.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No se pudo actualizar el estado del trato."));
    } finally {
      setStatusAction(null);
    }
  }

  async function remove() {
    if (!deal) return;
    setDeleting(true);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/deals/${pathId(deal.id)}`, {
        method: "DELETE",
      });
      setConfirmDelete(false);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No se pudo eliminar el trato."));
    } finally {
      setDeleting(false);
    }
  }

  const readOnly = !canWrite;
  const busy = saving || deleting || !!statusAction;

  return (
    <CrmSheet
      open={open}
      title={deal ? "Editar trato" : "Nuevo trato"}
      onClose={onClose}
      footer={
        <>
          <div className="flex gap-2">
            <button type="button" className={`flex-1 ${secondaryBtn}`} onClick={onClose}>
              Cancelar
            </button>
            {canWrite ? (
              <button
                type="button"
                className={`flex-1 ${primaryBtn}`}
                disabled={
                  busy ||
                  loading ||
                  !title.trim() ||
                  !asNumericId(prospectoId) ||
                  !asNumericId(stageId)
                }
                onClick={() => void save()}
              >
                {saving
                  ? "Guardando…"
                  : deal
                    ? "Guardar cambios"
                    : "Crear trato"}
              </button>
            ) : null}
          </div>
          {canWrite && deal ? (
            confirmDelete ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs">
                <span className="text-red-700">¿Eliminar este trato?</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="rounded px-2 py-1 text-slate-500 hover:bg-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={deleting}
                    className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Eliminando…" : "Confirmar"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-600 hover:text-red-700"
              >
                <TrashIcon />
                Eliminar trato
              </button>
            )
          ) : null}
        </>
      }
    >
      <ErrorBanner message={error} />
      {loading ? (
        <p className="text-sm text-slate-500">Cargando contactos…</p>
      ) : null}

      <Field label="Título" htmlFor="crm-deal-title">
        <input
          id="crm-deal-title"
          className={fieldClass}
          value={title}
          disabled={readOnly}
          placeholder="Título del trato"
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <Field label="Contacto" htmlFor="crm-deal-contact">
        <select
          id="crm-deal-contact"
          className={fieldClass}
          value={prospectoId}
          disabled={readOnly}
          onChange={(e) => setProspectoId(e.target.value)}
        >
          <option value="">Selecciona un contacto</option>
          {prospectos.map((p) => (
            <option key={String(p.id)} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="Valor" htmlFor="crm-deal-value">
          <MoneyInput
            id="crm-deal-value"
            currency={currency}
            value={value}
            disabled={readOnly}
            aria-label="Valor del trato"
            onValueChange={setValue}
          />
        </Field>
        <Field label="Moneda" htmlFor="crm-deal-currency">
          <select
            id="crm-deal-currency"
            className={fieldClass}
            value={currency}
            disabled={readOnly}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencyOptions.map((item) => (
              <option key={item.code} value={item.code}>
                {item.code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Fecha esperada de cierre" htmlFor="crm-deal-date">
        <input
          id="crm-deal-date"
          type="date"
          className={fieldClass}
          value={closeDate}
          disabled={readOnly}
          onChange={(e) => setCloseDate(e.target.value)}
        />
      </Field>

      <Field label="Etapa" htmlFor="crm-deal-stage">
        <select
          id="crm-deal-stage"
          className={fieldClass}
          value={stageId}
          disabled={readOnly}
          onChange={(e) => setStageId(e.target.value)}
        >
          {stages.map((stage) => (
            <option key={String(stage.id)} value={String(stage.id)}>
              {stage.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Asignado a" htmlFor="crm-deal-assignee">
        <select
          id="crm-deal-assignee"
          className={fieldClass}
          value={assignedTo}
          disabled={readOnly}
          onChange={(e) => setAssignedTo(e.target.value)}
        >
          <option value="">Sin asignar</option>
          {assignees.map((user) => (
            <option key={user.id} value={String(user.id)}>
              {user.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Notas" htmlFor="crm-deal-notes">
        <textarea
          id="crm-deal-notes"
          className={`${fieldClass} min-h-[100px]`}
          value={notes}
          disabled={readOnly}
          placeholder="Agregar notas…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {canWrite && deal ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            Estado
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={`flex-1 ${primaryBtn}`}
              disabled={busy || deal.status === "won"}
              onClick={() => void setStatus("won")}
            >
              {statusAction === "won" ? "Guardando…" : "Marcar como ganado"}
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy || deal.status === "lost"}
              onClick={() => void setStatus("lost")}
            >
              {statusAction === "lost" ? "Guardando…" : "Marcar como perdido"}
            </button>
          </div>
          {deal.status && deal.status !== "open" ? (
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white hover:text-slate-800"
              disabled={busy}
              onClick={() => void setStatus("open")}
            >
              Reabrir trato
            </button>
          ) : null}
        </div>
      ) : null}
    </CrmSheet>
  );
}

function TrashIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}
