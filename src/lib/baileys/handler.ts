import type { WASocket, proto } from "@whiskeysockets/baileys";
import { maskPhone, maskText, botLog, botError } from "../logger.js";
import {
  getOrCreateConversation,
  getConversationById,
  insertMessage,
  getRecentHistory,
  setAwaitingHandoff,
  requestHumanHandoff,
  queueHumanHandoff,
} from "../db.js";
import {
  getUrgencyKeywords,
  getWelcomeMessage,
  isMenuEnabled,
  shouldShowMenu,
  setMenuSentAt,
  applyCategoryFromIndexedAnswer,
  recordReglamentoHit,
  setConversationPriority,
  setHandoffSummary,
  setAwaitingSurvey,
  insertMessageWithMedia,
  addConversationTag,
  listTags,
  reopenConversation,
  getConversationTags,
  setAwaitingTopicConfirm,
  clearAwaitingTopicConfirm,
  updateConversationContact,
} from "../db-features.js";
import {
  buildFarewellWithSurveyResponse,
  isFarewellMessage,
} from "../conversation-farewell.js";
import { getAdminSettings } from "../admin-settings.js";
import { generateReply } from "../openrouter.js";
import {
  isPromptManipulationAttempt,
  PROMPT_GUARD_REJECTION,
} from "../prompt-guard.js";
import { assessReglamentoMatch } from "../reglamentos.js";
import {
  buildEnrichedQuery,
  looksLikeQuestion,
} from "../query-enrichment.js";
import {
  HANDOFF_OFFER,
  HANDOFF_CONFIRMATION,
  HANDOFF_REMINDER,
  isAffirmativeReply,
  isNegativeReply,
  isNoAnswerReply,
  TOPIC_CONFIRM_REMINDER,
} from "../handoff.js";
import {
  buildGreetingOnlyResponse,
  buildKnownCallerWelcome,
  buildHelpPromptResponse,
  buildTopicSuggestionWithGreeting,
  extractFirstName as extractDisplayFirstName,
  isGreetingOnly,
  isHelpSeekingMessage,
  prependOpenerIfNeeded,
  shouldAskWhatTheyNeed,
  shouldGreetUserAgain,
} from "../personalized-replies.js";
import {
  isWithinBusinessHours,
  getHandoffOutOfHoursMessage,
} from "../business-hours.js";
import { buildWelcomeMessage } from "../welcome.js";
import { detectUrgency } from "../urgency.js";
import { generateHandoffSummary } from "../handoff-summary.js";
import { extractIncomingImageText, IncomingMediaError } from "../incoming-media.js";
import {
  BLOCKED_MEDIA_MESSAGES,
  type BlockedMediaKind,
  exceedsPortalFileLimit,
  FILE_TOO_LARGE_MESSAGE,
  isBlockedClientDocument,
  isPdfDocument,
} from "../incoming-media-security.js";
import { broadcastDashboard } from "../ws-notify.js";
import { handleIncomingTicketMessage } from "./ticket-router.js";
import { createBaileysTransport } from "../wa/baileys-transport.js";
import { createMetaTransport } from "../wa/meta-transport.js";
import { getTransport } from "../wa/registry.js";
import type { IncomingTextEvent, WaTransport } from "../wa/types.js";
import {
  createVerificacion,
  updateVerificacion,
  getPendingVerificacion,
  getResidente,
  getCondominio,
  findResidenteByNombre,
  type Residente,
} from "../residentes.js";
import {
  extractFirstName,
  getMissingVerificationMessage,
  hasCompleteVerificationFields,
  IDENTITY_FAILURE_MESSAGE,
  isFullyIdentified,
  isIdentityVerified,
  isRegisteredOwnerPhone,
  matchResidentesIdentity,
  mergeVerificationFields,
  parseSenderName,
  setAwaitingSenderName,
  setIdentityVerified,
  setIdentityVerifiedPendingProperty,
  setSenderName,
  SENDER_NAME_INVALID_MESSAGE,
  SENDER_NAME_PROMPT,
} from "../resident-identity.js";
import {
  buildPropertyChoicePrompt,
  clearAwaitingPropertyChoice,
  findSiblingProperties,
  getAwaitingPropertyChoices,
  listPropertiesForCallerPhone,
  parsePropertyChoice,
  parsePropertyMentionInQuestion,
  resolveKnownCallerMatches,
  selectConversationProperty,
  setAwaitingPropertyChoice,
} from "../property-choice.js";
import { shouldPromptPropertyChoice } from "../property-scoped-question.js";
import { sendHumanLikeText, setComposing } from "../human-timing.js";
import {
  registerPendingReplyProcessor,
  scheduleDebouncedReply,
  type PendingReplyPayload,
} from "./reply-debouncer.js";
import { resolveContactPhone } from "./resolve-contact-phone.js";

let processorRegistered = false;

/** Registra el procesador de respuestas (bot process o webhook Next). */
export function ensureBotProcessorRegistered(): void {
  if (processorRegistered) return;
  registerPendingReplyProcessor(processPendingReply);
  processorRegistered = true;
}

export function registerMessageHandler(sock: WASocket, lineId: number): void {
  ensureBotProcessorRegistered();

  console.log(`[bot] Handler de mensajes registrado (línea ${lineId})`);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      try {
        if (msg.key) await handleMessage(sock, msg, lineId);
      } catch (err) {
        botError(`Error procesando mensaje (línea ${lineId})`, err);
      }
    }
  });
}

/**
 * Ingesta un mensaje de texto ya normalizado (p.ej. webhook Meta).
 * Reutiliza la misma cola de debounce / IA que Baileys.
 */
export function ingestIncomingTextEvent(event: IncomingTextEvent): void {
  ensureBotProcessorRegistered();

  // Meta inbound siempre envía por Graph API (no requiere socket Baileys).
  const transport = createMetaTransport(event.lineId);

  botLog(
    `← Mensaje Meta de ${event.pushName ?? maskPhone(event.contactPhone)}: ${maskText(event.text)}`
  );

  const convo = getOrCreateConversation(
    event.chatKey,
    event.pushName,
    event.lineId,
    event.contactPhone
  );
  saveContactPhone(convo.id, event.contactPhone);
  insertMessage(convo.id, "user", event.text);
  broadcastDashboard("conversations");

  let fresh = getConversationById(convo.id);
  if (!fresh) return;

  if (fresh.closed_at) {
    reopenConversation(fresh.id);
    fresh = getConversationById(fresh.id);
    if (!fresh) return;
  }

  if (fresh.mode !== "AI") {
    console.log(`[bot] Modo ${fresh.mode} — no responde IA`);
    return;
  }

  scheduleDebouncedReply({
    conversationId: fresh.id,
    sock: transport,
    remoteJid: event.chatKey,
    phone: event.chatKey,
    contactPhone: event.contactPhone,
    pushName: event.pushName,
    lineId: event.lineId,
    texts: [event.text],
  });
}

async function sendBotReply(
  sock: WaTransport,
  remoteJid: string,
  conversationId: number,
  reply: string,
  pushName: string | null,
  phone: string,
  options: {
    prependFiller?: boolean;
    displayName?: string | null;
    skipPersonalization?: boolean;
  } = {}
): Promise<void> {
  let finalReply = reply;

  if (!options.skipPersonalization) {
    const convo = getConversationById(conversationId);
    finalReply = prependOpenerIfNeeded(reply, {
      displayName: options.displayName ?? convo?.name ?? null,
      pushName,
      shouldGreet: shouldIncludePersonalizedGreeting(conversationId),
    });
  }

  insertMessage(conversationId, "assistant", finalReply);
  await sendHumanLikeText(sock, remoteJid, finalReply, options);
  broadcastDashboard("conversations");
  botLog(
    `→ Enviado a ${pushName ?? maskPhone(phone)}: ${maskText(finalReply)}`
  );
}

function getLastAssistantMessageAt(conversationId: number): number | null {
  const history = getRecentHistory(conversationId, 100);
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]!;
    if (msg.role === "assistant" || msg.role === "human") {
      return msg.created_at;
    }
  }
  return null;
}

function shouldIncludePersonalizedGreeting(conversationId: number): boolean {
  return shouldGreetUserAgain(
    getLastAssistantMessageAt(conversationId),
    getAdminSettings().timezone
  );
}

function hasAssistantReplies(conversationId: number): boolean {
  return getRecentHistory(conversationId, 50).some(
    (message) => message.role === "assistant" || message.role === "human"
  );
}

function isIdentityQuestion(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[¿¡?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /^(quien|que)\s+(eres|es\s+esto|es\s+usted|eres\s+tu)(\s+tu)?$/,
    /^(con\s+quien|con\s+que)\s+(hablo|estoy\s+hablando|me\s+comunico)(\s*\?)?$/,
    /^(eres|es)\s+(un\s+)?(bot|robot|ia|inteligencia\s+artificial|chatbot|maquina|programa|sistema)(\s*\?)?$/,
    /^(esto\s+es|eres)\s+(automatico|automatizado|ia|un\s+bot)(\s*\?)?$/,
    /^(hay|existe)\s+(alguien|una\s+persona|un\s+humano|un\s+asesor)\s+(ahi|aqui|al\s+otro\s+lado)(\s*\?)?$/,
    /^(hablo\s+con\s+una?\s+(persona|humano|asesor)|me\s+atiende\s+una?\s+(persona|humano))(\s*\?)?$/,
  ];

  return patterns.some((re) => re.test(t));
}

async function transferToHuman(
  sock: WaTransport,
  remoteJid: string,
  conversationId: number,
  pushName: string | null,
  phone: string,
  urgent = false
): Promise<void> {
  const summary = await generateHandoffSummary(conversationId);
  setHandoffSummary(conversationId, summary);

  if (urgent) setConversationPriority(conversationId, "urgent");

  if (isWithinBusinessHours()) {
    requestHumanHandoff(conversationId);
    await sendBotReply(
      sock,
      remoteJid,
      conversationId,
      urgent
        ? `${HANDOFF_CONFIRMATION}\n\n⚠️ Tu solicitud fue marcada como urgente.`
        : HANDOFF_CONFIRMATION,
      pushName,
      phone
    );
  } else {
    queueHumanHandoff(conversationId);
    await sendBotReply(
      sock,
      remoteJid,
      conversationId,
      getHandoffOutOfHoursMessage(),
      pushName,
      phone
    );
  }
  broadcastDashboard("conversations");
}

type ResolvedContent =
  | { kind: "text"; text: string }
  | { kind: "image"; text: string; mediaPath: string }
  | { kind: "blocked"; logLabel: string; reply: string };

function isImageDocument(
  mimeType: string | null | undefined,
  fileName: string | null | undefined
): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  const name = (fileName ?? "").toLowerCase();
  return (
    mime.startsWith("image/jpeg") ||
    mime.startsWith("image/png") ||
    mime.startsWith("image/webp") ||
    /\.(jpe?g|png|webp)$/.test(name)
  );
}

async function resolveUserContent(
  sock: WASocket,
  msg: proto.IWebMessageInfo
): Promise<ResolvedContent | null> {
  const text =
    msg.message?.conversation || msg.message?.extendedTextMessage?.text;

  if (text) return { kind: "text", text };

  const document = msg.message?.documentMessage;
  if (document) {
    if (exceedsPortalFileLimit(document.fileLength)) {
      return {
        kind: "blocked",
        logLabel: "too-large",
        reply: FILE_TOO_LARGE_MESSAGE,
      };
    }
    const mime = document.mimetype ?? "";
    const fileName = document.fileName ?? "";

    if (isPdfDocument(mime, fileName)) {
      return {
        kind: "blocked",
        logLabel: "pdf",
        reply: BLOCKED_MEDIA_MESSAGES.pdf,
      };
    }

    if (isImageDocument(mime, fileName)) {
      try {
        const { text: imageText, filePath } = await extractIncomingImageText(
          sock,
          msg,
          document.caption
        );
        return { kind: "image", text: imageText, mediaPath: filePath };
      } catch (err) {
        botError("Imagen-documento rechazada", err);
        if (err instanceof IncomingMediaError && err.code === "too_large") {
          return {
            kind: "blocked",
            logLabel: "too-large",
            reply: FILE_TOO_LARGE_MESSAGE,
          };
        }
        return {
          kind: "blocked",
          logLabel: "invalid-image",
          reply: BLOCKED_MEDIA_MESSAGES.invalidImage,
        };
      }
    }

    const blocked = isBlockedClientDocument(mime, fileName) ?? "document";
    return {
      kind: "blocked",
      logLabel: blocked,
      reply: BLOCKED_MEDIA_MESSAGES[blocked as BlockedMediaKind],
    };
  }

  if (
    msg.message?.audioMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.ptvMessage
  ) {
    return {
      kind: "blocked",
      logLabel: "unsupported",
      reply: BLOCKED_MEDIA_MESSAGES.unsupported,
    };
  }

  if (msg.message?.imageMessage) {
    if (exceedsPortalFileLimit(msg.message.imageMessage.fileLength)) {
      return {
        kind: "blocked",
        logLabel: "too-large",
        reply: FILE_TOO_LARGE_MESSAGE,
      };
    }
    try {
      const { text: imageText, filePath } = await extractIncomingImageText(
        sock,
        msg,
        msg.message.imageMessage.caption
      );
      return { kind: "image", text: imageText, mediaPath: filePath };
    } catch (err) {
      if (err instanceof IncomingMediaError && err.code === "too_large") {
        return {
          kind: "blocked",
          logLabel: "too-large",
          reply: FILE_TOO_LARGE_MESSAGE,
        };
      }
      if (err instanceof IncomingMediaError) {
        botError(`Imagen rechazada (${err.code})`, err);
      } else {
        botError("Imagen rechazada", err);
      }
      return {
        kind: "blocked",
        logLabel: "invalid-image",
        reply: BLOCKED_MEDIA_MESSAGES.invalidImage,
      };
    }
  }

  return null;
}

function getCombinedText(payload: PendingReplyPayload): string {
  return payload.texts.join("\n");
}

function getLastText(payload: PendingReplyPayload): string {
  return payload.texts[payload.texts.length - 1] ?? "";
}

function resolveConversationResidente(conversationId: number): Residente | null {
  const convo = getConversationById(conversationId);
  if (!convo?.residente_id) return null;
  return getResidente(convo.residente_id);
}

function resolveConversationCondominio(conversationId: number): {
  condominioId: number;
  condominioName: string;
} | null {
  const residente = resolveConversationResidente(conversationId);
  if (!residente) return null;
  const condo = getCondominio(residente.condominio_id);
  return {
    condominioId: residente.condominio_id,
    condominioName: condo?.name ?? residente.condominio_name ?? "el condominio",
  };
}

function shouldTreatAsNewQuestion(
  conversationId: number,
  text: string,
  category?: string | null
): boolean {
  if (looksLikeQuestion(text)) return true;

  const condo = resolveConversationCondominio(conversationId);
  if (!condo) return false;

  const tags = getConversationTags(conversationId);
  const history = getRecentHistory(conversationId, 20);
  const recentUserMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const searchQuery = buildEnrichedQuery(
    text,
    category,
    tags,
    recentUserMessages
  );
  if (assessReglamentoMatch(searchQuery, condo.condominioId).level !== "none") {
    return true;
  }
  return false;
}

async function answerWithKnowledge(
  sock: WaTransport,
  remoteJid: string,
  conversationId: number,
  text: string,
  pushName: string | null,
  phone: string,
  searchOverride?: string
): Promise<void> {
  const convo = getConversationById(conversationId);
  if (!convo) return;

  if (isPromptManipulationAttempt(text)) {
    await sendBotReply(
      sock,
      remoteJid,
      conversationId,
      PROMPT_GUARD_REJECTION,
      pushName,
      phone
    );
    return;
  }

  const history = getRecentHistory(conversationId, 20);
  const recentUserMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const tags = getConversationTags(conversationId);
  const searchQuery = buildEnrichedQuery(
    searchOverride ?? text,
    convo.category,
    tags,
    recentUserMessages
  );

  const condo = resolveConversationCondominio(conversationId);
  if (!condo) {
    await sendBotReply(sock, remoteJid, conversationId, HANDOFF_OFFER, pushName, phone);
    setAwaitingHandoff(conversationId, true);
    return;
  }

  await setComposing(sock, remoteJid, true);
  const { reply, indexedSources } = await generateReply(history, {
    searchQuery,
    condominioId: condo.condominioId,
    condominioName: condo.condominioName,
    category: convo.category,
    tags,
  });

  if (isNoAnswerReply(reply)) {
    await sendBotReply(sock, remoteJid, conversationId, HANDOFF_OFFER, pushName, phone);
    setAwaitingHandoff(conversationId, true);
    return;
  }

  if (indexedSources.length > 0) {
    recordReglamentoHit(conversationId, indexedSources[0]);
    applyCategoryFromIndexedAnswer(conversationId, "reglamento");
  }

  const convoForName = getConversationById(conversationId);
  const personalizedReply = prependOpenerIfNeeded(reply, {
    displayName: convoForName?.name ?? null,
    pushName,
    shouldGreet: shouldIncludePersonalizedGreeting(conversationId),
  });

  await sendBotReply(
    sock,
    remoteJid,
    conversationId,
    personalizedReply,
    pushName,
    phone,
    { prependFiller: true, skipPersonalization: true }
  );
}

function saveContactPhone(
  conversationId: number,
  contactPhone: string | null
): void {
  if (contactPhone) {
    updateConversationContact(conversationId, { contactPhone });
  }
}

function collectVerificationMessages(conversationId: number): string[] {
  return getRecentHistory(conversationId, 12)
    .filter((message) => message.role === "user")
    .map((message) => message.content);
}

async function handleIdentityVerification(params: {
  sock: WaTransport;
  remoteJid: string;
  conversation: NonNullable<ReturnType<typeof getConversationById>>;
  text: string;
  pushName: string | null;
  phone: string;
  contactPhone: string | null;
}): Promise<boolean> {
  const { sock, remoteJid, conversation, text, pushName, phone, contactPhone } =
    params;

  if (conversation.awaiting_sender_name) {
    const senderName = parseSenderName(text);
    if (!senderName) {
      await sendBotReply(
        sock,
        remoteJid,
        conversation.id,
        SENDER_NAME_INVALID_MESSAGE,
        pushName,
        phone,
        { skipPersonalization: true }
      );
      return true;
    }

    setSenderName(conversation.id, senderName);
    const firstName = extractFirstName(senderName) ?? senderName;
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      `Gracias, ${firstName}. ¿En qué puedo ayudarte?`,
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return true;
  }

  if (isFullyIdentified(conversation, contactPhone)) {
    return false;
  }

  // Teléfono ya registrado (propietario o contacto): bienvenida personalizada.
  if (!isIdentityVerified(conversation) && contactPhone) {
    const properties = listPropertiesForCallerPhone(contactPhone);
    const knownMatches = resolveKnownCallerMatches(contactPhone);

    if (properties.length === 1 && knownMatches.length >= 1) {
      const known = knownMatches.find(
        (m) => m.residente.id === properties[0]!.id
      ) ?? {
        ...knownMatches[0]!,
        residente: properties[0]!,
      };
      const pendingKnown = getPendingVerificacion(conversation.id);
      if (pendingKnown) {
        updateVerificacion(pendingKnown.id, "verified", known.residente.id);
      } else {
        const verifId = createVerificacion(
          conversation.id,
          known.residente.id
        );
        updateVerificacion(verifId, "verified", known.residente.id);
      }

      setIdentityVerified(
        conversation.id,
        known.residente.id,
        known.residente.nombre
      );

      const welcomeName =
        known.displayName?.trim() || known.residente.nombre || null;

      if (known.role !== "owner") {
        if (welcomeName) {
          setSenderName(conversation.id, welcomeName);
        } else {
          setAwaitingSenderName(conversation.id);
        }
      }

      const idleGreeting =
        isGreetingOnly(text) || shouldAskWhatTheyNeed(text);

      // Solo saludar en idle. Si trae solicitud/mensaje real, NO mandar
      // "Estoy revisando…" — el ticket-router / IA contestan con la respuesta final.
      if (idleGreeting) {
        await sendBotReply(
          sock,
          remoteJid,
          conversation.id,
          buildKnownCallerWelcome(welcomeName, { hasRequest: false }),
          pushName,
          phone,
          { skipPersonalization: true }
        );
        if (known.role !== "owner" && !welcomeName) {
          await sendBotReply(
            sock,
            remoteJid,
            conversation.id,
            SENDER_NAME_PROMPT,
            pushName,
            phone,
            { skipPersonalization: true }
          );
          return true;
        }
        setMenuSentAt(conversation.id);
        return true;
      }

      if (known.role !== "owner" && !welcomeName) {
        await sendBotReply(
          sock,
          remoteJid,
          conversation.id,
          SENDER_NAME_PROMPT,
          pushName,
          phone,
          { skipPersonalization: true }
        );
        return true;
      }

      setMenuSentAt(conversation.id);
      return false;
    }

    if (properties.length > 1 && knownMatches.length >= 1) {
      const primary = knownMatches[0]!;
      const welcomeName =
        primary.displayName?.trim() || primary.residente.nombre || null;

      const pendingKnown = getPendingVerificacion(conversation.id);
      if (pendingKnown) {
        updateVerificacion(pendingKnown.id, "verified");
      } else {
        createVerificacion(conversation.id);
      }

      // Identidad OK a nivel persona; falta elegir propiedad.
      setIdentityVerifiedPendingProperty(
        conversation.id,
        primary.residente.nombre
      );

      if (primary.role !== "owner" && welcomeName) {
        setSenderName(conversation.id, welcomeName);
      }

      const idleGreeting =
        isGreetingOnly(text) || shouldAskWhatTheyNeed(text);

      setMenuSentAt(conversation.id);

      // Saludo sin pregunta: bienvenida y espera (no pedir colonia aún).
      // Con solicitud real: sin filler "Estoy revisando…"; sigue al ticket-router/IA.
      if (idleGreeting) {
        await sendBotReply(
          sock,
          remoteJid,
          conversation.id,
          buildKnownCallerWelcome(welcomeName, { hasRequest: false }),
          pushName,
          phone,
          { skipPersonalization: true }
        );
        return true;
      }

      const mentioned = parsePropertyMentionInQuestion(text, properties);
      if (mentioned) {
        selectConversationProperty(conversation.id, mentioned);
        return false;
      }

      setAwaitingPropertyChoice(
        conversation.id,
        properties.map((p) => p.id)
      );
      await sendBotReply(
        sock,
        remoteJid,
        conversation.id,
        buildPropertyChoicePrompt(properties),
        pushName,
        phone,
        { skipPersonalization: true }
      );
      return true;
    }
  }

  if (isIdentityQuestion(text)) {
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      "Soy el asistente de ARC. Te ayudo con el reglamento de construcción y con los documentos de tu condominio.",
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return true;
  }

  // Identidad de persona OK pero aún sin propiedad elegida (multi-vivienda).
  if (
    isIdentityVerified(conversation) &&
    !conversation.residente_id &&
    !conversation.awaiting_sender_name
  ) {
    let properties = listPropertiesForCallerPhone(contactPhone);
    if (properties.length === 0 && conversation.name?.trim()) {
      const byName = findResidenteByNombre(conversation.name).filter(
        (r) => r.ocupacion !== "Vacante" && r.nombre !== "Vacante"
      );
      const merged = new Map<number, Residente>();
      for (const row of byName) {
        for (const sibling of findSiblingProperties(row)) {
          merged.set(sibling.id, sibling);
        }
      }
      properties = [...merged.values()];
    }

    if (properties.length > 1) {
      // Solo saludo / “necesito ayuda”: no pedir colonia hasta que haya pregunta.
      if (isGreetingOnly(text) || shouldAskWhatTheyNeed(text)) {
        await sendBotReply(
          sock,
          remoteJid,
          conversation.id,
          buildKnownCallerWelcome(
            conversation.sender_name ?? conversation.name,
            { hasRequest: false }
          ),
          pushName,
          phone,
          { skipPersonalization: true }
        );
        return true;
      }
      const mentionedPending = parsePropertyMentionInQuestion(text, properties);
      if (mentionedPending) {
        selectConversationProperty(conversation.id, mentionedPending);
        return false;
      }
      setAwaitingPropertyChoice(
        conversation.id,
        properties.map((p) => p.id)
      );
      await sendBotReply(
        sock,
        remoteJid,
        conversation.id,
        buildPropertyChoicePrompt(properties),
        pushName,
        phone,
        { skipPersonalization: true }
      );
      return true;
    }

    if (properties.length === 1) {
      selectConversationProperty(conversation.id, properties[0]!);
      return false;
    }
  }

  if (isIdentityVerified(conversation) && conversation.residente_id) {
    setAwaitingSenderName(conversation.id);
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      SENDER_NAME_PROMPT,
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return true;
  }

  const pending = getPendingVerificacion(conversation.id);

  if (!pending && isGreetingOnly(text)) {
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      buildGreetingOnlyResponse(conversation.name, pushName),
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return true;
  }

  if (!pending && shouldAskWhatTheyNeed(text)) {
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      buildHelpPromptResponse(conversation.name, pushName, text),
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return true;
  }

  const completeVerification = async (residente: Residente) => {
    if (pending) {
      updateVerificacion(pending.id, "verified", residente.id);
    } else {
      const verifId = createVerificacion(conversation.id, residente.id);
      updateVerificacion(verifId, "verified", residente.id);
    }

    setIdentityVerified(conversation.id, residente.id, residente.nombre);

    if (isRegisteredOwnerPhone(contactPhone, residente)) {
      const firstName = extractFirstName(residente.nombre) ?? residente.nombre;
      await sendBotReply(
        sock,
        remoteJid,
        conversation.id,
        `Identidad verificada. Bienvenido, ${firstName}. ¿En qué puedo ayudarte?`,
        pushName,
        phone,
        { skipPersonalization: true }
      );
      return;
    }

    setAwaitingSenderName(conversation.id);
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      SENDER_NAME_PROMPT,
      pushName,
      phone,
      { skipPersonalization: true }
    );
  };

  const completeVerificationWithProperties = async (
    properties: Residente[]
  ) => {
    if (properties.length === 1) {
      await completeVerification(properties[0]!);
      return;
    }

    if (pending) {
      updateVerificacion(pending.id, "verified");
    } else {
      createVerificacion(conversation.id);
    }

    setIdentityVerifiedPendingProperty(
      conversation.id,
      properties[0]!.nombre
    );
    setAwaitingPropertyChoice(
      conversation.id,
      properties.map((p) => p.id)
    );
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      `Identidad verificada. ${buildPropertyChoicePrompt(properties)}`,
      pushName,
      phone,
      { skipPersonalization: true }
    );
  };

  if (!pending) {
    createVerificacion(conversation.id);
    const firstName = extractDisplayFirstName(conversation.name, pushName);
    const nameGreet = firstName ? `Claro ${firstName}, con gusto te ayudo` : "Claro, con gusto te ayudo";
    const promptMessage = `${nameGreet}, pero para darte una respuesta personalizada necesito que me compartas los siguientes datos del propietario de la vivienda:\n\n1. Nombre completo (obligatorio)\n2. Número celular y/o correo electrónico registrado\n\nPor ejemplo:\nElizabeth Avalos\n8181818181\neli@gmail.com`;
    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      promptMessage,
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return true;
  }

  const verificationMessages = collectVerificationMessages(conversation.id);
  const fields = mergeVerificationFields(verificationMessages);

  if (hasCompleteVerificationFields(fields)) {
    const matches = matchResidentesIdentity(fields);
    const byId = new Map<number, Residente>();
    for (const match of matches) {
      for (const sibling of findSiblingProperties(match)) {
        byId.set(sibling.id, sibling);
      }
    }
    const properties = [...byId.values()];

    if (properties.length >= 1) {
      await completeVerificationWithProperties(properties);
      return true;
    }

    await sendBotReply(
      sock,
      remoteJid,
      conversation.id,
      IDENTITY_FAILURE_MESSAGE,
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return true;
  }

  await sendBotReply(
    sock,
    remoteJid,
    conversation.id,
    getMissingVerificationMessage(fields),
    pushName,
    phone,
    { skipPersonalization: true }
  );
  return true;
}

async function processPendingReply(payload: PendingReplyPayload): Promise<void> {
  const { sock, remoteJid, conversationId, pushName, phone, contactPhone } =
    payload;
  let text = getCombinedText(payload);
  const lastText = getLastText(payload);

  if (payload.blockedReply) {
    await sendBotReply(
      sock,
      remoteJid,
      conversationId,
      payload.blockedReply,
      pushName,
      phone
    );
    return;
  }

  let fresh = getConversationById(conversationId);
  if (!fresh) return;

  if (fresh.mode !== "AI") {
    await setComposing(sock, remoteJid, false);
    console.log(`[bot] Modo ${fresh.mode} — respuesta automática cancelada`);
    return;
  }

  saveContactPhone(conversationId, contactPhone);

  // Elección de colonia/vivienda (multi-propiedad).
  if (fresh.awaiting_property_choice) {
    const choices = getAwaitingPropertyChoices(fresh.id);
    const selected = parsePropertyChoice(text, choices);
    if (!selected || choices.length === 0) {
      const promptChoices =
        choices.length > 0
          ? choices
          : listPropertiesForCallerPhone(contactPhone);
      await sendBotReply(
        sock,
        remoteJid,
        fresh.id,
        promptChoices.length > 1
          ? buildPropertyChoicePrompt(promptChoices)
          : "Indica el número de la opción de colonia o vivienda, por favor.",
        pushName,
        phone,
        { skipPersonalization: true }
      );
      return;
    }

    selectConversationProperty(fresh.id, selected);
    clearAwaitingPropertyChoice(fresh.id);

    const pendingQuestion = getRecentHistory(fresh.id, 8)
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .reverse()
      .find(
        (content) =>
          content.trim() !== text.trim() &&
          !isGreetingOnly(content) &&
          !/^\s*[1-9]\d*\s*[.)]?\s*$/.test(content.trim())
      );

    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      `Perfecto, tomaré como referencia ${selected.condominio_name}${
        selected.num_coto ? ` · ${selected.num_coto}` : ""
      }.`,
      pushName,
      phone,
      { skipPersonalization: true }
    );

    if (!pendingQuestion) {
      await sendBotReply(
        sock,
        remoteJid,
        fresh.id,
        "¿En qué puedo ayudarte?",
        pushName,
        phone,
        { skipPersonalization: true }
      );
      return;
    }

    text = pendingQuestion;
    fresh = getConversationById(conversationId);
    if (!fresh) return;
  } else {
    const identityHandled = await handleIdentityVerification({
      sock,
      remoteJid,
      conversation: fresh,
      text,
      pushName,
      phone,
      contactPhone,
    });
    if (identityHandled) return;

    fresh = getConversationById(conversationId);
    if (!fresh) return;
  }

  // Ya sabemos la vivienda: en saludo solo bienvenida y esperar la pregunta.
  if (
    (isGreetingOnly(text) || shouldAskWhatTheyNeed(text)) &&
    isFullyIdentified(fresh, contactPhone)
  ) {
    const welcomeName =
      fresh.sender_name ??
      resolveKnownCallerMatches(contactPhone)[0]?.displayName ??
      fresh.name ??
      pushName;
    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      buildKnownCallerWelcome(welcomeName, { hasRequest: false }),
      pushName,
      phone,
      { skipPersonalization: true }
    );
    setMenuSentAt(fresh.id);
    return;
  }

  // #6: Enrutado hacia tickets activos (comentarios, cancelar/confirmar, archivos).
  // Se omite si hay estados de encuesta/handoff en curso para no interferir.
  if (!fresh.awaiting_survey && !fresh.awaiting_handoff) {
    const ticketHandled = await handleIncomingTicketMessage({
      transport: sock,
      jid: remoteJid,
      conversationId: fresh.id,
      // Usar MSISDN real (no el JID @lid) para encontrar tickets del cliente.
      contactPhone: contactPhone ?? phone,
      text,
    });
    if (ticketHandled) {
      await setComposing(sock, remoteJid, false);
      return;
    }
  }

  if (fresh.awaiting_survey) {
    setAwaitingSurvey(fresh.id, false);
    if (/^\s*[1-5]\s*$/.test(lastText)) {
      await sendBotReply(
        sock,
        remoteJid,
        fresh.id,
        "Ya no pedimos una calificación. Si tienes una duda de ARC o del reglamento de construcción, escríbela.",
        pushName,
        phone,
        { skipPersonalization: true }
      );
      return;
    }
    fresh = getConversationById(conversationId) ?? fresh;
  }

  const urgencyKeywords = getUrgencyKeywords();
  if (detectUrgency(text, urgencyKeywords)) {
    console.log("[bot] Urgencia detectada");
    setConversationPriority(fresh.id, "urgent");
    const tags = listTags();
    const queja = tags.find((t) => t.name === "Queja");
    if (queja) addConversationTag(fresh.id, queja.id);
    await transferToHuman(sock, remoteJid, fresh.id, pushName, phone, true);
    return;
  }

  if (fresh.awaiting_handoff) {
    if (isAffirmativeReply(lastText)) {
      await transferToHuman(sock, remoteJid, fresh.id, pushName, phone);
      return;
    }
    if (shouldTreatAsNewQuestion(fresh.id, text, fresh.category)) {
      setAwaitingHandoff(fresh.id, false);
    } else if (isNegativeReply(lastText)) {
      setAwaitingHandoff(fresh.id, false);
      await sendBotReply(
        sock,
        remoteJid,
        fresh.id,
        "Entendido. Cuando quieras, escribe tu pregunta y con gusto te ayudo.",
        pushName,
        phone
      );
      return;
    } else {
      await sendBotReply(
        sock,
        remoteJid,
        fresh.id,
        HANDOFF_REMINDER,
        pushName,
        phone
      );
      return;
    }
  }

  if (fresh.awaiting_topic_confirm) {
    if (isAffirmativeReply(lastText)) {
      clearAwaitingTopicConfirm(fresh.id);
      const topic = fresh.suggested_topic ?? text;
      await answerWithKnowledge(
        sock,
        remoteJid,
        fresh.id,
        text,
        pushName,
        phone,
        `${topic} ${text}`
      );
      return;
    }
    if (shouldTreatAsNewQuestion(fresh.id, text, fresh.category)) {
      clearAwaitingTopicConfirm(fresh.id);
    } else if (isNegativeReply(lastText)) {
      clearAwaitingTopicConfirm(fresh.id);
      await sendBotReply(
        sock,
        remoteJid,
        fresh.id,
        "Entendido. Cuando quieras, escribe tu pregunta y con gusto te ayudo.",
        pushName,
        phone
      );
      return;
    } else {
      await sendBotReply(
        sock,
        remoteJid,
        fresh.id,
        TOPIC_CONFIRM_REMINDER,
        pushName,
        phone
      );
      return;
    }
  }

  if (isMenuEnabled() && shouldShowMenu(fresh.id)) {
    setMenuSentAt(fresh.id);
    if (!looksLikeQuestion(text)) {
      const known = resolveKnownCallerMatches(contactPhone)[0];
      const welcomeName =
        known?.displayName ??
        fresh.sender_name ??
        fresh.name ??
        pushName;
      const welcome = buildWelcomeMessage(getWelcomeMessage(), welcomeName);
      await sendBotReply(sock, remoteJid, fresh.id, welcome, pushName, phone, {
        skipPersonalization: true,
      });
      return;
    }
  }

  if (isPromptManipulationAttempt(text)) {
    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      PROMPT_GUARD_REJECTION,
      pushName,
      phone,
      { displayName: fresh.name }
    );
    return;
  }

  if (isIdentityQuestion(text)) {
    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      "Soy el asistente de ARC. Te ayudo con el reglamento de construcción y con los documentos de tu condominio.",
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return;
  }

  if (isFarewellMessage(text, hasAssistantReplies(fresh.id))) {
    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      buildFarewellWithSurveyResponse(),
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return;
  }

  if (shouldAskWhatTheyNeed(text)) {
    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      buildHelpPromptResponse(fresh.name, pushName),
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return;
  }

  const propertiesForScope = listPropertiesForCallerPhone(contactPhone);
  const mentionedProperty = parsePropertyMentionInQuestion(
    text,
    propertiesForScope
  );
  if (mentionedProperty && propertiesForScope.length > 1) {
    selectConversationProperty(fresh.id, mentionedProperty);
    fresh = getConversationById(conversationId);
    if (!fresh) return;
  } else if (
    shouldPromptPropertyChoice(text, propertiesForScope, {
      propertyExplicitlyChosen: Boolean(fresh.property_explicitly_chosen),
    })
  ) {
    setAwaitingPropertyChoice(
      fresh.id,
      propertiesForScope.map((p) => p.id)
    );
    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      buildPropertyChoicePrompt(propertiesForScope),
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return;
  }

  const tags = getConversationTags(fresh.id);
  const history = getRecentHistory(fresh.id, 20);
  const recentUserMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.content);
  const searchQuery = buildEnrichedQuery(
    text,
    fresh.category,
    tags,
    recentUserMessages
  );

  const condo = resolveConversationCondominio(fresh.id);
  if (!condo) {
    await sendBotReply(sock, remoteJid, fresh.id, HANDOFF_OFFER, pushName, phone);
    setAwaitingHandoff(fresh.id, true);
    return;
  }

  const assessment = assessReglamentoMatch(searchQuery, condo.condominioId);

  if (assessment.level === "none") {
    await sendBotReply(sock, remoteJid, fresh.id, HANDOFF_OFFER, pushName, phone);
    setAwaitingHandoff(fresh.id, true);
    return;
  }

  if (assessment.level === "related") {
    const mainTopic = assessment.topics[0] ?? "este tema";
    setAwaitingTopicConfirm(fresh.id, mainTopic);
    await sendBotReply(
      sock,
      remoteJid,
      fresh.id,
      buildTopicSuggestionWithGreeting(assessment.topics, fresh.name, pushName),
      pushName,
      phone,
      { skipPersonalization: true }
    );
    return;
  }

  await answerWithKnowledge(sock, remoteJid, fresh.id, text, pushName, phone);
}

async function handleMessage(
  sock: WASocket,
  msg: proto.IWebMessageInfo,
  lineId: number
): Promise<void> {
  if (!msg.key || msg.key.fromMe) return;

  const resolved = await resolveContactPhone(sock, msg);
  if (!resolved) return;

  const { chatJid, contactPhone } = resolved;
  const remoteJid = chatJid;
  const transport = createBaileysTransport(sock, lineId);

  if (remoteJid.endsWith("@g.us")) return;

  const isDirectChat =
    remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid");
  if (!isDirectChat) return;

  const content = await resolveUserContent(sock, msg);
  if (!content) return;

  const phone = contactPhone ?? chatJid.replace(/@.+$/, "");
  const pushName = msg.pushName ?? null;

  if (content.kind === "blocked") {
    botLog(
      `← Adjunto bloqueado (${content.logLabel}) de ${pushName ?? maskPhone(phone)}`
    );
    const convo = getOrCreateConversation(
      chatJid,
      pushName,
      lineId,
      contactPhone
    );
    saveContactPhone(convo.id, contactPhone);
    insertMessage(
      convo.id,
      "user",
      `[Adjunto no permitido: ${content.logLabel}]`
    );
    broadcastDashboard("conversations");
    scheduleDebouncedReply({
      conversationId: convo.id,
      sock: transport,
      remoteJid,
      phone: chatJid,
      contactPhone,
      pushName,
      lineId,
      texts: [`[Adjunto no permitido: ${content.logLabel}]`],
      blockedReply: content.reply,
    });
    return;
  }

  const { text } = content;
  const isImage = content.kind === "image";
  const mediaPath = content.kind === "image" ? content.mediaPath : undefined;

  botLog(`← Mensaje de ${pushName ?? maskPhone(phone)}: ${maskText(text)}`);

  const convo = getOrCreateConversation(
    chatJid,
    pushName,
    lineId,
    contactPhone
  );
  saveContactPhone(convo.id, contactPhone);

  if (isImage && mediaPath) {
    insertMessageWithMedia(convo.id, "user", text, "image", mediaPath);
  } else {
    insertMessage(convo.id, "user", text);
  }

  broadcastDashboard("conversations");

  let fresh = getConversationById(convo.id);
  if (!fresh) return;

  if (fresh.closed_at) {
    reopenConversation(fresh.id);
    fresh = getConversationById(fresh.id);
    if (!fresh) return;
  }

  if (fresh.mode !== "AI") {
    console.log(`[bot] Modo ${fresh.mode} — no responde IA`);
    return;
  }

  scheduleDebouncedReply({
    conversationId: fresh.id,
    sock: transport,
    remoteJid,
    phone: chatJid,
    contactPhone,
    pushName,
    lineId,
    texts: [text],
  });
}

export async function processInactiveConversations(): Promise<void> {
  return;
}

export async function processExpiredSurveyConversations(): Promise<void> {
  return;
}

export async function sendSurveyToConversation(
  _sock: WaTransport,
  _conversationId: number,
  _phone: string
): Promise<void> {
  return;
}
