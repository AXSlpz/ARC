import { getAdminSettings } from "./admin-settings.js";

const EXAMPLE_POOL = [
  "¿Cuál es el horario de la alberca?",
  "¿Cómo registro una visita?",
  "¿Cuándo vence la cuota de mantenimiento?",
  "¿Qué normas hay sobre mascotas?",
  "¿Dónde reporto una fuga de agua?",
  "¿Cuál es el horario del área común?",
  "¿Cómo solicito un permiso de obra?",
  "¿Hay estacionamiento para visitas?",
  "¿Quién contacto para temas de seguridad?",
  "¿Cuándo son las juntas de condominio?",
];

const DEFAULT_INTROS = [
  "¡Qué gusto saludarte! Estoy aquí para ayudarte.",
  "Hola, gracias por escribir. Con gusto te apoyo.",
  "¡Bienvenido! Estoy para apoyarte.",
  "Hola, con gusto te apoyo el día de hoy.",
  "¡Hola! Estoy para ayudarte con lo que necesites.",
  "¡Qué tal! Aquí estoy para atenderte.",
  "Hola, ¿cómo te puedo ayudar hoy?",
  "Hola, con gusto estoy aquí para apoyarte.",
];

const CLOSINGS = [
  "Escribe tu pregunta o duda y con gusto te ayudo.",
  "Escríbeme lo que necesitas y te apoyo.",
  "¿En qué te puedo apoyar hoy?",
  "Cuando quieras, platícame tu duda.",
  "Cuéntame en qué te puedo ayudar.",
  "Dime qué necesitas y te ayudo.",
  "Por favor, escríbeme tu pregunta.",
  "Estoy a tus órdenes, ¿qué necesitas saber?",
];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function getTimeGreeting(timezone: string): string {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone || "America/Mexico_City",
      }).format(new Date())
    );
    if (hour >= 5 && hour < 12) return "Buenos días";
    if (hour >= 12 && hour < 18) return "Buenas tardes";
    return "Buenas noches";
  } catch {
    return "Hola";
  }
}

function pickIntro(customWelcome: string, displayName?: string | null): string {
  const pool = [...DEFAULT_INTROS];
  const custom = customWelcome.trim();
  if (custom) {
    pool.push(custom, custom);
  }

  let intro = pickRandom(pool);
  const greeting = getTimeGreeting(getAdminSettings().timezone);

  if (displayName) {
    const firstName = displayName.trim().split(/\s+/)[0];
    if (firstName) {
      intro = `¡${greeting}, ${firstName}! ${intro.charAt(0).toLowerCase()}${intro.slice(1)}`;
    } else {
      intro = `¡${greeting}! ${intro}`;
    }
  } else {
    intro = `¡${greeting}! ${intro}`;
  }

  return intro;
}

function pickExamples(): string[] {
  const total = randomMs(3, 4);
  return shuffle(EXAMPLE_POOL).slice(0, total);
}

function randomMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function buildWelcomeMessage(
  customWelcome: string,
  displayName?: string | null,
  options?: { includeExamples?: boolean }
): string {
  const intro = pickIntro(customWelcome, displayName);
  const closing = pickRandom(CLOSINGS);
  const includeExamples = options?.includeExamples !== false;

  if (!includeExamples) {
    return `${intro} ${closing}`;
  }

  const examples = pickExamples();
  const exampleLines = examples.map((example) => `• ${example}`).join("\n");
  return `${intro}\nPor ejemplo, puedes preguntarme:\n${exampleLines}\n${closing}`;
}
