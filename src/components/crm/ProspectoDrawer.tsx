"use client";

import { useEffect, useState } from "react";
import { Badge, ErrorBanner, LoadingCard } from "./CrmUi";
import {
  DetailField,
  DetailPopup,
  DetailSection,
  detailBtnPress,
} from "@/components/residentes/DetailPopup";
import {
  asStringArray,
  crmFetch,
  errorMessage,
  formatDate,
  pathId,
  pickEntity,
} from "./helpers";
import type { Prospecto } from "./types";

const notesClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:bg-violet-50 disabled:text-violet-800 sm:text-sm";

export function ProspectoDrawer({
  prospectoId,
  canWrite,
  onClose,
  onEdit,
  onChanged,
  onDeleted,
}: {
  prospectoId: string;
  canWrite: boolean;
  onClose: () => void;
  onEdit: (prospecto: Prospecto) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [item, setItem] = useState<Prospecto | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await crmFetch<unknown>(
          `/api/admin/crm/prospectos/${pathId(prospectoId)}`
        );
        const prospecto = pickEntity<Prospecto>(data, "prospecto");
        if (!cancelled) {
          setItem(prospecto);
          setNotes(prospecto.notes ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "No se pudo cargar el prospecto."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prospectoId]);

  async function saveNotes() {
    if (!item) return;
    setSaving(true);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/prospectos/${pathId(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "No se pudieron guardar las notas."));
    } finally {
      setSaving(false);
    }
  }

  async function askDelete() {
    if (!item) return;
    if (
      !window.confirm(
        `¿Eliminar a ${item.name}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await crmFetch(`/api/admin/crm/prospectos/${pathId(item.id)}`, {
        method: "DELETE",
      });
      onDeleted();
    } catch (err) {
      setError(errorMessage(err, "No se pudo eliminar el prospecto."));
      setSaving(false);
    }
  }

  const tags = asStringArray(item?.tags);

  return (
    <DetailPopup
      title={item?.name ?? "Prospecto"}
      subtitle={item?.company || item?.phone || "Contacto comercial"}
      onClose={onClose}
      wide={false}
      footer={
        item ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {canWrite ? (
                <button
                  type="button"
                  className={detailBtnPress(
                    "rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white [@media(hover:hover)]:hover:bg-violet-700"
                  )}
                  onClick={() => onEdit(item)}
                >
                  Editar
                </button>
              ) : null}
              {canWrite ? (
                <button
                  type="button"
                  className={detailBtnPress(
                    "rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 [@media(hover:hover)]:hover:bg-violet-50 disabled:opacity-50"
                  )}
                  onClick={() => void saveNotes()}
                  disabled={saving}
                >
                  {saving ? "Guardando…" : "Guardar notas"}
                </button>
              ) : null}
              {canWrite ? (
                <button
                  type="button"
                  className={detailBtnPress(
                    "rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 [@media(hover:hover)]:hover:bg-red-50 disabled:opacity-50"
                  )}
                  onClick={() => void askDelete()}
                  disabled={saving}
                >
                  Eliminar
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className={detailBtnPress(
                "rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 [@media(hover:hover)]:hover:bg-gray-50"
              )}
              onClick={onClose}
            >
              Cerrar
            </button>
          </>
        ) : (
          <button
            type="button"
            className={detailBtnPress(
              "ml-auto rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 [@media(hover:hover)]:hover:bg-gray-50"
            )}
            onClick={onClose}
          >
            Cerrar
          </button>
        )
      }
    >
      {loading ? <LoadingCard text="Cargando ficha…" /> : null}
      <ErrorBanner message={error} />
      {item && !loading ? (
        <div className="space-y-5">
          <DetailSection title="Datos Generales">
            <DetailField label="Nombre" value={item.name} />
            <DetailField label="Teléfono" value={item.phone} />
            <DetailField label="Correo" value={item.email} />
            <DetailField label="Empresa" value={item.company} />
            <DetailField label="Alta" value={formatDate(item.created_at)} />
            <DetailField label="Actualizado" value={formatDate(item.updated_at)} />
          </DetailSection>

          <div>
            <h4 className="mb-3 w-full border-b border-violet-200 pb-1.5 text-sm font-semibold uppercase tracking-wider text-violet-600">
              Etiquetas
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <span className="text-sm text-gray-400">Sin etiquetas</span>
              ) : (
                tags.map((tag) => (
                  <Badge key={tag} className="bg-violet-100 text-violet-800">
                    {tag}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div>
            <h4 className="mb-3 w-full border-b border-violet-200 pb-1.5 text-sm font-semibold uppercase tracking-wider text-violet-600">
              Notas
            </h4>
            <textarea
              id="crm-p-drawer-notes"
              className={`${notesClass} min-h-[120px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canWrite}
            />
          </div>
        </div>
      ) : null}
    </DetailPopup>
  );
}
