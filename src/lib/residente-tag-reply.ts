import type { Residente } from "./residentes.js";
import { normalizeQuery, getSearchTokens } from "./query-enrichment.js";

export interface TagSlot {
  n: 1 | 2;
  estatus: string | null;
  id: number | null;
  placa: string | null;
  modelo: string | null;
  color: string | null;
}

function slotFromResidente(r: Residente, n: 1 | 2): TagSlot {
  if (n === 1) {
    return {
      n: 1,
      estatus: r.tag1_estatus,
      id: r.tag1_id,
      placa: r.tag1_placa,
      modelo: r.tag1_modelo,
      color: r.tag1_color,
    };
  }
  return {
    n: 2,
    estatus: r.tag2_estatus,
    id: r.tag2_id,
    placa: r.tag2_placa,
    modelo: r.tag2_modelo,
    color: r.tag2_color,
  };
}

export function tagSlotHasData(slot: TagSlot): boolean {
  return Boolean(
    slot.id != null ||
      (slot.placa && slot.placa.trim()) ||
      (slot.modelo && slot.modelo.trim()) ||
      (slot.color && slot.color.trim()) ||
      slot.estatus
  );
}

export function looksLikeTagVehicularQuestion(query: string): boolean {
  const hay = normalizeQuery(query);
  if (!hay) return false;

  if (/\btag\s*[12]\b/i.test(query)) return true;
  if (/tag\s*id/i.test(query)) return true;
  if (/n[uú]mero\s*(de\s*)?tag/i.test(query)) return true;

  const phraseHints = [
    "tag vehicular",
    "tags vehiculares",
    "mi placa",
    "mis placas",
    "mi tag",
    "mis tags",
    "placa del",
    "placa de mi",
    "datos del tag",
    "datos de mi tag",
  ];
  if (phraseHints.some((p) => hay.includes(normalizeQuery(p)))) return true;

  const tokens = getSearchTokens(query);
  const tokenHits = ["tag", "tags", "placa", "placas"];
  if (tokenHits.some((t) => tokens.includes(t))) return true;

  // Vehículo + dato: evita falsos positivos con "auto" suelto
  const vehicleTokens = ["vehiculo", "auto", "carro", "camioneta", "moto", "motocicleta"];
  const dataTokens = ["placa", "placas", "tag", "tags", "color", "modelo", "id"];
  const hasVehicle = vehicleTokens.some((t) => tokens.includes(t) || hay.includes(t));
  const hasData = dataTokens.some((t) => tokens.includes(t));
  if (hasVehicle && hasData) return true;

  return false;
}

function wantsOnlyTag(n: 1 | 2, query: string): boolean {
  const hay = normalizeQuery(query);
  if (n === 1) {
    return (
      /\btag\s*1\b/i.test(query) ||
      hay.includes("primer tag") ||
      hay.includes("tag uno")
    );
  }
  return (
    /\btag\s*2\b/i.test(query) ||
    hay.includes("segundo tag") ||
    hay.includes("tag dos")
  );
}

function formatSlotLines(slot: TagSlot): string[] {
  const lines: string[] = [`*TAG ${slot.n}*`];
  if (slot.estatus) lines.push(`• Estatus: ${slot.estatus}`);
  if (slot.id != null) lines.push(`• TAG ID: ${slot.id}`);
  if (slot.placa?.trim()) lines.push(`• Placa: ${slot.placa.trim().toUpperCase()}`);
  if (slot.modelo?.trim()) lines.push(`• Modelo: ${slot.modelo.trim()}`);
  if (slot.color?.trim()) lines.push(`• Color: ${slot.color.trim()}`);
  return lines;
}

/**
 * Respuesta directa con los TAG/placa del residente verificado.
 * Devuelve null si la pregunta no parece de TAG vehicular.
 */
export function formatDirectTagVehicularReply(
  residente: Residente,
  query: string
): string | null {
  if (!looksLikeTagVehicularQuestion(query)) return null;

  const tag1 = slotFromResidente(residente, 1);
  const tag2 = slotFromResidente(residente, 2);
  const only1 = wantsOnlyTag(1, query);
  const only2 = wantsOnlyTag(2, query);

  let slots: TagSlot[] = [];
  if (only1 && !only2) slots = [tag1];
  else if (only2 && !only1) slots = [tag2];
  else slots = [tag1, tag2].filter(tagSlotHasData);

  if (slots.length === 0) {
    if (only1 || only2) {
      const n = only1 ? 1 : 2;
      return `No tengo registrado el TAG ${n} en tu perfil. Si ya lo tramitaste, pide a administración que lo actualice en el sistema.`;
    }
    return "No tengo TAG vehicular ni placa registrados en tu perfil. Si ya los tramitaste, pide a administración que los carguen en el sistema.";
  }

  // Si pidió uno específico sin datos:
  if (only1 && !tagSlotHasData(tag1)) {
    return "No tengo registrado el TAG 1 en tu perfil. Si ya lo tramitaste, pide a administración que lo actualice en el sistema.";
  }
  if (only2 && !tagSlotHasData(tag2)) {
    return "No tengo registrado el TAG 2 en tu perfil. Si ya lo tramitaste, pide a administración que lo actualice en el sistema.";
  }

  const blocks = slots.filter(tagSlotHasData).map((s) => formatSlotLines(s).join("\n"));
  const intro =
    blocks.length === 1
      ? "Estos son los datos de tu TAG vehicular:"
      : "Estos son los datos de tus TAG vehiculares:";

  return `${intro}\n\n${blocks.join("\n\n")}`;
}

/** Contexto para el LLM cuando la pregunta habla de TAG/placa. */
export function buildTagVehicularContext(
  residente: Residente,
  query?: string
): string {
  if (query && !looksLikeTagVehicularQuestion(query)) return "";

  const slots = [slotFromResidente(residente, 1), slotFromResidente(residente, 2)].filter(
    tagSlotHasData
  );
  if (slots.length === 0) {
    return "El residente verificado no tiene TAG vehicular ni placa registrados en su perfil.";
  }

  return slots
    .map((s) => {
      const parts = [
        s.estatus ? `estatus ${s.estatus}` : null,
        s.id != null ? `ID ${s.id}` : null,
        s.placa ? `placa ${s.placa}` : null,
        s.modelo ? `modelo ${s.modelo}` : null,
        s.color ? `color ${s.color}` : null,
      ].filter(Boolean);
      return `- TAG ${s.n}: ${parts.join(", ")}`;
    })
    .join("\n");
}
