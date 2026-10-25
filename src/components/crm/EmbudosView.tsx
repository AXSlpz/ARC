"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CrmModal,
  EmptyCard,
  ErrorBanner,
  Field,
  LoadingCard,
  fieldClass,
  primaryBtn,
  secondaryBtn,
} from "./CrmUi";
import { DealModal } from "./DealModal";
import { KanbanBoard } from "./KanbanBoard";
import { PipelineSettings } from "./PipelineSettings";
import { crmFetch, errorMessage, pathId, sameId, useCanWrite } from "./helpers";
import type { Deal, Pipeline } from "./types";
import { detailBtnPress } from "@/components/residentes/DetailPopup";

export function EmbudosView() {
  const { canWrite } = useCanWrite();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => pipelines.find((p) => sameId(p.id, pipelineId)) ?? null,
    [pipelines, pipelineId]
  );
  const stages = selected?.stages ?? [];

  const loadPipelines = useCallback(async () => {
    const data = await crmFetch<{ pipelines: Pipeline[] }>(
      "/api/admin/crm/pipelines"
    );
    const next = data.pipelines ?? [];
    setPipelines(next);
    setPipelineId((current) => {
      if (current && next.some((p) => sameId(p.id, current))) return current;
      return next[0] ? String(next[0].id) : "";
    });
    return next;
  }, []);

  const loadDeals = useCallback(async (id: string) => {
    if (!id) {
      setDeals([]);
      return;
    }
    const data = await crmFetch<{ deals: Deal[] }>(
      `/api/admin/crm/deals?pipeline_id=${encodeURIComponent(id)}`
    );
    setDeals(data.deals ?? []);
  }, []);

  const reload = useCallback(async () => {
    setError("");
    try {
      await loadPipelines();
    } catch (err) {
      setError(errorMessage(err, "No se pudieron cargar los embudos."));
    }
  }, [loadPipelines]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        await loadPipelines();
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "No se pudieron cargar los embudos."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines]);

  useEffect(() => {
    if (!pipelineId) {
      setDeals([]);
      return;
    }
    void loadDeals(pipelineId).catch((err) => {
      setError(errorMessage(err, "No se pudieron cargar los tratos."));
    });
  }, [pipelineId, loadDeals]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDoc(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  async function createPipeline() {
    if (!newName.trim()) {
      setError("El nombre del embudo es obligatorio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const previousIds = new Set(pipelines.map((p) => String(p.id)));
      const data = await crmFetch<{ pipelines: Pipeline[] }>(
        "/api/admin/crm/pipelines",
        {
          method: "POST",
          body: JSON.stringify({ name: newName.trim() }),
        }
      );
      const next = data.pipelines ?? (await loadPipelines());
      setPipelines(next);
      const created =
        next.find((p) => !previousIds.has(String(p.id))) ??
        next[next.length - 1];
      if (created) setPipelineId(String(created.id));
      setNewName("");
      setCreateOpen(false);
    } catch (err) {
      setError(errorMessage(err, "No se pudo crear el embudo."));
    } finally {
      setSaving(false);
    }
  }

  async function moveDeal(dealId: string, stageId: string) {
    setError("");
    const previous = deals;
    setDeals((prev) =>
      prev.map((deal) =>
        sameId(deal.id, dealId) ? { ...deal, stage_id: stageId } : deal
      )
    );
    try {
      await crmFetch(`/api/admin/crm/deals/${pathId(dealId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage_id: Number.isFinite(Number(stageId))
            ? Number(stageId)
            : stageId,
        }),
      });
    } catch (err) {
      setDeals(previous);
      setError(errorMessage(err, "No se pudo mover el trato."));
    }
  }

  function openNewDeal(stageId?: string) {
    const first = stages[0] ? String(stages[0].id) : "";
    setEditingDeal(null);
    setDefaultStageId(stageId || first);
    setDealOpen(true);
  }

  function openEditDeal(deal: Deal) {
    setEditingDeal(deal);
    setDefaultStageId(String(deal.stage_id));
    setDealOpen(true);
  }

  return (
    <div className="flex h-full flex-col bg-[#f8f7fc]">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-violet-900">Embudos</h2>
            <p className="mt-1 text-sm text-gray-500">
              Da seguimiento a los tratos por etapa.
            </p>
            <div className="relative mt-3" ref={pickerRef}>
              <button
                type="button"
                className={detailBtnPress(
                  "inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-violet-900 [@media(hover:hover)]:hover:bg-violet-50"
                )}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                onClick={() => setPickerOpen((open) => !open)}
              >
                <BranchIcon />
                <span className="font-semibold">
                  {selected ? selected.name : "Seleccionar embudo"}
                </span>
                <ChevronIcon />
              </button>
              {pickerOpen ? (
                <div
                  role="listbox"
                  className="absolute left-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-violet-100 bg-white py-1 shadow-lg"
                >
                  {pipelines.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">
                      Aún no hay embudos
                    </div>
                  ) : (
                    pipelines.map((p) => (
                      <button
                        key={String(p.id)}
                        type="button"
                        role="option"
                        aria-selected={sameId(p.id, pipelineId)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm [@media(hover:hover)]:hover:bg-violet-50 ${
                          sameId(p.id, pipelineId)
                            ? "font-semibold text-violet-800"
                            : "text-gray-800"
                        }`}
                        onClick={() => {
                          setPipelineId(String(p.id));
                          setPickerOpen(false);
                        }}
                      >
                        <BranchIcon className="h-3.5 w-3.5" />
                        {p.name}
                      </button>
                    ))
                  )}
                  <div className="my-1 border-t border-violet-100" />
                  {selected ? (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 [@media(hover:hover)]:hover:bg-violet-50"
                      onClick={() => {
                        setPickerOpen(false);
                        setSettingsOpen(true);
                      }}
                    >
                      <GearIcon />
                      Administrar embudos
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canWrite ? (
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => setCreateOpen(true)}
              >
                + Agregar embudo
              </button>
            ) : null}
            {canWrite ? (
              <button
                type="button"
                className={primaryBtn}
                disabled={!selected || stages.length === 0}
                onClick={() => openNewDeal()}
              >
                + Agregar trato
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-4 pb-4 sm:px-6">
        <ErrorBanner message={error} onRetry={() => void reload()} />
        {loading ? (
          <LoadingCard text="Cargando embudos…" />
        ) : !selected ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-violet-100 bg-white py-20 shadow-sm">
            <BranchIcon className="h-12 w-12 text-violet-200" />
            <h3 className="mt-4 text-lg font-medium text-violet-900">
              Aún no hay embudos
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Crea un embudo para empezar a dar seguimiento a los tratos.
            </p>
            {canWrite ? (
              <button
                type="button"
                className={`mt-4 ${primaryBtn}`}
                onClick={() => setCreateOpen(true)}
              >
                + Crear embudo
              </button>
            ) : null}
          </div>
        ) : stages.length === 0 ? (
          <EmptyCard text="Este embudo no tiene etapas. Ábrelo en Administrar embudos para agregarlas." />
        ) : (
          <KanbanBoard
            stages={stages}
            deals={deals}
            canWrite={canWrite}
            onMove={moveDeal}
            onOpenDeal={openEditDeal}
            onAddDeal={openNewDeal}
          />
        )}
      </div>

      <PipelineSettings
        open={settingsOpen}
        pipeline={selected}
        canWrite={canWrite}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => {
          void loadPipelines();
        }}
        onDeleted={() => {
          setPipelineId("");
          void reload();
        }}
        onCreateNewPipeline={() => {
          setSettingsOpen(false);
          setCreateOpen(true);
        }}
      />

      <DealModal
        open={dealOpen}
        deal={editingDeal}
        pipelineId={pipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        canWrite={canWrite}
        onClose={() => setDealOpen(false)}
        onSaved={() => {
          if (pipelineId) void loadDeals(pipelineId);
        }}
      />

      <CrmModal
        open={createOpen}
        title="Nuevo embudo"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={primaryBtn}
              disabled={saving || !newName.trim()}
              onClick={() => void createPipeline()}
            >
              {saving ? "Creando…" : "Crear embudo"}
            </button>
          </>
        }
      >
        <Field label="Nombre del embudo" htmlFor="crm-new-pipe">
          <input
            id="crm-new-pipe"
            className={fieldClass}
            value={newName}
            placeholder="p. ej., Ventas empresariales"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createPipeline();
            }}
          />
        </Field>
        <p className="text-xs text-gray-400">
          Las etapas predeterminadas (Lead nuevo → Ganado) se crearán
          automáticamente.
        </p>
      </CrmModal>
    </div>
  );
}

function BranchIcon({ className = "h-4 w-4 text-violet-600" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.5 7.5v7.5M8.5 15a7 7 0 0 0 7-7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4 text-violet-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
}
