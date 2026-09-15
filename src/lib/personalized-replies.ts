import { looksLikeQuestion, normalizeQuery } from "./query-enrichment.js";
import { getAdminSettings } from "./admin-settings.js";

function getTimeGreeting(): string {
  const timezone = getAdminSettings().timezone || "America/Mexico_City";
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone,
      }).format(new Date())
    );
    if (hour >= 5 && hour < 12) return "Buenos días";
    if (hour >= 12 && hour < 18) return "Buenas tardes";
    return "Buenas noches";
  } catch {
    return "Hola";
  }
}

export function isSameCalendarDay(
  unixSecondsA: number,
  unixSecondsB: number,
  timezone: string
): boolean {
  const fmt = (unix: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(unix * 1000));
  return fmt(unixSecondsA) === fmt(unixSecondsB);
}

const GREET_AGAIN_AFTER_SECONDS = 12 * 60 * 60;

export function shouldGreetUserAgain(
  lastAssistantMessageAt: number | null,
  timezone: string
): boolean {
  if (lastAssistantMessageAt == null) return true;
  const now = Math.floor(Date.now() / 1000);
  if (now - lastAssistantMessageAt >= GREET_AGAIN_AFTER_SECONDS) return true;
  return !isSameCalendarDay(lastAssistantMessageAt, now, timezone);
}

function normalize(text: string): string {
  return normalizeQuery(
    text
      .replace(/[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/gu, " ")
      .trim()
  );
}

export function extractFirstName(
  displayName?: string | null,
  pushName?: string | null
): string | null {
  const raw = (displayName ?? pushName ?? "").trim();
  if (!raw) return null;
  const first = raw.split(/\s+/)[0]?.trim();
  if (!first || first.length < 2) return null;
  if (/^\d+$/.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function isGreetingOnly(text: string): boolean {
  const t = normalize(text).replace(/[!.,;:]+/g, "").trim();
  if (!t) return false;
  if (
    /^(hola|buenos dias|buenas tardes|buenas noches|buen dia|que tal|hey|saludos|buenas|hi|hello)$/.test(
      t
    )
  ) {
    return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  return words.length <= 3 && /^(hola|buenas|hey|saludos)/.test(words[0] ?? "");
}

export function isHelpSeekingMessage(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return (
    /tengo (una )?(duda|pregunta|consulta)/.test(t) ||
    /tengo (un )?(problema|inconveniente)/.test(t) ||
    /me puedes (ayudar|apoyar|asistir)/.test(t) ||
    /me podrias (ayudar|apoyar|asistir)/.test(t) ||
    /puedes ayudarme/.test(t) ||
    /podrias ayudarme/.test(t) ||
    /necesito (ayuda|apoyo|asistencia)/.test(t) ||
    /quiero (preguntar|consultar)/.test(t) ||
    /me ayudas/.test(t) ||
    /en que me puedes ayudar/.test(t)
  );
}

export function hasSubstantiveQuestion(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;

  if (looksLikeQuestion(text)) {
    if (isHelpSeekingMessage(text) && t.length < 45) {
      return /(sobre|acerca|del|de la|horario|cuota|tag|reglamento|mascota|alberca|pago|acceso|visita)/.test(
        t
      );
    }
    return true;
  }

  if (isGreetingOnly(text) || isHelpSeekingMessage(text)) return false;

  return t.split(/\s+/).filter((w) => w.length > 2).length >= 6;
}

export function shouldAskWhatTheyNeed(text: string): boolean {
  if (hasSubstantiveQuestion(text)) return false;

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const allGreetingsOrHelp = lines.every(
    (line) => isGreetingOnly(line) || isHelpSeekingMessage(line)
  );

  if (allGreetingsOrHelp && lines.length > 0) return true;
  if (isHelpSeekingMessage(text)) return true;

  return isGreetingOnly(text);
}

function extractTopicFromMessage(text: string): string | null {
  const t = normalize(text);
  const topicPatterns: Array<[RegExp, string]> = [
    [/(?:duda|pregunta|consulta)\s+(?:sobre|acerca\s+de|del?|de\s+la)\s+(.+)/, ""],
    [/(?:problema|inconveniente)\s+(?:con|sobre|del?|de\s+la)\s+(.+)/, ""],
    [/(?:ayuda|apoyo|asistencia)\s+(?:con|sobre|para)\s+(.+)/, ""],
    [/(?:saber|informacion|info)\s+(?:sobre|acerca\s+de|del?|de\s+la)\s+(.+)/, ""],
    [/tengo\s+(?:una?\s+)?(?:duda|pregunta|consulta)/, "tu duda"],
    [/tengo\s+(?:una?\s+)?(?:problema|inconveniente)/, "tu problema"],
    [/(?:necesito|quiero)\s+(?:ayuda|apoyo|asistencia)/, ""],
    [/(?:me\s+)?(?:puedes|podrias)\s+(?:ayudar|apoyar)/, ""],
  ];

  for (const [pattern, fallback] of topicPatterns) {
    const match = t.match(pattern);
    if (match) {
      const captured = match[1]?.trim();
      if (captured && captured.length > 2 && captured.length < 60) {
        return captured;
      }
      return fallback || null;
    }
  }
  return null;
}

const HELP_OPENERS: Array<(name: string | null, topic: string | null) => string> = [
  (name, topic) => {
    const who = name ? `${name}, claro` : "Claro";
    const what = topic ? ` te ayudo con ${topic}` : " te puedo ayudar";
    return `${who}, con gusto${what}. ¿En qué más te puedo orientar?`;
  },
  (name, topic) => {
    const who = name ? `${name}, por supuesto` : "Por supuesto";
    const what = topic ? ` te apoyo con ${topic}` : " te apoyo";
    return `${who}, con gusto${what}. Cuéntame, ¿qué necesitas?`;
  },
  (name, topic) => {
    const who = name ? `${name}, claro que sí` : "Claro que sí";
    const what = topic ? `, te ayudo con ${topic}` : "";
    return `${who}${what}. Platícame tu duda y con gusto te oriento.`;
  },
  (name, topic) => {
    const who = name ?? "";
    const what = topic ? `con ${topic}` : "con lo que necesites";
    return who
      ? `${who}, estoy aquí para ayudarte ${what}. Dime, ¿en qué te puedo apoyar?`
      : `Estoy aquí para ayudarte ${what}. Dime, ¿en qué te puedo apoyar?`;
  },
];

const GENERAL_OPENERS: Array<(name: string | null) => string> = [
  (name) => {
    const greeting = getTimeGreeting();
    return name ? `¡${greeting}, ${name}!` : `¡${greeting}!`;
  },
  (name) => {
    const greeting = getTimeGreeting();
    return name ? `${greeting}, ${name}.` : `${greeting}.`;
  },
  (name) => {
    const greeting = getTimeGreeting();
    return name ? `¡${greeting}! ${name}, ¿cómo estás?` : `¡${greeting}! ¿Cómo estás?`;
  },
  (name) => {
    const greeting = getTimeGreeting();
    return name ? `${greeting}, ${name}. ¡Qué gusto saludarte!` : `${greeting}. ¡Qué gusto saludarte!`;
  },
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function buildGreetingOnlyResponse(
  displayName?: string | null,
  pushName?: string | null
): string {
  const firstName = extractFirstName(displayName, pushName);
  const greeting = getTimeGreeting();
  const name = firstName ? ` ${firstName}` : "";
  return `Hola${name}, ${greeting.toLowerCase()}. Estoy para asistirte con cualquier duda que tengas.`;
}

/** Bienvenida cuando el WhatsApp ya está registrado (propietario o contacto). */
const KNOWN_IDLE_LINES = [
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Con gusto te puedo ayudar. ¿En qué te apoyo?`
      : `¡${greeting}! Con gusto te puedo ayudar. ¿En qué te apoyo?`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Aquí estoy para lo que necesites. ¿Cómo te ayudo?`
      : `¡${greeting}! Aquí estoy para lo que necesites. ¿Cómo te ayudo?`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Qué gusto saludarte. Dime en qué te apoyo.`
      : `¡${greeting}! Qué gusto saludarte. Dime en qué te apoyo.`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Estoy listo para ayudarte. ¿Qué necesitas?`
      : `¡${greeting}! Estoy listo para ayudarte. ¿Qué necesitas?`,
];

const KNOWN_REQUEST_LINES = [
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Con gusto te ayudo con tu solicitud; dame un momento para revisarlo.`
      : `¡${greeting}! Con gusto te ayudo con tu solicitud; dame un momento para revisarlo.`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Ya recibí tu consulta. En un momento te doy la respuesta.`
      : `¡${greeting}! Ya recibí tu consulta. En un momento te doy la respuesta.`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Perfecto, voy a revisar lo que me pediste y te contesto enseguida.`
      : `¡${greeting}! Perfecto, voy a revisar lo que me pediste y te contesto enseguida.`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Con gusto te apoyo en eso. Déjame verificar la información.`
      : `¡${greeting}! Con gusto te apoyo en eso. Déjame verificar la información.`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Entendido. Estoy revisando tu solicitud para darte una respuesta precisa.`
      : `¡${greeting}! Entendido. Estoy revisando tu solicitud para darte una respuesta precisa.`,
  (greeting: string, name: string | null) =>
    name
      ? `¡${greeting}, ${name}! Claro que sí. Dame un instante mientras consulto lo que necesitas.`
      : `¡${greeting}! Claro que sí. Dame un instante mientras consulto lo que necesitas.`,
];

export function buildKnownCallerWelcome(
  displayName?: string | null,
  options?: { hasRequest?: boolean }
): string {
  const firstName = extractFirstName(displayName);
  const greeting = getTimeGreeting();
  const hasRequest = Boolean(options?.hasRequest);
  const line = pickRandom(hasRequest ? KNOWN_REQUEST_LINES : KNOWN_IDLE_LINES);
  return line(greeting, firstName);
}

export function buildHelpPromptResponse(
  displayName?: string | null,
  pushName?: string | null,
  userText?: string
): string {
  const firstName = extractFirstName(displayName, pushName);
  const topic = userText ? extractTopicFromMessage(userText) : null;
  return pickRandom(HELP_OPENERS)(firstName, topic);
}

export function buildTopicSuggestionWithGreeting(
  topics: string[],
  displayName?: string | null,
  pushName?: string | null
): string {
  const list = topics.map((t) => `• ${t}`).join("\n");
  const main = topics[0] ?? "este tema";
  const firstName = extractFirstName(displayName, pushName);
  const opener = pickRandom(GENERAL_OPENERS)(firstName);

  return (
    `${opener}\n\n` +
    `Encontré información relacionada con:\n${list}\n\n` +
    `¿Te gustaría saber más sobre *${main}*? ` +
    `Responde *Sí* o escribe tu pregunta con más detalle.`
  );
}

function replyAlreadyPersonalized(reply: string, firstName: string | null): boolean {
  // Strip leading inverted punctuation (¡ ¿) before matching
  const t = normalize(reply).replace(/^[¡¿]+\s*/g, "");
  if (firstName && normalize(reply).includes(normalize(firstName))) return true;
  return /^(hola|buenos dias|buenas tardes|buenas noches|buen dia|buena tarde|buena noche|claro|con gusto|fue un gusto|gracias|perfecto|genial|excelente)/.test(t);
}

export function prependOpenerIfNeeded(
  reply: string,
  options: {
    displayName?: string | null;
    pushName?: string | null;
    shouldGreet: boolean;
  }
): string {
  const firstName = extractFirstName(options.displayName, options.pushName);
  if (replyAlreadyPersonalized(reply, firstName)) return reply;

  if (!options.shouldGreet) return reply;

  const opener = pickRandom(GENERAL_OPENERS)(firstName);
  return `${opener}\n\n${reply}`;
}

export function personalizeFaqAnswer(
  answer: string,
  options: {
    displayName?: string | null;
    pushName?: string | null;
    shouldGreet: boolean;
  }
): string {
  return prependOpenerIfNeeded(answer, options);
}
