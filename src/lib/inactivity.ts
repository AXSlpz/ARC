export const INACTIVITY_TIMEOUT_MINUTES = 30;
export const INACTIVITY_TIMEOUT_SECONDS = INACTIVITY_TIMEOUT_MINUTES * 60;

export const DEFAULT_INACTIVITY_FAREWELL_MESSAGE =
  `Por no recibir respuesta en un periodo de ${INACTIVITY_TIMEOUT_MINUTES} minutos, cerramos esta conversación automáticamente.\n\n` +
  `Si necesitas ayuda más adelante, escríbenos de nuevo y con gusto te atenderemos. ¡Que tengas buen día!`;

export function buildInactivityFarewellMessage(custom?: string | null): string {
  const template = custom?.trim() || DEFAULT_INACTIVITY_FAREWELL_MESSAGE;
  return template.replace(/\{minutos\}/g, String(INACTIVITY_TIMEOUT_MINUTES));
}

/** @deprecated Usar buildInactivityFarewellMessage con configuración de admin */
export const INACTIVITY_FAREWELL = DEFAULT_INACTIVITY_FAREWELL_MESSAGE;

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mensajes finales del bot que NO esperan respuesta del cliente
 * (p. ej. acuse de archivo / agradecimiento). No deben disparar cierre por inactividad.
 */
export function isTerminalAssistantMessage(text: string): boolean {
  const t = normalizeForMatch(text);
  if (!t) return false;
  if (/cerramos esta conversacion/.test(t)) return true;
  if (/recibi (tu |el )?(archivo|documento|imagen|foto)/.test(t)) return true;
  if (
    /registre (tu |el )?(mensaje|respuesta|comentario)/.test(t) &&
    !t.includes("?")
  ) {
    return true;
  }
  if (
    /(solicitud|ticket).*(cread|registrad|generad)/.test(t) &&
    !t.includes("?")
  ) {
    return true;
  }
  // Agradecimiento sin pregunta ni invitación a seguir
  if (
    /\bgracias\b/.test(t) &&
    !t.includes("?") &&
    !/en que (te apoyo|puedo ayudarte)|puedo ayudarte|te apoyo/.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * El último mensaje del bot parece pedir una respuesta del cliente
 * (pregunta abierta, menú, petición de archivo, etc.).
 */
export function looksLikeAwaitingClientReply(text: string): boolean {
  if (isTerminalAssistantMessage(text)) return false;
  const t = normalizeForMatch(text);
  if (!t) return false;
  if (text.includes("?") || t.includes("?")) return true;
  if (
    /en que te apoyo|en que puedo ayudarte|como te puedo ayudar|elige (una )?opcion|responde con|escribe (el|tu|un)|envia (el|la|tu|una|un)|por favor (envia|confirma|indica|responde)|confirma (con|si|tu)|opcion [123]|necesita(mos)? (un |una )?(archivo|foto|documento|respuesta)/.test(
      t
    )
  ) {
    return true;
  }
  return false;
}
