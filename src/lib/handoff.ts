export const HANDOFF_OFFER =
  "No encuentro esa información en el reglamento del condominio.\n\n¿Desea ser atendido por un representante de atención a cliente? Responda *Si* para confirmar.";

export const HANDOFF_CONFIRMATION =
  "Estamos transfiriendo su solicitud al asesor de atención a cliente para que sea atendido a la brevedad posible.";

export const HANDOFF_REMINDER =
  "Si desea ser atendido por un representante, responda *Si*.";

export function buildTopicSuggestionMessage(topics: string[]): string {
  const list = topics.map((t) => `• ${t}`).join("\n");
  const main = topics[0] ?? "este tema";

  return (
    `Encontré información relacionada con:\n${list}\n\n` +
    `¿Te gustaría saber más sobre *${main}*? ` +
    `Responde *Sí* o escribe tu pregunta con más detalle.`
  );
}

export const TOPIC_CONFIRM_REMINDER =
  "Responde *Sí* para continuar con el tema sugerido, o escribe tu pregunta con más detalle.";

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function isAffirmativeReply(text: string): boolean {
  const value = normalize(text).replace(/\*/g, "");
  return (
    /^(si|sí|yes|ok|okay|claro|dale|por favor|afirmativo|sim)$/.test(value) ||
    value.startsWith("si ") ||
    value === "s"
  );
}

export function isNegativeReply(text: string): boolean {
  const value = normalize(text).replace(/\*/g, "");
  return /^(no|nop|nel|negativo|gracias|nada|cancelar|cancel)$/.test(value);
}

export function isNoAnswerReply(reply: string): boolean {
  const value = normalize(reply);
  return value.includes("no encuentro esa informacion en el reglamento");
}
