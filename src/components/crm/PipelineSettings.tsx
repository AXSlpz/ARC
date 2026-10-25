"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import {
  CrmModal,
  ErrorBanner,
  Field,
  fieldClass,
  primaryBtn,
  secondaryBtn,
} from "./CrmUi";
import { crmFetch, errorMessage, pathId, sameId } from "./helpers";
import { STAGE_COLORS, type Pipeline, type PipelineStage } from "./types";

function isTempId(id: string): boolean {
  return id.startsWith("tmp-");
}

function SortableStageRow({
  stage,
  canWrite,
  onChange,
  onRemove,
}: {
  stage: PipelineStage;
  canWrite: boolean;
  onChange: (patch: Partial<PipelineStage>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(stage.id), disabled: !canWrite });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2"
    >
      {canWrite ? (
        <button
          type="button"
          className="cursor-grab touch-none px-0.5 text-slate-400 hover:text-slate-700 active:cursor-grabbing"
          aria-label="Arrastra para reordenar"
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
      ) : null}
      <ColorSwatch
        value={stage.color || STAGE_COLORS[0]}
        disabled={!canWrite}
        onChange={(color) => onChange({ color })}
      />
      <input
        className={`${fieldClass} h-8 flex-1 border-transparent bg-transparent px-2 py-1`}
        value={stage.name}
        disabled={!canWrite}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      {canWrite ? (
        <button
          type="button"
          className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-red-600"
          aria-label={`Eliminar etapa ${stage.name}`}
          onClick={onRemove}
        >
          <TrashIcon />
        </button>
      ) : null}
    </div>
  );
}

function ColorSwatch({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="h-4 w-4 rounded-full border border-slate-300 disabled:cursor-not-allowed"
        style={{ backgroundColor: value }}
        aria-label="Cambiar color"
      />
      {open && !disabled ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 flex w-36 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {STAGE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
                className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: color === value ? "#0f172a" : "transparent",
                }}
                aria-label={`Color ${color}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function PipelineSettings({
  open,
  pipeline,
  canWrite,
  onClose,
  onSaved,
  onDeleted,
  onCreateNewPipeline,
}: {
  open: boolean;
  pipeline: Pipeline | null;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onCreateNewPipeline: () => void;
}) {
  const [name, setName] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState<string>(STAGE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    if (!open || !pipeline) return;
    setName(pipeline.name);
    setStages(
      [...(pipeline.stages ?? [])].sort((a, b) => a.position - b.position)
    );
    setNewStageName("");
    setNewStageColor(STAGE_COLORS[0]);
    setShowDeleteConfirm(false);
    setError("");
  }, [open, pipeline]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStages((prev) => {
      const from = prev.findIndex((s) => sameId(s.id, active.id));
      const to = prev.findIndex((s) => sameId(s.id, over.id));
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to).map((stage, position) => ({
        ...stage,
        position,
      }));
    });
  }

  function addStage() {
    const trimmed = newStageName.trim();
    if (!trimmed) return;
    setStages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        name: trimmed,
        position: prev.length,
        color: newStageColor,
      },
    ]);
    setNewStageName("");
    setNewStageColor(
      STAGE_COLORS[(stages.length + 1) % STAGE_COLORS.length] ?? STAGE_COLORS[0]
    );
  }

  async function save() {
    if (!pipeline) return;
    if (!name.trim()) {
      setError("El nombre del embudo es obligatorio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/pipelines/${pathId(pipeline.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      await crmFetch(`/api/admin/crm/pipelines/${pathId(pipeline.id)}/stages`, {
        method: "PUT",
        body: JSON.stringify({
          stages: stages.map((stage, position) => ({
            ...(isTempId(String(stage.id)) ? {} : { id: Number(stage.id) }),
            name: stage.name.trim() || "Etapa",
            position,
            color: stage.color || STAGE_COLORS[0],
          })),
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(
        errorMessage(
          err,
          "No se pudieron guardar las etapas. Si una etapa tiene tratos, no se puede borrar."
        )
      );
    } finally {
      setSaving(false);
    }
  }

  async function removePipeline() {
    if (!pipeline) return;
    setDeleting(true);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/pipelines/${pathId(pipeline.id)}`, {
        method: "DELETE",
      });
      onDeleted();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No se pudo eliminar el embudo."));
    } finally {
      setDeleting(false);
    }
  }

  if (!pipeline) return null;

  return (
    <CrmModal
      open={open}
      title="Administrar embudo"
      onClose={onClose}
      footer={
        showDeleteConfirm ? undefined : (
          <>
            {canWrite ? (
              <button
                type="button"
                className="mr-auto rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Eliminar embudo
              </button>
            ) : null}
            <button type="button" className={secondaryBtn} onClick={onClose}>
              Cancelar
            </button>
            {canWrite ? (
              <button
                type="button"
                className={primaryBtn}
                disabled={saving || !name.trim()}
                onClick={() => void save()}
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            ) : null}
          </>
        )
      }
    >
      <ErrorBanner message={error} />
      {showDeleteConfirm ? (
        <div>
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
            <span className="mt-0.5 text-red-500" aria-hidden>
              ⚠
            </span>
            <div>
              <p className="text-sm font-medium text-red-700">Eliminar embudo</p>
              <p className="mt-1 text-xs text-slate-600">
                Esto archivará todos los tratos de este embudo. No se puede
                deshacer.
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              disabled={deleting}
              onClick={() => void removePipeline()}
            >
              {deleting ? "Eliminando…" : "Eliminar embudo"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <Field label="Nombre del embudo" htmlFor="crm-pipe-name">
            <input
              id="crm-pipe-name"
              className={fieldClass}
              value={name}
              disabled={!canWrite}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="grid gap-2">
            <p className="text-sm font-medium text-slate-700">Etapas</p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={stages.map((s) => String(s.id))}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {stages.map((stage, index) => (
                    <SortableStageRow
                      key={String(stage.id)}
                      stage={stage}
                      canWrite={canWrite}
                      onChange={(patch) =>
                        setStages((prev) =>
                          prev.map((item, i) =>
                            i === index ? { ...item, ...patch } : item
                          )
                        )
                      }
                      onRemove={() =>
                        setStages((prev) =>
                          prev
                            .filter((_, i) => i !== index)
                            .map((item, position) => ({ ...item, position }))
                        )
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {canWrite ? (
              <>
                <div className="mt-1 flex flex-wrap gap-1">
                  {STAGE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewStageColor(color)}
                      className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        borderColor:
                          newStageColor === color ? "#0f172a" : "transparent",
                      }}
                      aria-label={`Color ${color}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className={`${fieldClass} text-sm`}
                    value={newStageName}
                    placeholder="Nombre de la etapa nueva"
                    onChange={(e) => setNewStageName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addStage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={`shrink-0 ${secondaryBtn}`}
                    disabled={!newStageName.trim()}
                    onClick={addStage}
                  >
                    + Agregar
                  </button>
                </div>
              </>
            ) : null}
          </div>
          {canWrite ? (
            <button
              type="button"
              className={`w-full ${secondaryBtn}`}
              onClick={onCreateNewPipeline}
            >
              + Crear un embudo nuevo
            </button>
          ) : null}
        </>
      )}
    </CrmModal>
  );
}

function GripIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
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
