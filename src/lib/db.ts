import { broadcastDashboard } from "./ws-notify";
import db from "./db-connection";
import { initCrmSchema } from "./crm/schema";
import { findResidenteByCelular, getResidente } from "./residentes";
import {
  findSiblingProperties,
  listPropertiesForCallerPhone,
} from "./property-choice";

export type ConversationResidenteProperty = {
  id: number;
  condominio: string;
  num_vivienda: number | null;
  num_coto: string | null;
};

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return cols.some((c) => c.name === column);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI',
    last_message_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS connection_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT CHECK(status IN ('disconnected','qr','connecting','connected'))
      NOT NULL DEFAULT 'disconnected',
    qr_string TEXT,
    phone TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  INSERT OR IGNORE INTO connection_state (id, status) VALUES (1, 'disconnected');

  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    content TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON outbox(sent, created_at);
`);

migrateConversationsTable();

function migrateConversationsTable(): void {
  const columns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as { name: string }[];

  const names = new Set(columns.map((column) => column.name));

  if (!names.has("awaiting_handoff")) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN awaiting_handoff INTEGER NOT NULL DEFAULT 0"
    );
  }

  if (!names.has("human_requested")) {
    db.exec(
      "ALTER TABLE conversations ADD COLUMN human_requested INTEGER NOT NULL DEFAULT 0"
    );
  }
}

// --- Tipos ---

export interface WaLine {
  id: number;
  name: string;
  status: "disconnected" | "qr" | "connecting" | "connected";
  qr_string: string | null;
  phone: string | null;
  sort_order: number;
  updated_at: number;
  /** baileys (QR) | meta (Cloud API) */
  provider: "baileys" | "meta";
  meta_phone_number_id: string | null;
}

export interface Conversation {
  id: number;
  line_id: number;
  phone: string;
  name: string | null;
  mode: "AI" | "HUMAN";
  awaiting_handoff: number;
  human_requested: number;
  assigned_to_user_id: number | null;
  priority: "normal" | "urgent";
  category: string | null;
  handoff_summary: string | null;
  handoff_at: number | null;
  awaiting_survey: number;
  closed_at: number | null;
  menu_sent_at: number | null;
  awaiting_topic_confirm: number;
  suggested_topic: string | null;
  urgency_flag: number;
  sla_deadline: number | null;
  last_message_at: number | null;
  created_at: number;
  contact_phone?: string | null;
  residente_id?: number | null;
  identity_verified_at?: number | null;
  sender_name?: string | null;
  awaiting_sender_name?: number;
  awaiting_property_choice?: number;
  property_choice_ids?: string | null;
  property_explicitly_chosen?: number;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "human";
  content: string;
  media_type: string | null;
  media_path: string | null;
  created_at: number;
}

export interface ConnectionState {
  status: "disconnected" | "qr" | "connecting" | "connected";
  qr_string: string | null;
  phone: string | null;
  updated_at: number;
}

export interface OutboxItem {
  id: number;
  conversation_id: number;
  line_id: number;
  phone: string;
  content: string;
  sent: number;
  created_at: number;
}

// --- Helpers ---

function updateConversationContactLocal(
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

/**
 * Extrae los últimos 10 dígitos de un teléfono/JID.
 * Para @lid el número LID no es el MSISDN: usar contactPhoneHint en su lugar.
 */
function last10Digits(input: string | null | undefined): string | null {
  if (!input) return null;
  // JIDs @lid no son números telefónicos reales — no usar sus dígitos como match.
  if (input.includes("@lid")) return null;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Busca una conversación existente por los últimos 10 dígitos del teléfono
 * (cubre formatos 52…, 521…, JID @s.whatsapp.net). No usa dígitos de @lid.
 */
export function findConversationByPhoneDigits(
  lineId: number,
  phoneDigits: string
): Conversation | null {
  const last10 = last10Digits(phoneDigits);
  if (!last10) return null;
  const like = `%${last10}%`;
  // Preferir conversaciones con phone = dígitos (canónicas) sobre @jid.
  return (
    (db
      .prepare(
        `SELECT * FROM conversations
         WHERE line_id = ?
           AND (
             phone LIKE ?
             OR IFNULL(contact_phone, '') LIKE ?
             OR replace(phone, '@s.whatsapp.net', '') LIKE ?
           )
         ORDER BY
           CASE WHEN phone LIKE '%@%' THEN 1 ELSE 0 END,
           id DESC
         LIMIT 1`
      )
      .get(lineId, like, like, like) as Conversation | undefined) ?? null
  );
}

/**
 * Fusiona mensajes/outbox/estado de una conversación duplicada hacia otra.
 * Útil cuando un @lid y un MSISDN 521… representan al mismo contacto.
 */
export function mergeConversations(
  keepId: number,
  dropId: number
): boolean {
  if (keepId === dropId) return false;
  const keep = getConversationById(keepId);
  const drop = getConversationById(dropId);
  if (!keep || !drop) return false;

  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE messages SET conversation_id = ? WHERE conversation_id = ?"
    ).run(keepId, dropId);
    db.prepare(
      "UPDATE outbox SET conversation_id = ? WHERE conversation_id = ?"
    ).run(keepId, dropId);
    try {
      db.prepare(
        "UPDATE wa_ticket_state SET conversation_id = ? WHERE conversation_id = ?"
      ).run(keepId, dropId);
    } catch {
      // tabla puede no existir aún
    }
    // Conservar contact_phone / residente / nombre del drop si faltan en keep.
    if (!keep.contact_phone && drop.contact_phone) {
      db.prepare(
        "UPDATE conversations SET contact_phone = ? WHERE id = ?"
      ).run(drop.contact_phone, keepId);
    }
    if (!keep.residente_id && drop.residente_id) {
      db.prepare(
        "UPDATE conversations SET residente_id = ? WHERE id = ?"
      ).run(drop.residente_id, keepId);
    }
    if (!keep.name && drop.name) {
      db.prepare("UPDATE conversations SET name = ? WHERE id = ?").run(
        drop.name,
        keepId
      );
    }
    db.prepare(
      `UPDATE conversations SET last_message_at = (
         SELECT MAX(created_at) FROM messages WHERE conversation_id = ?
       ) WHERE id = ?`
    ).run(keepId, keepId);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(dropId);
  });
  tx();
  broadcastDashboard("conversations");
  broadcastDashboard("messages", { conversationId: keepId });
  return true;
}

/**
 * @param phone Clave de chat (JID @lid/@s.whatsapp.net o dígitos 521…)
 * @param contactPhoneHint MSISDN real resuelto (p. ej. desde LID mapping).
 *   Si se pasa, se usa para encontrar la conversación canónica del contacto.
 */
export function getOrCreateConversation(
  phone: string,
  name: string | null | undefined,
  lineId: number,
  contactPhoneHint?: string | null
): Conversation {
  const existingExact = db
    .prepare("SELECT * FROM conversations WHERE line_id = ? AND phone = ?")
    .get(lineId, phone) as Conversation | undefined;

  const existing =
    existingExact ??
    (contactPhoneHint
      ? findConversationByPhoneDigits(lineId, contactPhoneHint)
      : null) ??
    findConversationByPhoneDigits(lineId, phone) ??
    undefined;

  if (existing) {
    if (name && !existing.name) {
      db.prepare("UPDATE conversations SET name = ? WHERE id = ?").run(
        name,
        existing.id
      );
      existing.name = name;
    }
    // Solo promover phone a MSISDN canónico (52…/521…), NUNCA a dígitos de @lid.
    const isJid = phone.includes("@");
    const digitsOnly = phone.replace(/\D/g, "");
    const looksLikeMsisdn =
      !isJid &&
      digitsOnly.length >= 12 &&
      (digitsOnly.startsWith("521") || digitsOnly.startsWith("52"));
    if (
      looksLikeMsisdn &&
      !existing.phone.includes("@") &&
      existing.phone.replace(/\D/g, "") !== digitsOnly
    ) {
      db.prepare("UPDATE conversations SET phone = ? WHERE id = ?").run(
        digitsOnly,
        existing.id
      );
      existing.phone = digitsOnly;
    }
    if (contactPhoneHint) {
      const cp = contactPhoneHint.replace(/\D/g, "");
      if (cp.length >= 10) {
        db.prepare(
          "UPDATE conversations SET contact_phone = ? WHERE id = ? AND (contact_phone IS NULL OR contact_phone = '')"
        ).run(cp.length === 10 ? `521${cp}` : cp.startsWith("52") ? cp : `521${cp.slice(-10)}`, existing.id);
      }
    }
    return existing;
  }

  // Nueva conversación: preferir MSISDN como clave (no @lid) si lo conocemos.
  let storePhone = phone;
  if (contactPhoneHint) {
    const cp = contactPhoneHint.replace(/\D/g, "");
    if (cp.length === 10) storePhone = `521${cp}`;
    else if (cp.length === 12 && cp.startsWith("52") && !cp.startsWith("521"))
      storePhone = `521${cp.slice(2)}`;
    else if (cp.length >= 12 && cp.startsWith("52")) storePhone = cp;
  }

  const result = db
    .prepare("INSERT INTO conversations (line_id, phone, name) VALUES (?, ?, ?)")
    .run(lineId, storePhone, name ?? null);

  const created = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(result.lastInsertRowid) as Conversation;

  if (contactPhoneHint) {
    const cp = contactPhoneHint.replace(/\D/g, "");
    if (cp.length >= 10) {
      const normalized =
        cp.length === 10
          ? `521${cp}`
          : cp.length === 12 && cp.startsWith("52") && !cp.startsWith("521")
            ? `521${cp.slice(2)}`
            : cp;
      db.prepare(
        "UPDATE conversations SET contact_phone = ? WHERE id = ?"
      ).run(normalized, created.id);
      created.contact_phone = normalized;
    }
  }

  return created;
}

export function getConversationById(id: number): Conversation | null {
  return (
    (db
      .prepare("SELECT * FROM conversations WHERE id = ?")
      .get(id) as Conversation) ?? null
  );
}

const insertMessageTx = db.transaction(
  (conversationId: number, role: string, content: string) => {
    const result = db
      .prepare(
        "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"
      )
      .run(conversationId, role, content);

    db.prepare(
      "UPDATE conversations SET last_message_at = unixepoch() WHERE id = ?"
    ).run(conversationId);

    return result.lastInsertRowid;
  }
);

export function insertMessage(
  conversationId: number,
  role: "user" | "assistant" | "human",
  content: string
): number {
  const id = Number(insertMessageTx(conversationId, role, content));
  broadcastDashboard("messages", { conversationId });
  return id;
}

export function getMessages(conversationId: number, limit = 50): Message[] {
  return db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(conversationId, limit) as Message[];
}

export function getRecentHistory(conversationId: number, limit = 20): Message[] {
  const rows = db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(conversationId, limit) as Message[];
  return rows.reverse();
}

export function setMode(conversationId: number, mode: "AI" | "HUMAN"): void {
  if (mode === "AI") {
    db.prepare(
      "UPDATE conversations SET mode = ?, awaiting_handoff = 0, human_requested = 0 WHERE id = ?"
    ).run(mode, conversationId);
    broadcastDashboard("conversations");
    return;
  }

  db.prepare("UPDATE conversations SET mode = ? WHERE id = ?").run(
    mode,
    conversationId
  );
  broadcastDashboard("conversations");
}

export function setAwaitingHandoff(
  conversationId: number,
  awaiting: boolean
): void {
  db.prepare("UPDATE conversations SET awaiting_handoff = ? WHERE id = ?").run(
    awaiting ? 1 : 0,
    conversationId
  );
}

export function requestHumanHandoff(conversationId: number): void {
  db.prepare(
    `UPDATE conversations
     SET mode = 'HUMAN', awaiting_handoff = 0, human_requested = 1,
         last_message_at = unixepoch(), sla_deadline = unixepoch() + 600
     WHERE id = ?`
  ).run(conversationId);
}

export function queueHumanHandoff(conversationId: number): void {
  db.prepare(
    `UPDATE conversations
     SET mode = 'AI', awaiting_handoff = 0, human_requested = 1,
         last_message_at = unixepoch(), sla_deadline = unixepoch() + 600
     WHERE id = ?`
  ).run(conversationId);
}

export function acknowledgeHumanRequest(conversationId: number): void {
  db.prepare("UPDATE conversations SET human_requested = 0 WHERE id = ?").run(
    conversationId
  );
}

export function listConversations(
  lineId?: number,
  userId?: number,
  role?: string,
  allowedLineIds?: number[] | null
): (Conversation & {
  last_message_preview: string | null;
  last_message_role: string | null;
  assigned_to_name: string | null;
  line_name: string;
  tags: { id: number; name: string; color: string }[];
  sla_breached: number;
  survey_rating: number | null;
  residente_num_coto: string | null;
  residente_num_vivienda: number | null;
  residente_condominio: string | null;
  residente_nombre: string | null;
  residente_properties: ConversationResidenteProperty[];
})[] {
  const conditions: string[] = [];
  const params: (number | string)[] = [];

  if (lineId != null) {
    conditions.push("c.line_id = ?");
    params.push(lineId);
  }

  if (role === "atencion" && allowedLineIds != null && allowedLineIds.length > 0) {
    const placeholders = allowedLineIds.map(() => "?").join(", ");
    conditions.push(`c.line_id IN (${placeholders})`);
    params.push(...allowedLineIds);
  }

  // RLS: rol atencion solo ve sus conversaciones o las sin asignar
  if (role === "atencion" && userId != null) {
    conditions.push(
      "(c.assigned_to_user_id = ? OR c.assigned_to_user_id IS NULL)"
    );
    params.push(userId);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT c.*,
        wl.name as line_name,
        r.num_coto as residente_num_coto,
        r.num_vivienda as residente_num_vivienda,
        r.nombre as residente_nombre,
        condo.name as residente_condominio,
        (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_preview,
        (SELECT role FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_role,
        u.display_name as assigned_to_name,
        (SELECT rating FROM satisfaction_surveys
         WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as survey_rating,
        CASE WHEN c.sla_deadline IS NOT NULL AND c.sla_deadline < unixepoch() AND c.human_requested = 1
          THEN 1 ELSE 0 END as sla_breached
       FROM conversations c
       JOIN wa_lines wl ON wl.id = c.line_id
       LEFT JOIN admin_users u ON u.id = c.assigned_to_user_id
       LEFT JOIN residentes r ON r.id = c.residente_id
       LEFT JOIN condominios condo ON condo.id = r.condominio_id
       ${whereClause}
       ORDER BY c.priority DESC, c.human_requested DESC, c.last_message_at DESC NULLS LAST`
    )
    .all(...params) as (Conversation & {
    line_name: string;
    last_message_preview: string | null;
    last_message_role: string | null;
    assigned_to_name: string | null;
    sla_breached: number;
    survey_rating: number | null;
    residente_num_coto: string | null;
    residente_num_vivienda: number | null;
    residente_condominio: string | null;
    residente_nombre: string | null;
  })[];

  return rows.map((row) => {
    const tags = db
      .prepare(
        `SELECT t.id, t.name, t.color FROM tags t
         JOIN conversation_tags ct ON ct.tag_id = t.id
         WHERE ct.conversation_id = ?`
      )
      .all(row.id) as { id: number; name: string; color: string }[];

    let residente_num_coto = row.residente_num_coto;
    let residente_num_vivienda = row.residente_num_vivienda;
    let residente_condominio = row.residente_condominio;
    let residente_nombre = row.residente_nombre;

    const lookupPhone = row.contact_phone ?? row.phone;
    let propertyRows = listPropertiesForCallerPhone(lookupPhone);
    if (propertyRows.length === 0 && row.residente_id) {
      const linked = getResidente(row.residente_id);
      if (linked) propertyRows = findSiblingProperties(linked);
    }

    const residente_properties: ConversationResidenteProperty[] =
      propertyRows.map((r) => ({
        id: r.id,
        condominio: r.condominio_name,
        num_vivienda: r.num_vivienda,
        num_coto: r.num_coto != null ? String(r.num_coto) : null,
      }));

    if (!residente_num_coto) {
      const residente =
        propertyRows[0] ?? findResidenteByCelular(lookupPhone);
      if (residente) {
        updateConversationContactLocal(row.id, {
          residenteId: residente.id,
          name: residente.nombre,
          contactPhone: row.contact_phone ?? undefined,
        });
        residente_num_coto =
          residente.num_coto != null ? String(residente.num_coto) : null;
        residente_num_vivienda = residente.num_vivienda;
        residente_condominio = residente.condominio_name;
        residente_nombre = residente.nombre;
      }
    }

    return {
      ...row,
      tags,
      residente_num_coto,
      residente_num_vivienda,
      residente_condominio,
      residente_nombre,
      residente_properties,
    };
  });
}

export function canUserAccessConversation(
  conversationId: number,
  userId: number,
  role: string,
  allowedLineIds?: number[] | null
): boolean {
  if (role === "admin" || role === "super_admin") return true;

  const row = db
    .prepare(
      "SELECT id, line_id, assigned_to_user_id FROM conversations WHERE id = ?"
    )
    .get(conversationId) as
    | { id: number; line_id: number; assigned_to_user_id: number | null }
    | undefined;

  if (!row) return false;

  if (
    allowedLineIds != null &&
    allowedLineIds.length > 0 &&
    !allowedLineIds.includes(row.line_id)
  ) {
    return false;
  }

  return row.assigned_to_user_id === userId || row.assigned_to_user_id === null;
}

const WA_LINE_SELECT =
  "SELECT id, name, status, qr_string, phone, sort_order, updated_at, provider, meta_phone_number_id FROM wa_lines";

export function listWaLines(): WaLine[] {
  return db
    .prepare(`${WA_LINE_SELECT} ORDER BY sort_order ASC, id ASC`)
    .all() as WaLine[];
}

export function getWaLine(id: number): WaLine | null {
  return (
    (db.prepare(`${WA_LINE_SELECT} WHERE id = ?`).get(id) as WaLine) ?? null
  );
}

export function findWaLineByMetaPhoneNumberId(
  phoneNumberId: string
): WaLine | null {
  return (
    (db
      .prepare(`${WA_LINE_SELECT} WHERE meta_phone_number_id = ?`)
      .get(phoneNumberId) as WaLine) ?? null
  );
}

export function setWaLineProvider(
  id: number,
  provider: "baileys" | "meta",
  metaPhoneNumberId: string | null = null
): void {
  db.prepare(
    "UPDATE wa_lines SET provider = ?, meta_phone_number_id = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(provider, metaPhoneNumberId, id);
}

export function setWaLineState(
  id: number,
  update: {
    status?: string;
    qr_string?: string | null;
    phone?: string | null;
  }
): void {
  const current = getWaLine(id);
  if (!current) return;

  const newStatus = update.status ?? current.status;
  const newQr =
    update.qr_string === undefined ? current.qr_string : update.qr_string;
  const newPhone =
    update.phone === undefined ? current.phone : update.phone;

  db.prepare(
    "UPDATE wa_lines SET status = ?, qr_string = ?, phone = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(newStatus, newQr, newPhone, id);
}

export function updateWaLineName(id: number, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  db.prepare("UPDATE wa_lines SET name = ?, updated_at = unixepoch() WHERE id = ?").run(
    trimmed,
    id
  );
}

/** @deprecated Use listWaLines / setWaLineState */
export function getConnectionState(): ConnectionState {
  const line = getWaLine(1);
  if (!line) {
    return {
      status: "disconnected",
      qr_string: null,
      phone: null,
      updated_at: Math.floor(Date.now() / 1000),
    };
  }
  return {
    status: line.status,
    qr_string: line.qr_string,
    phone: line.phone,
    updated_at: line.updated_at,
  };
}

/** @deprecated Use setWaLineState */
export function setConnectionState(update: {
  status?: string;
  qr_string?: string | null;
  phone?: string | null;
}): void {
  setWaLineState(1, update);
}

export function enqueueOutbox(
  conversationId: number,
  phone: string,
  content: string,
  lineId: number
): void {
  db.prepare(
    "INSERT INTO outbox (conversation_id, line_id, phone, content) VALUES (?, ?, ?, ?)"
  ).run(conversationId, lineId, phone, content);
}

export function getPendingOutbox(limit = 20): OutboxItem[] {
  return db
    .prepare("SELECT * FROM outbox WHERE sent = 0 ORDER BY created_at ASC LIMIT ?")
    .all(limit) as OutboxItem[];
}

export function markOutboxSent(id: number): void {
  db.prepare("UPDATE outbox SET sent = 1 WHERE id = ?").run(id);
}

/** Reserva un item del outbox para envío (evita duplicados entre polls). */
export function claimOutboxItem(id: number): boolean {
  const result = db
    .prepare("UPDATE outbox SET sent = 1 WHERE id = ? AND sent = 0")
    .run(id);
  return result.changes > 0;
}

export function releaseOutboxItem(id: number): void {
  db.prepare("UPDATE outbox SET sent = 0 WHERE id = ?").run(id);
}

const deleteConversationTx = db.transaction((id: number) => {
  db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM outbox WHERE conversation_id = ? AND sent = 0").run(id);
  db.prepare("DELETE FROM conversation_notes WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM conversation_tags WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM satisfaction_surveys WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM category_detections WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM faq_hits WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM reglamento_hits WHERE conversation_id = ?").run(id);
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
});

export function deleteConversation(id: number): void {
  deleteConversationTx(id);
}

import { initFeatureSchema } from "./db-features";
initFeatureSchema();

function migrateMultiLineSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_lines (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT CHECK(status IN ('disconnected','qr','connecting','connected'))
        NOT NULL DEFAULT 'disconnected',
      qr_string TEXT,
      phone TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  db.prepare(
    "INSERT OR IGNORE INTO wa_lines (id, name, sort_order) VALUES (1, 'Línea 1', 1)"
  ).run();

  // Columnas híbrido Meta — antes de cualquier getWaLine()
  if (!columnExists("wa_lines", "provider")) {
    db.exec(
      "ALTER TABLE wa_lines ADD COLUMN provider TEXT NOT NULL DEFAULT 'baileys'"
    );
  }
  if (!columnExists("wa_lines", "meta_phone_number_id")) {
    db.exec("ALTER TABLE wa_lines ADD COLUMN meta_phone_number_id TEXT");
  }

  const legacy = db
    .prepare(
      "SELECT status, qr_string, phone FROM connection_state WHERE id = 1"
    )
    .get() as
    | { status: string; qr_string: string | null; phone: string | null }
    | undefined;

  if (legacy && legacy.status !== "disconnected") {
    const line1 = getWaLine(1);
    if (line1 && line1.status === "disconnected") {
      setWaLineState(1, {
        status: legacy.status as WaLine["status"],
        qr_string: legacy.qr_string,
        phone: legacy.phone,
      });
    }
  }

  if (!columnExists("conversations", "line_id")) {
    migrateConversationsForMultiLine();
  }

  if (!columnExists("outbox", "line_id")) {
    db.exec("ALTER TABLE outbox ADD COLUMN line_id INTEGER NOT NULL DEFAULT 1");
  }
}

function migrateConversationsForMultiLine(): void {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];

  if (tables.some((t) => t.name === "conversations_new")) {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DROP TABLE IF EXISTS conversations");
    db.exec("ALTER TABLE conversations_new RENAME TO conversations");
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_conversations_line ON conversations(line_id)"
    );
    db.exec("PRAGMA foreign_keys = ON");
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF");

  const cols = db.prepare("PRAGMA table_info(conversations)").all() as {
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }[];

  const dataCols = cols.filter((c) => c.name !== "line_id" && c.name !== "id");

  const colDefs = [
    "id INTEGER PRIMARY KEY AUTOINCREMENT",
    "line_id INTEGER NOT NULL DEFAULT 1 REFERENCES wa_lines(id)",
    ...dataCols.map((c) => {
      let def = `${c.name} ${c.type || "TEXT"}`;
      if (c.notnull) def += " NOT NULL";
      if (c.dflt_value != null) {
        const dv = String(c.dflt_value);
        if (dv === "unixepoch()") {
          def += " DEFAULT (unixepoch())";
        } else {
          def += ` DEFAULT ${dv}`;
        }
      }
      return def;
    }),
    "UNIQUE(line_id, phone)",
  ];

  db.exec(`CREATE TABLE conversations_new (${colDefs.join(", ")})`);

  const insertCols = ["line_id", ...dataCols.map((c) => c.name)].join(", ");
  const selectExpr = ["1", ...dataCols.map((c) => c.name)].join(", ");

  db.exec(
    `INSERT INTO conversations_new (${insertCols}) SELECT ${selectExpr} FROM conversations`
  );
  db.exec("DROP TABLE conversations");
  db.exec("ALTER TABLE conversations_new RENAME TO conversations");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_conversations_line ON conversations(line_id)"
  );
  db.exec("PRAGMA foreign_keys = ON");
}

migrateMultiLineSchema();
initCrmSchema();

export default db;
