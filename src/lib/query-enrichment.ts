const SYNONYMS: Record<string, string[]> = {
  alberca: ["piscina", "natacion", "nadar", "swimming"],
  piscina: ["alberca", "natacion", "nadar"],
  horario: ["horarios", "hora", "apertura", "cierre", "abierto", "cierra", "atencion"],
  horarios: ["horario", "apertura", "cierre", "atencion"],
  cuota: ["cuotas", "pago", "pagos", "mantenimiento", "mensualidad", "cobranza"],
  costo: ["costos", "precio", "precios", "cuanto", "cuesta", "valor", "cobro"],
  acceso: ["entrada", "visitas", "visitante", "tag", "tags", "pluma", "porton"],
  tag: ["tags", "identificador", "identificadores", "llavero", "chip", "acceso", "pluma"],
  tags: ["tag", "identificador", "identificadores", "llavero", "chip", "acceso"],
  mascota: ["mascotas", "perro", "perros", "gato", "gatos", "animal"],
  estacionamiento: ["cajon", "cajones", "parking", "auto", "vehiculo"],
  ruido: ["fiesta", "fiestas", "musica", "molestia", "queja", "banda", "sonido"],
  musica: ["música", "banda", "grupo", "sonido", "dj", "amplificador"],
  banda: ["grupo musical", "musica", "música", "conjunto", "orquesta", "dj"],
  reglamento: ["normas", "reglas", "politicas", "manual", "condominio"],
  banco: ["bancario", "bancarios", "clabe", "transferencia", "deposito", "santander"],
  basura: ["recoleccion", "recolección", "desechos", "residuos", "trash", "camión"],
  cesped: ["césped", "pasto", "jardin", "jardín", "deshierbe"],
  asamblea: ["asambleas", "junta", "juntas", "reunion", "reunión", "vecinos"],
};

const SHORT_KEYWORDS = new Set(["tag"]);

const TYPO_CORRECTIONS: Record<string, string> = {
  masconas: "mascotas",
  mascona: "mascota",
  maceta: "macetas",
  tsg: "tag",
  tah: "tag",
  taf: "tag",
  tg: "tag",
  identificador: "tag",
  identificadores: "tags",
  llavero: "tag",
  precio: "costo",
  precios: "costo",
  cuanto: "costo",
  cuesta: "costo",
};

export const SEARCH_STOPWORDS = new Set([
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "y",
  "o",
  "u",
  "en",
  "un",
  "una",
  "unos",
  "unas",
  "que",
  "por",
  "para",
  "con",
  "sin",
  "sobre",
  "como",
  "es",
  "son",
  "se",
  "su",
  "sus",
  "al",
  "a",
  "lo",
  "le",
  "les",
  "me",
  "mi",
  "tu",
  "te",
  "ya",
  "si",
  "no",
  "hay",
  "esta",
  "este",
  "estos",
  "estas",
  "ese",
  "esa",
  "esos",
  "esas",
  "que",
  "cual",
  "cuales",
  "cuando",
  "donde",
  "puedo",
  "puede",
  "pueden",
  "tengo",
  "tiene",
  "tienen",
]);

export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

const UNSAFE_TOKENS = new Set(["constructor", "__proto__", "prototype"]);

export function correctToken(token: string): string {
  if (UNSAFE_TOKENS.has(token)) return token;
  if (Object.hasOwn(TYPO_CORRECTIONS, token)) return TYPO_CORRECTIONS[token];
  if (token.length >= 4) {
    for (const key of Object.keys(SYNONYMS)) {
      if (levenshtein(token, key) <= 1) return key;
    }
  }
  return token;
}

export function tokensMatch(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a === b) return true;
  if (a.length >= 3 && b.startsWith(a)) return true;
  if (b.length >= 3 && a.startsWith(b)) return true;
  if (a.length >= 4 && b.length >= 4 && levenshtein(a, b) <= 1) return true;
  return false;
}

export function tokenizeForSearch(text: string): string[] {
  return normalizeQuery(text)
    .split(/\W+/)
    .filter(
      (word) =>
        (SHORT_KEYWORDS.has(word) || word.length > 2) &&
        !SEARCH_STOPWORDS.has(word) &&
        !UNSAFE_TOKENS.has(word)
    )
    .map(correctToken)
    .filter((word): word is string => typeof word === "string");
}

export function expandTokens(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    expanded.add(token);
    for (const [key, values] of Object.entries(SYNONYMS)) {
      if (token === key || values.includes(token)) {
        expanded.add(key);
        values.forEach((v) => expanded.add(v));
      }
    }
  }
  return [...expanded];
}

export function getSearchTokens(text: string): string[] {
  return expandTokens(tokenizeForSearch(text));
}

export type QueryTopic =
  | "tag"
  | "acceso"
  | "alberca"
  | "mascota"
  | "cuota"
  | "basura"
  | "cesped"
  | "asamblea";

export function detectQueryTopics(text: string): QueryTopic[] {
  const tokens = getSearchTokens(text);
  const topics = new Set<QueryTopic>();

  if (
    tokens.some((t) =>
      ["tag", "tags", "identificador", "identificadores", "llavero", "chip"].includes(t)
    )
  ) {
    topics.add("tag");
    topics.add("acceso");
  }
  if (tokens.some((t) => ["acceso", "entrada", "visitante", "visitas", "pluma", "porton"].includes(t))) {
    topics.add("acceso");
  }
  if (tokens.some((t) => ["alberca", "piscina", "natacion", "nadar"].includes(t))) {
    topics.add("alberca");
  }
  if (tokens.some((t) => ["mascota", "mascotas", "perro", "gato", "animal"].includes(t))) {
    topics.add("mascota");
  }
  if (tokens.some((t) => ["cuota", "cuotas", "mantenimiento", "pago", "costo", "cobranza"].includes(t))) {
    topics.add("cuota");
  }
  if (
    tokens.some((t) =>
      ["basura", "recoleccion", "recolección", "desechos", "residuos", "trash"].includes(t)
    )
  ) {
    topics.add("basura");
  }
  if (
    tokens.some((t) =>
      ["cesped", "césped", "pasto", "jardin", "jardín", "deshierbe"].includes(t)
    )
  ) {
    topics.add("cesped");
  }
  if (
    tokens.some((t) =>
      ["asamblea", "asambleas", "junta", "juntas", "reunion", "reunión", "vecinos"].includes(t)
    )
  ) {
    topics.add("asamblea");
  }

  return [...topics];
}

export function looksLikeQuestion(text: string): boolean {
  const t = normalizeQuery(text.trim());
  if (!t) return false;
  if (t.includes("?")) return true;
  if (
    /^(que|qué|cual|cuál|cuando|cuándo|donde|dónde|como|cómo|horario|horarios|precio|cuanto|cuánto|puedo|puede|pueden|hay|tienen|cuesta|abre|cierra|estan|están|esta|está|permitid|prohibid|se puede|costo)/.test(
      t
    )
  ) {
    return true;
  }
  return t.split(/\s+/).filter((w) => w.length > 2).length >= 3;
}

export function buildEnrichedQuery(
  text: string,
  category?: string | null,
  tags?: { name: string }[],
  recentUserMessages?: string[]
): string {
  const parts = [text.trim()];

  if (category?.trim()) parts.push(category.trim());
  if (tags?.length) parts.push(tags.map((t) => t.name).join(" "));

  if (recentUserMessages?.length) {
    const recent = recentUserMessages
      .slice(-3)
      .filter((m) => m.trim().length > 0);
    parts.push(...recent);
  }

  return parts.join(" ");
}
