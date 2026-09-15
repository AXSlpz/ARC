export interface TagLike {
  id: number;
  name: string;
  color: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

const IGNORED_TOKENS = new Set([
  "tag",
  "tags",
  "hola",
  "buenos",
  "dias",
  "tardes",
  "noches",
  "gracias",
  "por",
  "favor",
]);

function hasWord(hay: string, word: string): boolean {
  if (word.length < 3) return false;
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return pattern.test(hay);
}

export function detectTagFromMessage(
  text: string,
  tags: TagLike[]
): TagLike | null {
  const hay = normalize(text);
  const tokens = hay
    .split(/\W+/)
    .filter((t) => t.length > 2 && !IGNORED_TOKENS.has(t));

  let best: { tag: TagLike; score: number } | null = null;

  for (const tag of tags) {
    const name = normalize(tag.name);
    const nameTokens = name.split(/\W+/).filter((t) => t.length > 2);
    let score = 0;

    if (hasWord(hay, name)) score += 4;

    for (const token of tokens) {
      if (hasWord(name, token)) score += 2;
      if (nameTokens.some((nt) => nt === token)) score += 1;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { tag, score };
    }
  }

  return best && best.score >= 3 ? best.tag : null;
}
