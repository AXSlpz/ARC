import OpenAI from "openai";
import { buildSystemPromptForCondominio } from "./system-prompt.js";
import {
  buildReglamentoContext,
  getReglamentoSourceLabels,
  searchReglamentos,
} from "./reglamentos.js";
import { listFaqItems } from "./db-features.js";
import { getSearchTokens, normalizeQuery } from "./query-enrichment.js";
import { sanitizeLeakedManipulationReply } from "./prompt-guard.js";
import { buildServiceScheduleContext } from "./service-schedules.js";

function stripLLMThinkingArtifacts(text: string): string {
  let cleaned = text;

  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, "");
  cleaned = cleaned.replace(/<reflection>[\s\S]*?<\/reflection>/gi, "");

  cleaned = cleaned.replace(/^thought\s*[\n:]/gim, "");
  cleaned = cleaned.replace(/^thinking\s*[\n:]/gim, "");
  cleaned = cleaned.replace(/^reflection\s*[\n:]/gim, "");

  cleaned = cleaned.replace(/^\s*thought\s*$/gim, "");
  cleaned = cleaned.replace(/^\s*thinking\s*$/gim, "");

  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  return cleaned;
}

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
});

const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ReplyContext {
  searchQuery: string;
  condominioId: number;
  condominioName: string;
  category?: string | null;
  tags?: { name: string }[];
  residenteTagContext?: string;
  accountContext?: string;
}

function buildFaqContext(searchQuery: string): string {
  const items = listFaqItems().filter((f) => f.active);
  if (items.length === 0) return "";

  const tokens = getSearchTokens(searchQuery);

  const relevant = items
    .map((item) => {
      const hay = normalizeQuery(`${item.question} ${item.keywords} ${item.answer}`);
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += 1;
      }
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (relevant.length === 0) return "";

  return relevant
    .map((r) => `P: ${r.item.question}\nR: ${r.item.answer}`)
    .join("\n\n");
}

function buildSystemPrompt(ctx: ReplyContext): string {
  const reglamentoContext = buildReglamentoContext(
    ctx.searchQuery,
    ctx.condominioId
  );
  const faqContext = buildFaqContext(ctx.searchQuery);
  const scheduleContext = buildServiceScheduleContext(
    ctx.condominioId,
    ctx.searchQuery
  );
  const tagContext = ctx.residenteTagContext?.trim() || "";
  const accountContext = ctx.accountContext?.trim() || "";
  const hasChunks =
    searchReglamentos(ctx.searchQuery, ctx.condominioId, 1).length > 0;

  const hints: string[] = [];
  if (ctx.category) hints.push(`Categoría del chat: ${ctx.category}`);
  if (ctx.tags?.length) {
    hints.push(`Etiquetas: ${ctx.tags.map((t) => t.name).join(", ")}`);
  }
  if (
    reglamentoContext ||
    faqContext ||
    scheduleContext ||
    tagContext ||
    accountContext
  ) {
    hints.push(
      "Hay información indexada: responde SOLO lo esencial a la pregunta (breve y firme). Si la pregunta es ambigua (ej. 'banda'), primero aclara el sentido; no inventes. Si hay más datos útiles que no usaste, pregunta si quiere más detalles."
    );
  }

  let prompt = buildSystemPromptForCondominio(ctx.condominioName);

  if (hints.length > 0) {
    prompt += `\n\n## Contexto de la conversación:\n${hints.join("\n")}`;
  }

  if (tagContext) {
    prompt += `\n\n## TAG vehicular del residente verificado (fuente autorizada):\n${tagContext}`;
  }

  if (accountContext) {
    prompt += `\n\n## Estado de cuenta del residente verificado (fuente autorizada):\n${accountContext}`;
  }

  if (scheduleContext) {
    prompt += `\n\n## Programación de servicios del condominio (fuente autorizada):\n${scheduleContext}`;
  }

  if (faqContext) {
    prompt += `\n\n## Preguntas frecuentes relevantes:\n${faqContext}`;
  }

  if (reglamentoContext) {
    prompt += `\n\n## Fragmentos del reglamento (única fuente autorizada):\n\n${reglamentoContext}`;
  } else if (!hasChunks && !scheduleContext && !tagContext && !accountContext) {
    prompt += `\n\n## Fragmentos del reglamento:\n(No se encontraron fragmentos relevantes para esta pregunta.)`;
  }

  return prompt;
}

export interface GenerateReplyResult {
  reply: string;
  indexedSources: string[];
}

export async function generateReply(
  history: { role: "user" | "assistant" | "human"; content: string }[],
  ctx: ReplyContext
): Promise<GenerateReplyResult> {
  const reglamentoContext = buildReglamentoContext(
    ctx.searchQuery,
    ctx.condominioId
  );
  const faqContext = buildFaqContext(ctx.searchQuery);
  const scheduleContext = buildServiceScheduleContext(
    ctx.condominioId,
    ctx.searchQuery
  );
  const tagContext = ctx.residenteTagContext?.trim() || "";
  const hasIndexedContext =
    reglamentoContext.length > 0 ||
    faqContext.length > 0 ||
    scheduleContext.length > 0 ||
    tagContext.length > 0;

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(ctx) },
    ...history.map((message) => ({
      role: (message.role === "human" ? "assistant" : message.role) as
        | "user"
        | "assistant",
      content: message.content,
    })),
  ];

  const response = await client.chat.completions.create({
    model,
    messages,
    max_tokens: hasIndexedContext ? 320 : 280,
    temperature: 0.3,
  });

  let reply =
    response.choices[0]?.message?.content?.trim() ??
    "No encuentro esa información en el reglamento del condominio.";

  reply = stripLLMThinkingArtifacts(reply);

  const sanitized = sanitizeLeakedManipulationReply(reply);
  if (sanitized) reply = sanitized;

  const sources = getReglamentoSourceLabels(ctx.searchQuery, ctx.condominioId);
  const noAnswer = reply.includes("No encuentro esa información en el reglamento");
  const indexedSources =
    sources.length > 0 && !noAnswer ? sources : [];

  return { reply, indexedSources };
}
