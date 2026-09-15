import db from "./db-connection";
import { detectTagFromMessage } from "./auto-category";
import {
  INACTIVITY_TIMEOUT_SECONDS,
  looksLikeAwaitingClientReply,
} from "./inactivity";
import { SURVEY_RESPONSE_TIMEOUT_SECONDS } from "./conversation-farewell";
import { getSearchTokens, normalizeQuery } from "./query-enrichment";
import { broadcastDashboard } from "./ws-notify";
import { getWaTicketState } from "./portal/wa-ticket-state";
import { ACTIVE_TICKET_STATUSES } from "./portal/types";

export type CloseReason = "inactivity" | "survey" | "manual";

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

export function initFeatureSchema(): void {
  const convCols = [
    ["assigned_to_user_id", "INTEGER"],
    ["priority", "TEXT NOT NULL DEFAULT 'normal'"],
    ["category", "TEXT"],
    ["handoff_summary", "TEXT"],
    ["handoff_at", "INTEGER"],
    ["awaiting_survey", "INTEGER NOT NULL DEFAULT 0"],
    ["closed_at", "INTEGER"],
    ["menu_sent_at", "INTEGER"],
    ["urgency_flag", "INTEGER NOT NULL DEFAULT 0"],
    ["sla_deadline", "INTEGER"],
    ["close_reason", "TEXT"],
    ["awaiting_topic_confirm", "INTEGER NOT NULL DEFAULT 0"],
    ["suggested_topic", "TEXT"],
    ["contact_phone", "TEXT"],
    ["residente_id", "INTEGER"],
    ["identity_verified_at", "INTEGER"],
    ["sender_name", "TEXT"],
    ["awaiting_sender_name", "INTEGER NOT NULL DEFAULT 0"],
    ["inactivity_farewell_sent_at", "INTEGER"],
    ["awaiting_property_choice", "INTEGER NOT NULL DEFAULT 0"],
    ["property_choice_ids", "TEXT"],
    ["property_explicitly_chosen", "INTEGER NOT NULL DEFAULT 0"],
  ] as const;

  for (const [col, def] of convCols) {
    if (!columnExists("conversations", col)) {
      try {
        db.exec(`ALTER TABLE conversations ADD COLUMN ${col} ${def}`);
      } catch {
        // Carrera entre workers de build / arranque
      }
    }
  }

  if (!columnExists("messages", "media_type")) {
    db.exec("ALTER TABLE messages ADD COLUMN media_type TEXT");
  }
  if (!columnExists("messages", "media_path")) {
    db.exec("ALTER TABLE messages ADD COLUMN media_path TEXT");
  }

  // admin_settings may not exist yet on a fresh DB (created by admin-settings.ts).
  // Only ALTER when the base table is already present.
  const adminSettingsExists = (
    db.prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'admin_settings'"
    ).get() as { ok: number } | undefined
  )?.ok;

  if (adminSettingsExists) {
    if (!columnExists("admin_settings", "welcome_message")) {
      db.exec(
        "ALTER TABLE admin_settings ADD COLUMN welcome_message TEXT NOT NULL DEFAULT ''"
      );
    }
    if (!columnExists("admin_settings", "menu_enabled")) {
      db.exec(
        "ALTER TABLE admin_settings ADD COLUMN menu_enabled INTEGER NOT NULL DEFAULT 1"
      );
    }
    if (!columnExists("admin_settings", "urgency_keywords")) {
      db.exec(
        `ALTER TABLE admin_settings ADD COLUMN urgency_keywords TEXT NOT NULL DEFAULT '["emergencia","fuga","robo","incendio","sin agua","ambulancia","urgente"]'`
      );
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS faq_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      keywords TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT NOT NULL DEFAULT '#6b7280',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS conversation_tags (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      author_user_id INTEGER,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS quick_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      details TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS satisfaction_surveys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS faq_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      faq_id INTEGER NOT NULL REFERENCES faq_items(id) ON DELETE CASCADE,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_surveys_conv ON satisfaction_surveys(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_faq_hits_faq ON faq_hits(faq_id, created_at);

    CREATE TABLE IF NOT EXISTS reglamento_hits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      source TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_reglamento_hits_created
      ON reglamento_hits(created_at);

    CREATE TABLE IF NOT EXISTS category_detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      tag_id INTEGER REFERENCES tags(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'auto',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_category_detections_cat
      ON category_detections(category, created_at);
  `);

  const tagCount = db.prepare("SELECT COUNT(*) as c FROM tags").get() as {
    c: number;
  };
  if (tagCount.c === 0) {
    const defaults = [
      ["Acceso", "#3b82f6"],
      ["Cuotas", "#22c55e"],
      ["Queja", "#ef4444"],
      ["Mantenimiento", "#f59e0b"],
      ["Reglamento", "#8b5cf6"],
    ];
    const ins = db.prepare("INSERT INTO tags (name, color) VALUES (?, ?)");
    for (const [name, color] of defaults) ins.run(name, color);
  }

  const qrCount = db.prepare("SELECT COUNT(*) as c FROM quick_replies").get() as {
    c: number;
  };
  if (qrCount.c === 0) {
    const replies = [
      ["Revisando tu caso", "Estamos revisando tu solicitud. Te responderemos en breve."],
      ["Horario de atención", "Nuestro horario de atención personalizada es de lunes a viernes 9am-6pm y sábados 10am-1pm."],
      ["Solicitar comprobante", "Por favor envía tu comprobante o evidencia para continuar con tu solicitud."],
    ];
    const ins = db.prepare(
      "INSERT INTO quick_replies (label, content, sort_order) VALUES (?, ?, ?)"
    );
    replies.forEach(([label, content], i) => ins.run(label, content, i));
  }
}

// --- FAQ ---
export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  keywords: string;
  active: boolean;
  sortOrder: number;
}

export function listFaqItems(): FaqItem[] {
  return (
    db
      .prepare(
        "SELECT id, question, answer, keywords, active, sort_order FROM faq_items ORDER BY sort_order, id"
      )
      .all() as {
      id: number;
      question: string;
      answer: string;
      keywords: string;
      active: number;
      sort_order: number;
    }[]
  ).map((r) => ({
    id: r.id,
    question: r.question,
    answer: r.answer,
    keywords: r.keywords,
    active: r.active === 1,
    sortOrder: r.sort_order,
  }));
}

export function createFaqItem(
  question: string,
  answer: string,
  keywords: string
): FaqItem {
  const result = db
    .prepare(
      "INSERT INTO faq_items (question, answer, keywords) VALUES (?, ?, ?)"
    )
    .run(question.trim(), answer.trim(), keywords.trim());
  return listFaqItems().find((f) => f.id === Number(result.lastInsertRowid))!;
}

export function deleteFaqItem(id: number): void {
  db.prepare("DELETE FROM faq_items WHERE id = ?").run(id);
}

export function searchFaq(query: string): FaqItem | null {
  const items = listFaqItems().filter((f) => f.active);
  const tokens = getSearchTokens(query);

  let best: { item: FaqItem; score: number } | null = null;

  for (const item of items) {
    const hay = normalizeQuery(`${item.question} ${item.keywords} ${item.answer}`);
    let score = 0;
    for (const token of tokens) {
      if (hay.includes(token)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score };
    }
  }

  return best?.item ?? null;
}

export function recordFaqHit(faqId: number, conversationId: number): void {
  db.prepare(
    "INSERT INTO faq_hits (faq_id, conversation_id) VALUES (?, ?)"
  ).run(faqId, conversationId);
  broadcastDashboard("metrics");
}

export function recordReglamentoHit(
  conversationId: number,
  source?: string | null
): void {
  db.prepare(
    "INSERT INTO reglamento_hits (conversation_id, source) VALUES (?, ?)"
  ).run(conversationId, source ?? null);
  broadcastDashboard("metrics");
}

// --- Tags ---
export interface Tag {
  id: number;
  name: string;
  color: string;
}

export function listTags(): Tag[] {
  return db
    .prepare("SELECT id, name, color FROM tags ORDER BY name")
    .all() as Tag[];
}

export function createTag(name: string, color: string): Tag {
  const result = db
    .prepare("INSERT INTO tags (name, color) VALUES (?, ?)")
    .run(name.trim(), color);
  return db
    .prepare("SELECT id, name, color FROM tags WHERE id = ?")
    .get(result.lastInsertRowid) as Tag;
}

export function deleteTag(id: number): void {
  db.prepare("DELETE FROM conversation_tags WHERE tag_id = ?").run(id);
  db.prepare("DELETE FROM tags WHERE id = ?").run(id);
}

export function getConversationTags(conversationId: number): Tag[] {
  return db
    .prepare(
      `SELECT t.id, t.name, t.color FROM tags t
       JOIN conversation_tags ct ON ct.tag_id = t.id
       WHERE ct.conversation_id = ? ORDER BY t.name`
    )
    .all(conversationId) as Tag[];
}

export function setConversationTags(
  conversationId: number,
  tagIds: number[]
): void {
  db.prepare("DELETE FROM conversation_tags WHERE conversation_id = ?").run(
    conversationId
  );
  const ins = db.prepare(
    "INSERT INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)"
  );
  for (const tagId of tagIds) ins.run(conversationId, tagId);
}

export function addConversationTag(
  conversationId: number,
  tagId: number
): void {
  db.prepare(
    "INSERT OR IGNORE INTO conversation_tags (conversation_id, tag_id) VALUES (?, ?)"
  ).run(conversationId, tagId);
}

export function removeConversationTag(
  conversationId: number,
  tagId: number
): void {
  db.prepare(
    "DELETE FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?"
  ).run(conversationId, tagId);
  broadcastDashboard("conversations");
}

export function updateConversationContact(
  conversationId: number,
  data: {
    contactPhone?: string | null;
    residenteId?: number | null;
    name?: string | null;
  }
): void {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (data.contactPhone !== undefined) {
    sets.push("contact_phone = ?");
    params.push(data.contactPhone);
  }
  if (data.residenteId !== undefined) {
    sets.push("residente_id = ?");
    params.push(data.residenteId);
  }
  if (data.name !== undefined) {
    sets.push("name = ?");
    params.push(data.name);
  }
  if (sets.length === 0) return;

  params.push(conversationId);
  db.prepare(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params
  );
}

// --- Notes ---
export interface ConversationNote {
  id: number;
  conversationId: number;
  authorUserId: number | null;
  authorName: string;
  content: string;
  createdAt: number;
}

export function listNotes(conversationId: number): ConversationNote[] {
  return (
    db
      .prepare(
        `SELECT id, conversation_id, author_user_id, author_name, content, created_at
         FROM conversation_notes WHERE conversation_id = ? ORDER BY created_at DESC`
      )
      .all(conversationId) as {
      id: number;
      conversation_id: number;
      author_user_id: number | null;
      author_name: string;
      content: string;
      created_at: number;
    }[]
  ).map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    authorUserId: r.author_user_id,
    authorName: r.author_name,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export function addNote(
  conversationId: number,
  authorUserId: number | null,
  authorName: string,
  content: string
): ConversationNote {
  const result = db
    .prepare(
      `INSERT INTO conversation_notes (conversation_id, author_user_id, author_name, content)
       VALUES (?, ?, ?, ?)`
    )
    .run(conversationId, authorUserId, authorName, content.trim());
  return listNotes(conversationId).find((n) => n.id === Number(result.lastInsertRowid))!;
}

// --- Quick replies ---
export interface QuickReply {
  id: number;
  label: string;
  content: string;
  sortOrder: number;
}

export function listQuickReplies(): QuickReply[] {
  return (
    db
      .prepare(
        "SELECT id, label, content, sort_order FROM quick_replies ORDER BY sort_order, id"
      )
      .all() as {
      id: number;
      label: string;
      content: string;
      sort_order: number;
    }[]
  ).map((r) => ({
    id: r.id,
    label: r.label,
    content: r.content,
    sortOrder: r.sort_order,
  }));
}

export function createQuickReply(label: string, content: string): QuickReply {
  const result = db
    .prepare("INSERT INTO quick_replies (label, content) VALUES (?, ?)")
    .run(label.trim(), content.trim());
  return listQuickReplies().find((q) => q.id === Number(result.lastInsertRowid))!;
}

export function deleteQuickReply(id: number): void {
  db.prepare("DELETE FROM quick_replies WHERE id = ?").run(id);
}

// --- Conversation extensions ---
export function assignConversation(
  conversationId: number,
  userId: number | null
): void {
  db.prepare(
    "UPDATE conversations SET assigned_to_user_id = ? WHERE id = ?"
  ).run(userId, conversationId);
  broadcastDashboard("conversations");
}

export function setConversationCategory(
  conversationId: number,
  category: string
): void {
  db.prepare("UPDATE conversations SET category = ? WHERE id = ?").run(
    category,
    conversationId
  );
  broadcastDashboard("conversations");
}

export function recordCategoryDetection(
  conversationId: number,
  category: string,
  tagId: number | null,
  source: "auto" | "menu" | "manual" | "answer" = "auto"
): void {
  db.prepare(
    `INSERT INTO category_detections (conversation_id, category, tag_id, source)
     VALUES (?, ?, ?, ?)`
  ).run(conversationId, category, tagId, source);
  broadcastDashboard("metrics");
}

export function applyAutoCategory(
  conversationId: number,
  text: string
): string | null {
  const tags = listTags();
  const match = detectTagFromMessage(text, tags);
  if (!match) return null;

  setConversationCategory(conversationId, match.name);

  const existing = db
    .prepare(
      "SELECT 1 FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?"
    )
    .get(conversationId, match.id);
  if (!existing) {
    addConversationTag(conversationId, match.id);
  }

  recordCategoryDetection(conversationId, match.name, match.id, "auto");
  return match.name;
}

/** Categoriza el chat según una respuesta entregada con información indexada. */
export function applyCategoryFromIndexedAnswer(
  conversationId: number,
  kind: "reglamento" | "faq" | "servicio" | "tag" | "cuenta"
): void {
  const categoryName =
    kind === "faq"
      ? "FAQ"
      : kind === "servicio"
        ? "Servicios"
        : kind === "tag"
          ? "TAG Vehicular"
          : kind === "cuenta"
            ? "Estado de cuenta"
            : "Reglamento";
  setConversationCategory(conversationId, categoryName);

  const tags = listTags();
  const reglamentoTag = tags.find((t) => t.name === "Reglamento");
  if (reglamentoTag) {
    addConversationTag(conversationId, reglamentoTag.id);
  }

  const urgency = db
    .prepare("SELECT urgency_flag FROM conversations WHERE id = ?")
    .get(conversationId) as { urgency_flag: number } | undefined;
  if (urgency && !urgency.urgency_flag) {
    const quejaTag = tags.find((t) => t.name === "Queja");
    if (quejaTag) removeConversationTag(conversationId, quejaTag.id);
  }

  recordCategoryDetection(
    conversationId,
    categoryName,
    reglamentoTag?.id ?? null,
    "answer"
  );
}

export function setConversationPriority(
  conversationId: number,
  priority: "normal" | "urgent"
): void {
  db.prepare("UPDATE conversations SET priority = ?, urgency_flag = ? WHERE id = ?").run(
    priority,
    priority === "urgent" ? 1 : 0,
    conversationId
  );
  broadcastDashboard("conversations");
}

export function setHandoffSummary(
  conversationId: number,
  summary: string
): void {
  db.prepare(
    "UPDATE conversations SET handoff_summary = ?, handoff_at = unixepoch() WHERE id = ?"
  ).run(summary, conversationId);
  broadcastDashboard("conversations");
}

export function clearHandoffSummary(conversationId: number): void {
  db.prepare(
    "UPDATE conversations SET handoff_summary = NULL, handoff_at = NULL WHERE id = ?"
  ).run(conversationId);
  broadcastDashboard("conversations");
}

export function setSlaDeadline(conversationId: number, minutes = 10): void {
  db.prepare(
    "UPDATE conversations SET sla_deadline = unixepoch() + ? WHERE id = ?"
  ).run(minutes * 60, conversationId);
}

export function setAwaitingSurvey(conversationId: number, awaiting: boolean): void {
  db.prepare("UPDATE conversations SET awaiting_survey = ? WHERE id = ?").run(
    awaiting ? 1 : 0,
    conversationId
  );
}

export function markInactivityFarewellSent(conversationId: number): void {
  db.prepare(
    "UPDATE conversations SET inactivity_farewell_sent_at = unixepoch() WHERE id = ?"
  ).run(conversationId);
}

export function closeConversation(
  conversationId: number,
  reason?: CloseReason
): void {
  db.prepare(
    `UPDATE conversations SET
      closed_at = unixepoch(),
      awaiting_survey = 0,
      close_reason = ?,
      handoff_summary = NULL,
      handoff_at = NULL,
      human_requested = 0
     WHERE id = ?`
  ).run(reason ?? null, conversationId);
  broadcastDashboard("conversations");
  broadcastDashboard("metrics");
}

export function reopenConversation(conversationId: number): void {
  db.prepare(
    `UPDATE conversations SET
      closed_at = NULL,
      close_reason = NULL,
      menu_sent_at = NULL,
      awaiting_handoff = 0,
      awaiting_survey = 0,
      awaiting_topic_confirm = 0,
      suggested_topic = NULL,
      inactivity_farewell_sent_at = NULL,
      awaiting_property_choice = 0,
      property_choice_ids = NULL,
      property_explicitly_chosen = 0
     WHERE id = ?`
  ).run(conversationId);
  broadcastDashboard("conversations");
}

export function setAwaitingTopicConfirm(
  conversationId: number,
  topic: string
): void {
  db.prepare(
    `UPDATE conversations SET awaiting_topic_confirm = 1, suggested_topic = ?
     WHERE id = ?`
  ).run(topic, conversationId);
}

export function clearAwaitingTopicConfirm(conversationId: number): void {
  db.prepare(
    `UPDATE conversations SET awaiting_topic_confirm = 0, suggested_topic = NULL
     WHERE id = ?`
  ).run(conversationId);
}

function last10Digits(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** Ticket activo del contacto que aún espera respuesta del cliente. */
function hasTicketAwaitingClientReply(
  phone: string,
  contactPhone: string | null
): boolean {
  const targets = new Set(
    [last10Digits(phone), last10Digits(contactPhone)].filter(
      (v): v is string => Boolean(v)
    )
  );
  if (targets.size === 0) return false;

  try {
    const placeholders = ACTIVE_TICKET_STATUSES.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT u.phone AS client_phone
         FROM tickets t
         JOIN portal_users u ON u.id = t.portal_user_id
         WHERE t.deleted_at IS NULL
           AND IFNULL(t.awaiting_kind, 'none') != 'none'
           AND t.status IN (${placeholders})`
      )
      .all(...ACTIVE_TICKET_STATUSES) as { client_phone: string | null }[];

    return rows.some((row) => {
      const client = last10Digits(row.client_phone);
      return client != null && targets.has(client);
    });
  } catch {
    // Esquema portal aún no inicializado en este proceso
    return false;
  }
}

function conversationExpectsClientReply(row: {
  id: number;
  phone: string;
  contact_phone: string | null;
  awaiting_handoff: number;
  awaiting_sender_name: number;
  awaiting_property_choice: number;
  awaiting_topic_confirm: number;
}): boolean {
  if (
    row.awaiting_handoff ||
    row.awaiting_sender_name ||
    row.awaiting_property_choice ||
    row.awaiting_topic_confirm
  ) {
    return true;
  }

  if (getWaTicketState(row.id)) return true;
  if (hasTicketAwaitingClientReply(row.phone, row.contact_phone)) return true;

  // Solo si el último mensaje es del bot y pide una respuesta (p. ej. «¿En qué te apoyo?»).
  // Tras un acuse tipo «Recibí tu archivo. ¡Gracias!» NO se cierra por inactividad.
  const last = db
    .prepare(
      `SELECT role, content FROM messages
       WHERE conversation_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(row.id) as { role: string; content: string } | undefined;

  if (!last || last.role !== "assistant") return false;
  return looksLikeAwaitingClientReply(last.content ?? "");
}

/**
 * Conversaciones en modo IA inactivas donde el bot SÍ está esperando
 * una respuesta del cliente. Tras un mensaje final (gracias / acuse) no aplica.
 */
export function getInactiveConversations(): {
  id: number;
  phone: string;
  line_id: number;
}[] {
  const cutoff = Math.floor(Date.now() / 1000) - INACTIVITY_TIMEOUT_SECONDS;
  const candidates = db
    .prepare(
      `SELECT id, phone, line_id, contact_phone,
              awaiting_handoff, awaiting_sender_name,
              awaiting_property_choice, awaiting_topic_confirm
       FROM conversations
       WHERE closed_at IS NULL
         AND mode = 'AI'
         AND awaiting_survey = 0
         AND human_requested = 0
         AND inactivity_farewell_sent_at IS NULL
         AND last_message_at IS NOT NULL
         AND last_message_at < ?`
    )
    .all(cutoff) as {
    id: number;
    phone: string;
    line_id: number;
    contact_phone: string | null;
    awaiting_handoff: number;
    awaiting_sender_name: number;
    awaiting_property_choice: number;
    awaiting_topic_confirm: number;
  }[];

  return candidates
    .filter((row) => conversationExpectsClientReply(row))
    .map(({ id, phone, line_id }) => ({ id, phone, line_id }));
}

export function getExpiredSurveyConversations(): {
  id: number;
  phone: string;
  line_id: number;
}[] {
  const cutoff = Math.floor(Date.now() / 1000) - SURVEY_RESPONSE_TIMEOUT_SECONDS;
  return db
    .prepare(
      `SELECT id, phone, line_id FROM conversations
       WHERE closed_at IS NULL
         AND awaiting_survey = 1
         AND last_message_at IS NOT NULL
         AND last_message_at < ?`
    )
    .all(cutoff) as { id: number; phone: string; line_id: number }[];
}

export function setMenuSentAt(conversationId: number): void {
  db.prepare("UPDATE conversations SET menu_sent_at = unixepoch() WHERE id = ?").run(
    conversationId
  );
}

export function shouldShowMenu(conversationId: number): boolean {
  const row = db
    .prepare("SELECT menu_sent_at FROM conversations WHERE id = ?")
    .get(conversationId) as { menu_sent_at: number | null } | undefined;

  if (!row) return true;
  return row.menu_sent_at == null;
}

export function saveSurvey(conversationId: number, rating: number): void {
  db.prepare(
    "INSERT INTO satisfaction_surveys (conversation_id, rating) VALUES (?, ?)"
  ).run(conversationId, rating);
  closeConversation(conversationId, "survey");
}

export function insertMessageWithMedia(
  conversationId: number,
  role: "user" | "assistant" | "human",
  content: string,
  mediaType?: string,
  mediaPath?: string
): number {
  const result = db
    .prepare(
      `INSERT INTO messages (conversation_id, role, content, media_type, media_path)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(conversationId, role, content, mediaType ?? null, mediaPath ?? null);

  db.prepare(
    "UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?"
  ).run(conversationId);

  broadcastDashboard("messages", { conversationId });
  return Number(result.lastInsertRowid);
}

export function getUrgencyKeywords(): string[] {
  const row = db
    .prepare("SELECT urgency_keywords FROM admin_settings WHERE id = 1")
    .get() as { urgency_keywords: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.urgency_keywords) as string[];
  } catch {
    return [];
  }
}

export function getWelcomeMessage(): string {
  const row = db
    .prepare("SELECT welcome_message, menu_enabled FROM admin_settings WHERE id = 1")
    .get() as { welcome_message: string; menu_enabled: number } | undefined;
  return row?.welcome_message?.trim() ?? "";
}

export function isMenuEnabled(): boolean {
  const row = db
    .prepare("SELECT menu_enabled FROM admin_settings WHERE id = 1")
    .get() as { menu_enabled: number } | undefined;
  return row?.menu_enabled !== 0;
}

export interface DashboardMetrics {
  totalConversations: number;
  openConversations: number;
  closedConversations: number;
  closedByInactivity: number;
  aiResolved: number;
  humanHandled: number;
  urgentOpen: number;
  awaitingHuman: number;
  avgSatisfaction: number | null;
  surveysCount: number;
  messagesToday: number;
  conversationsToday: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
  userMessages: number;
  assistantMessages: number;
  humanMessages: number;
  imagesReceived: number;
  handoffsTotal: number;
  handoffsToday: number;
  slaBreached: number;
  assignedActive: number;
  satisfactionDistribution: { rating: number; count: number }[];
  topCategories: { category: string; count: number }[];
  topTags: { name: string; color: string; count: number }[];
  topFaqs: { question: string; count: number }[];
  reglamentoHitsTotal: number;
  reglamentoHitsToday: number;
  indexedAnswersTotal: number;
  indexedAnswersToday: number;
  topReglamentoSources: { source: string; count: number }[];
  messagesLast7Days: { date: string; count: number }[];
  conversationsLast7Days: { date: string; count: number }[];
  closeReasonBreakdown: { reason: string; label: string; count: number }[];
  messageRoleBreakdown: { role: string; label: string; count: number }[];
  attentionBreakdown: { type: string; label: string; count: number }[];
}

export function getMetrics(lineId?: number): DashboardMetrics {
  const cWhere = lineId != null ? " WHERE line_id = ?" : "";
  const cAnd = lineId != null ? " AND line_id = ?" : "";
  const cP: number[] = lineId != null ? [lineId] : [];

  const mJoin =
    lineId != null
      ? " JOIN conversations c ON c.id = m.conversation_id"
      : "";
  const mAlias = lineId != null ? "m." : "";
  const mLine = lineId != null ? " AND c.line_id = ?" : "";

  const hitJoin =
    lineId != null
      ? " JOIN conversations c ON c.id = h.conversation_id"
      : "";
  const hitLine = lineId != null ? " AND c.line_id = ?" : "";

  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM conversations${cWhere}`)
      .get(...cP) as { c: number }
  ).c;

  const openConversations = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE closed_at IS NULL${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const closedConversations = total - openConversations;

  const closedByInactivity = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE close_reason = 'inactivity'${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const humanHandled = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations
         WHERE (mode = 'HUMAN' OR human_requested = 1)${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const aiResolved = Math.max(0, total - humanHandled);

  const urgentOpen = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations
         WHERE priority = 'urgent' AND closed_at IS NULL${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const awaitingHuman = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations
         WHERE human_requested = 1 AND closed_at IS NULL${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const surveyJoin =
    lineId != null
      ? " JOIN conversations c ON c.id = s.conversation_id"
      : "";
  const surveyLine = lineId != null ? " WHERE c.line_id = ?" : "";

  const surveyRow = db
    .prepare(
      `SELECT COUNT(*) as c, AVG(s.rating) as avg FROM satisfaction_surveys s${surveyJoin}${surveyLine}`
    )
    .get(...(lineId != null ? [lineId] : [])) as { c: number; avg: number | null };

  const startOfDay = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

  const messagesToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m${mJoin} WHERE ${mAlias}created_at >= ?${mLine}`
      )
      .get(startOfDay, ...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const conversationsToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE created_at >= ?${cAnd}`
      )
      .get(startOfDay, ...cP) as { c: number }
  ).c;

  const totalMessages = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m${mJoin}${lineId != null ? " WHERE c.line_id = ?" : ""}`
      )
      .get(...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const userMessages = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m${mJoin} WHERE ${mAlias}role = 'user'${mLine}`
      )
      .get(...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const assistantMessages = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m${mJoin} WHERE ${mAlias}role = 'assistant'${mLine}`
      )
      .get(...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const humanMessages = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m${mJoin} WHERE ${mAlias}role = 'human'${mLine}`
      )
      .get(...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const imagesReceived = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM messages m${mJoin}
         WHERE ${mAlias}media_type = 'image'${mLine}`
      )
      .get(...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const handoffsTotal = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE handoff_at IS NOT NULL${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const handoffsToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE handoff_at >= ?${cAnd}`
      )
      .get(startOfDay, ...cP) as { c: number }
  ).c;

  const slaBreached = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations
         WHERE human_requested = 1
           AND closed_at IS NULL
           AND sla_deadline IS NOT NULL
           AND sla_deadline < unixepoch()${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const assignedActive = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations
         WHERE assigned_to_user_id IS NOT NULL AND closed_at IS NULL${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const catJoin =
    lineId != null
      ? " JOIN conversations c ON c.id = cd.conversation_id"
      : "";
  const catLine = lineId != null ? " WHERE c.line_id = ?" : "";

  const topCategories = (
    db
      .prepare(
        `SELECT cd.category, COUNT(*) as count FROM category_detections cd${catJoin}${catLine}
         GROUP BY cd.category ORDER BY count DESC LIMIT 8`
      )
      .all(...(lineId != null ? [lineId] : [])) as { category: string; count: number }[]
  ).map((r) => ({ category: r.category, count: r.count }));

  const satisfactionDistribution = (
    db
      .prepare(
        `SELECT s.rating, COUNT(*) as count FROM satisfaction_surveys s${surveyJoin}${surveyLine}
         GROUP BY s.rating ORDER BY s.rating`
      )
      .all(...(lineId != null ? [lineId] : [])) as { rating: number; count: number }[]
  ).map((r) => ({ rating: r.rating, count: r.count }));

  const tagJoin =
    lineId != null
      ? " JOIN conversations c ON c.id = ct.conversation_id"
      : "";
  const tagLine = lineId != null ? " WHERE c.line_id = ?" : "";

  const topTags = (
    db
      .prepare(
        `SELECT t.name, t.color, COUNT(*) as count
         FROM conversation_tags ct
         JOIN tags t ON t.id = ct.tag_id${tagJoin}${tagLine}
         GROUP BY t.id ORDER BY count DESC LIMIT 8`
      )
      .all(...(lineId != null ? [lineId] : [])) as { name: string; color: string; count: number }[]
  ).map((r) => ({ name: r.name, color: r.color, count: r.count }));

  const topFaqs = (
    db
      .prepare(
        `SELECT f.question, COUNT(*) as count
         FROM faq_hits h
         JOIN faq_items f ON f.id = h.faq_id${hitJoin}${lineId != null ? " WHERE c.line_id = ?" : ""}
         GROUP BY f.id ORDER BY count DESC LIMIT 8`
      )
      .all(...(lineId != null ? [lineId] : [])) as { question: string; count: number }[]
  ).map((r) => ({ question: r.question, count: r.count }));

  const reglamentoHitsTotal = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM reglamento_hits h${hitJoin}${lineId != null ? " WHERE c.line_id = ?" : ""}`
      )
      .get(...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const reglamentoHitsToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM reglamento_hits h${hitJoin} WHERE h.created_at >= ?${hitLine}`
      )
      .get(startOfDay, ...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const faqHitsTotal = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM faq_hits h${hitJoin}${lineId != null ? " WHERE c.line_id = ?" : ""}`
      )
      .get(...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const faqHitsToday = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM faq_hits h${hitJoin} WHERE h.created_at >= ?${hitLine}`
      )
      .get(startOfDay, ...(lineId != null ? [lineId] : [])) as { c: number }
  ).c;

  const indexedAnswersTotal = reglamentoHitsTotal + faqHitsTotal;
  const indexedAnswersToday = reglamentoHitsToday + faqHitsToday;

  const topReglamentoSources = (
    db
      .prepare(
        `SELECT COALESCE(h.source, 'Sin fuente') as source, COUNT(*) as count
         FROM reglamento_hits h${hitJoin}${lineId != null ? " WHERE c.line_id = ?" : ""}
         GROUP BY h.source ORDER BY count DESC LIMIT 8`
      )
      .all(...(lineId != null ? [lineId] : [])) as { source: string; count: number }[]
  ).map((r) => ({ source: r.source, count: r.count }));

  const closedBySurvey = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE close_reason = 'survey'${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const closedManual = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM conversations WHERE close_reason = 'manual'${cAnd}`
      )
      .get(...cP) as { c: number }
  ).c;

  const closeReasonBreakdown = [
    { reason: "open", label: "Abiertas", count: openConversations },
    { reason: "inactivity", label: "Inactividad", count: closedByInactivity },
    { reason: "survey", label: "Encuesta", count: closedBySurvey },
    {
      reason: "other",
      label: "Otras cerradas",
      count: Math.max(
        0,
        closedConversations - closedByInactivity - closedBySurvey - closedManual
      ),
    },
  ].filter((r) => r.count > 0);

  const messageRoleBreakdown = [
    { role: "user", label: "Residente", count: userMessages },
    { role: "assistant", label: "Bot (IA)", count: assistantMessages },
    { role: "human", label: "Operador", count: humanMessages },
  ].filter((r) => r.count > 0);

  const attentionBreakdown = [
    { type: "ai", label: "Atendidas por IA", count: aiResolved },
    { type: "human", label: "Con humano", count: humanHandled },
  ].filter((r) => r.count > 0);

  const messagesLast7Days: { date: string; count: number }[] = [];
  const conversationsLast7Days: { date: string; count: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const dayStart = Math.floor(day.getTime() / 1000);
    const dayEnd = dayStart + 86400;
    const label = day.toLocaleDateString("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });

    const msgCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM messages m${mJoin}
           WHERE ${mAlias}created_at >= ? AND ${mAlias}created_at < ?${mLine}`
        )
        .get(dayStart, dayEnd, ...(lineId != null ? [lineId] : [])) as {
          c: number;
        }
    ).c;

    const convCount = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM conversations
           WHERE created_at >= ? AND created_at < ?${cAnd}`
        )
        .get(dayStart, dayEnd, ...cP) as { c: number }
    ).c;

    messagesLast7Days.push({ date: label, count: msgCount });
    conversationsLast7Days.push({ date: label, count: convCount });
  }

  return {
    totalConversations: total,
    openConversations,
    closedConversations,
    closedByInactivity,
    aiResolved,
    humanHandled,
    urgentOpen,
    awaitingHuman,
    avgSatisfaction: surveyRow.avg,
    surveysCount: surveyRow.c,
    messagesToday,
    conversationsToday,
    totalMessages,
    avgMessagesPerConversation:
      total > 0 ? Math.round((totalMessages / total) * 10) / 10 : 0,
    userMessages,
    assistantMessages,
    humanMessages,
    imagesReceived,
    handoffsTotal,
    handoffsToday,
    slaBreached,
    assignedActive,
    satisfactionDistribution,
    topCategories,
    topTags,
    topFaqs,
    reglamentoHitsTotal,
    reglamentoHitsToday,
    indexedAnswersTotal,
    indexedAnswersToday,
    topReglamentoSources,
    messagesLast7Days,
    conversationsLast7Days,
    closeReasonBreakdown,
    messageRoleBreakdown,
    attentionBreakdown,
  };
}

import "./residentes";
