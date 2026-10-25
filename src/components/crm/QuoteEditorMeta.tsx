"use client";

import { Field, fieldClass } from "./CrmUi";
import type { PriceList, Prospecto } from "./types";

export function QuoteEditorMeta({
  prospectos,
  priceLists,
  prospectoId,
  priceListId,
  validUntil,
  notes,
  locked,
  onProspecto,
  onPriceList,
  onValidUntil,
  onNotes,
}: {
  prospectos: Prospecto[];
  priceLists: PriceList[];
  prospectoId: string;
  priceListId: string;
  validUntil: string;
  notes: string;
  locked: boolean;
  onProspecto: (id: string) => void;
  onPriceList: (id: string) => void;
  onValidUntil: (value: string) => void;
  onNotes: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Prospecto" htmlFor="crm-q-prospecto">
        <select
          id="crm-q-prospecto"
          className={fieldClass}
          value={prospectoId}
          disabled={locked}
          onChange={(e) => onProspecto(e.target.value)}
        >
          <option value="">Selecciona…</option>
          {prospectos.map((p) => (
            <option key={String(p.id)} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Lista de precios" htmlFor="crm-q-list">
        <select
          id="crm-q-list"
          className={fieldClass}
          value={priceListId}
          disabled={locked}
          onChange={(e) => onPriceList(e.target.value)}
        >
          <option value="">Sin lista</option>
          {priceLists.map((list) => (
            <option key={String(list.id)} value={String(list.id)}>
              {list.name}
              {list.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Vigencia" htmlFor="crm-q-until">
        <input
          id="crm-q-until"
          type="date"
          className={fieldClass}
          value={validUntil}
          disabled={locked}
          onChange={(e) => onValidUntil(e.target.value)}
        />
      </Field>
      <Field label="Notas" htmlFor="crm-q-notes">
        <input
          id="crm-q-notes"
          className={fieldClass}
          value={notes}
          disabled={locked}
          onChange={(e) => onNotes(e.target.value)}
        />
      </Field>
    </div>
  );
}
