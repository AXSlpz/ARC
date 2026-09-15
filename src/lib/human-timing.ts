import type { WaTransport } from "./wa/types.js";

// Initial wait after receiving message (simulates reading + thinking).
// El debounce principal vive en reply-debouncer (15s); esto se usa como fallback.
export const REPLY_DELAY_MS = { min: 15_000, max: 15_000 };

// How long before the total delay the composing indicator starts showing
export const TYPING_LEAD_MS = { min: 2_000, max: 4_000 };

/** Below this word count, the whole reply is one WhatsApp bubble (ignores \\n\\n). */
export const BUBBLE_MIN_SPLIT_WORDS = 120;

// Max words a single paragraph can have before splitting it into sentences
// (only applies when total message exceeds BUBBLE_MIN_SPLIT_WORDS).
export const BUBBLE_PARA_MAX_WORDS = 100;

// When a sentence group grows beyond this while filling a bubble, flush it.
export const BUBBLE_SENTENCE_MAX_WORDS = 70;

// Pause between sending consecutive bubbles
export const BUBBLE_PAUSE_MS = { min: 1_000, max: 2_500 };

// Typing indicator: ~30–35 palabras por minuto (más humano, no instantáneo).
const MS_PER_WORD_FAST = Math.round(60_000 / 35); // ~1714 ms/palabra → 35 ppm
const MS_PER_WORD_SLOW = Math.round(60_000 / 30); // ~2000 ms/palabra → 30 ppm
const MIN_TYPING_MS = 3_000;
const MAX_TYPING_MS = 45_000;

export const FILLER_CHANCE = 0.05;

export const FILLER_MESSAGES = [
  "Déjame revisar...",
  "Un momento, por favor...",
  "Voy a consultarlo...",
  "Dame un segundo...",
];

export function randomMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomReplyDelayMs(): number {
  return randomMs(REPLY_DELAY_MS.min, REPLY_DELAY_MS.max);
}

export function randomTypingLeadMs(): number {
  return randomMs(TYPING_LEAD_MS.min, TYPING_LEAD_MS.max);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/**
 * Duración del indicador "escribiendo…" antes de enviar una burbuja.
 * Escala con el número de palabras a ~30–35 ppm (aleatorio por burbuja).
 */
export function typingDurationMs(wordCount: number): number {
  const msPerWord = randomMs(MS_PER_WORD_FAST, MS_PER_WORD_SLOW);
  const ms = Math.round(Math.max(1, wordCount) * msPerWord);
  return Math.min(Math.max(ms, MIN_TYPING_MS), MAX_TYPING_MS);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Splits text into natural chat bubbles.
 *
 * Short/medium replies stay as ONE bubble (even with \\n\\n).
 * Only very long replies are split by paragraphs / sentence groups.
 */
export function splitIntoBubbles(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (countWords(trimmed) <= BUBBLE_MIN_SPLIT_WORDS) {
    return [trimmed];
  }

  const paragraphs = trimmed
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bubbles: string[] = [];

  for (const para of paragraphs) {
    if (countWords(para) <= BUBBLE_PARA_MAX_WORDS) {
      bubbles.push(para);
      continue;
    }

    const sentences = splitSentences(para);
    let group = "";

    for (const sentence of sentences) {
      const candidate = group ? `${group} ${sentence}` : sentence;
      if (countWords(candidate) <= BUBBLE_SENTENCE_MAX_WORDS) {
        group = candidate;
      } else {
        if (group) bubbles.push(group);
        group = sentence;
      }
    }

    if (group) bubbles.push(group);
  }

  return bubbles.length > 0 ? bubbles : [trimmed];
}

export function shouldAddFiller(text: string): boolean {
  return (
    countWords(text) > BUBBLE_MIN_SPLIT_WORDS && Math.random() < FILLER_CHANCE
  );
}

export function pickFillerMessage(): string {
  return FILLER_MESSAGES[Math.floor(Math.random() * FILLER_MESSAGES.length)]!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function setComposing(
  transport: WaTransport,
  jid: string,
  composing: boolean
): Promise<void> {
  await transport.setComposing(jid, composing);
}

export interface SendHumanLikeTextOptions {
  prependFiller?: boolean;
}

export async function sendHumanLikeText(
  transport: WaTransport,
  jid: string,
  text: string,
  options: SendHumanLikeTextOptions = {}
): Promise<string[]> {
  let bubbles = splitIntoBubbles(text);

  if (options.prependFiller && shouldAddFiller(text)) {
    bubbles = [pickFillerMessage(), ...bubbles];
  }

  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i]!;
    const words = countWords(bubble);

    await setComposing(transport, jid, true);
    await sleep(typingDurationMs(words));
    await transport.sendText(jid, bubble);

    if (i < bubbles.length - 1) {
      await setComposing(transport, jid, false);
      await sleep(randomMs(BUBBLE_PAUSE_MS.min, BUBBLE_PAUSE_MS.max));
    }
  }

  await setComposing(transport, jid, false);
  return bubbles;
}
