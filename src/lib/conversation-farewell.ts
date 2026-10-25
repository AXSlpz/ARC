export const SURVEY_RESPONSE_TIMEOUT_MINUTES = 10;
export const SURVEY_RESPONSE_TIMEOUT_SECONDS =
  SURVEY_RESPONSE_TIMEOUT_MINUTES * 60;

export const SURVEY_PROMPT =
  "¿Cómo calificarías la atención recibida? Responde con un número del 1 al 5 (1=malo, 5=excelente).";

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/gu, " ")
    .replace(/\s+/g, " ");
}

function hasSubstantiveQuestion(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  if (/\?/.test(text)) return true;
  if (
    /(sobre|acerca|del|de la|horario|cuota|tag|reglamento|mascota|alberca|pago|acceso|visita|cuando|donde|como|que|quien|cual)/.test(
      t
    ) &&
    t.split(/\s+/).length >= 4
  ) {
    return true;
  }
  return t.split(/\s+/).filter((word) => word.length > 2).length >= 8;
}

export function isFarewellMessage(
  text: string,
  hasAssistantReplies = true
): boolean {
  if (!hasAssistantReplies) return false;
  if (hasSubstantiveQuestion(text)) return false;

  const t = normalize(text)
    .replace(/[!.,;:¿?¡]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return false;

  const farewellPatterns = [
    /^(muchas )?gracias( por todo| es todo| seria todo| de antemano)?$/,
    /^gracias (es todo|seria todo|nada mas|por todo|por la ayuda|por tu ayuda)$/,
    /^(es todo|eso es todo|eso seria todo|seria todo|nada mas|por ahora es todo)( gracias)?$/,
    /^(es todo|eso es todo|eso seria todo) gracias$/,
    /^(listo|perfecto|excelente|genial|ok|vale|de acuerdo) gracias$/,
    /^listo$/,
    /^(no )?(gracias|muchas gracias)( es todo)?$/,
    /^(adios|hasta luego|hasta pronto|nos vemos|bye|chao|que tengas buen dia|que tengas buena tarde|que tengas buena noche)$/,
    /^(gracias|muchas gracias).*(adios|hasta luego|nos vemos|es todo|nada mas)/,
    /^(adios|hasta luego|nos vemos).*(gracias|muchas gracias)/,
    /^gracias eso (es|seria) todo$/,
    /^quedo al pendiente gracias$/,
    /^gracias quedo al pendiente$/,
  ];

  if (farewellPatterns.some((pattern) => pattern.test(t))) return true;

  const words = t.split(/\s+/).filter(Boolean);
  if (
    words.length <= 5 &&
    /gracias/.test(t) &&
    /(todo|nada mas|adios|hasta luego|nos vemos)/.test(t)
  ) {
    return true;
  }

  return false;
}

const SURVEY_TIMEOUT_CLOSINGS: Array<() => string> = [
  () =>
    "No obtuvimos respuesta de tu parte, así que cerramos esta conversación por ahora. Vuelve cuando gustes, con gusto te atiendo.",
  () =>
    "Como no recibimos tu respuesta, damos por cerrada esta conversación. Escríbenos cuando lo necesites, aquí estaremos.",
  () =>
    "Al no recibir respuesta, procedemos a cerrar el chat. Cuando quieras, vuelve a escribirnos y con gusto te apoyamos.",
  () =>
    "Cerramos esta conversación por falta de respuesta. No dudes en contactarnos de nuevo cuando lo necesites.",
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function buildFarewellWithSurveyResponse(
  _displayName?: string | null,
  _pushName?: string | null
): string {
  return "Con gusto. Cuando necesites algo de ARC o del reglamento de construcción, aquí estoy.";
}

/** Cierre por encuesta sin respuesta: no reenviar la encuesta. */
export function buildSurveyTimeoutCloseMessage(): string {
  return pickRandom(SURVEY_TIMEOUT_CLOSINGS)();
}
