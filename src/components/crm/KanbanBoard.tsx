"use client";

import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";
import { formatMxn, sameId } from "./helpers";
import {
  DEFAULT_CURRENCY,
  type Deal,
  type DealStatus,
  type PipelineStage,
} from "./types";
import { detailBtnPress } from "@/components/residentes/DetailPopup";

function asDealStatus(value: string | undefined): DealStatus {
  if (value === "won" || value === "lost" || value === "open") return value;
  return "open";
}

function initials(name?: string | null): string {
  const source = (name || "?").trim();
  if (!source) return "?";
  return source.charAt(0).toUpperCase();
}

function formatCloseDate(value?: string | null): string {
  if (!value) return "";
  const raw = value.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DealCard({
  deal,
  stage,
  canDrag,
  onOpen,
}: {
  deal: Deal;
  stage: PipelineStage;
  canDrag: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `deal-${deal.id}`,
      data: { type: "deal", deal, stageId: deal.stage_id },
      disabled: !canDrag,
    });
  const { setNodeRef: setDropRef } = useDroppable({
    id: `slot-${deal.id}`,
    data: { type: "stage", stageId: deal.stage_id, deal },
  });
  const status = asDealStatus(deal.status);
  const draggedRef = useRef(false);
  if (isDragging) draggedRef.current = true;
  const contactLabel = deal.prospecto_name || "Sin contacto";

  return (
    <button
      type="button"
      ref={(node) => {
        setNodeRef(node);
        setDropRef(node);
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.45 : 1,
      }}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      onClick={() => {
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        onOpen();
      }}
      className={detailBtnPress(
        "group relative w-full cursor-pointer rounded-xl border border-violet-100 bg-white py-3 pl-4 pr-3 text-left shadow-sm [@media(hover:hover)]:hover:border-violet-200 [@media(hover:hover)]:hover:bg-violet-50/40"
      )}
    >
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl"
        style={{ backgroundColor: stage.color || "#94a3b8" }}
      />
      <div className="flex items-start justify-between gap-2">
        <h4 className="flex-1 text-sm font-semibold leading-snug break-words text-gray-900">
          {deal.title}
        </h4>
        {status === "won" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
            Ganado
          </span>
        ) : null}
        {status === "lost" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            Perdido
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-800">
          {initials(deal.prospecto_name)}
        </span>
        <span className="truncate text-xs text-gray-500">{contactLabel}</span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-violet-700">
          {formatMxn(Number(deal.value) || 0, deal.currency || DEFAULT_CURRENCY)}
        </span>
        {deal.expected_close_date ? (
          <span className="flex items-center gap-1 text-[11px] text-gray-500">
            <CalendarIcon />
            {formatCloseDate(deal.expected_close_date)}
          </span>
        ) : null}
      </div>
      {deal.assignee_name ? (
        <div className="mt-2 flex items-center justify-end">
          <span
            title={deal.assignee_name}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-800"
          >
            {initials(deal.assignee_name)}
          </span>
        </div>
      ) : null}
    </button>
  );
}

function StageColumn({
  stage,
  deals,
  canWrite,
  onOpenDeal,
  onAddDeal,
}: {
  stage: PipelineStage;
  deals: Deal[];
  canWrite: boolean;
  onOpenDeal: (deal: Deal) => void;
  onAddDeal: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.id}`,
    data: { type: "stage", stageId: stage.id },
  });
  const totalValue = deals.reduce((sum, deal) => sum + Number(deal.value || 0), 0);

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-xl border border-violet-100 bg-violet-50/60 ${
        isOver ? "ring-2 ring-violet-400" : ""
      }`}
    >
      <div
        className="h-1.5 rounded-t-xl"
        style={{ backgroundColor: stage.color || "#64748b" }}
      />
      <div className="flex items-center justify-between px-3 pt-2">
        <h3 className="truncate text-sm font-semibold text-violet-900">
          {stage.name}
        </h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-violet-600">
          {deals.length}
        </span>
      </div>
      <p className="px-3 pb-2 text-xs text-gray-500">
        {formatMxn(totalValue)}
      </p>
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-col gap-2 px-2 pb-2"
      >
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-violet-100 py-10 text-xs text-gray-400">
            Suelta un trato aquí
          </div>
        ) : (
          deals.map((deal) => (
            <DealCard
              key={String(deal.id)}
              deal={deal}
              stage={stage}
              canDrag={canWrite}
              onOpen={() => onOpenDeal(deal)}
            />
          ))
        )}
      </div>
      {canWrite ? (
        <button
          type="button"
          onClick={() => onAddDeal(String(stage.id))}
          className={detailBtnPress(
            "m-2 rounded-lg border border-dashed border-violet-200 px-3 py-2 text-left text-xs font-medium text-violet-700 [@media(hover:hover)]:hover:bg-white [@media(hover:hover)]:hover:text-violet-900"
          )}
        >
          + Agregar trato
        </button>
      ) : null}
    </div>
  );
}

export function KanbanBoard({
  stages,
  deals,
  canWrite,
  onMove,
  onOpenDeal,
  onAddDeal,
}: {
  stages: PipelineStage[];
  deals: Deal[];
  canWrite: boolean;
  onMove: (dealId: string, stageId: string) => void;
  onOpenDeal: (deal: Deal) => void;
  onAddDeal: (stageId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const fromStage = active.data.current?.stageId;
    const overData = over.data.current as
      | { type?: string; stageId?: string; deal?: Deal }
      | undefined;
    const toStage = overData?.stageId ?? overData?.deal?.stage_id;
    if (toStage == null || sameId(fromStage, toStage)) return;
    const rawId = active.data.current?.deal?.id;
    if (rawId == null) return;
    onMove(String(rawId), String(toStage));
  }

  const ordered = [...stages].sort((a, b) => a.position - b.position);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-h-[420px] gap-3 overflow-x-auto pb-2">
        {ordered.map((stage) => (
          <StageColumn
            key={String(stage.id)}
            stage={stage}
            deals={deals.filter((deal) => sameId(deal.stage_id, stage.id))}
            canWrite={canWrite}
            onOpenDeal={onOpenDeal}
            onAddDeal={onAddDeal}
          />
        ))}
      </div>
    </DndContext>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}
