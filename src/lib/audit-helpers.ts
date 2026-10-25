export const ACTION_LABELS: Record<string, string> = {
  "conversation.delete": "Eliminó conversación",
  "conversation.mode": "Cambió modo de conversación",
  "conversation.assign": "Asignó conversación",
  "conversation.acknowledge": "Atendió solicitud humana",
  "conversation.dismiss_summary": "Descartó resumen de traspaso",
  "conversation.close_survey": "Cerró conversación y envió encuesta",
  "conversation.close": "Cerró la conversación",
  "conversation.reopen": "Reabrió conversación cerrada",
  "conversation.tags": "Actualizó etiquetas de conversación",
  "note.create": "Agregó nota interna",
  "faq.create": "Creó pregunta frecuente",
  "faq.delete": "Eliminó pregunta frecuente",
  "tag.create": "Creó etiqueta",
  "tag.delete": "Eliminó etiqueta",
  "quick_reply.create": "Creó respuesta rápida",
  "quick_reply.delete": "Eliminó respuesta rápida",
  "user.create": "Creó usuario del panel",
  "user.update": "Actualizó usuario del panel",
  "settings.general": "Actualizó datos generales",
  "settings.holidays": "Actualizó días festivos",
  "settings.schedule": "Actualizó horario de atención",
  "settings.ai_menu": "Actualizó IA / menú",
  "settings.inactivity": "Actualizó mensaje de cierre automático",
  "settings.appearance": "Actualizó apariencia del chat",
  "logo.update": "Actualizó logo del negocio",
  "document.upload": "Subió documento",
  "document.delete": "Eliminó documento",
  "document.reindex": "Re-indexó documentos",
  "line.rename": "Renombró línea WhatsApp",
  "line.disconnect": "Desconectó línea WhatsApp",
  "line.connect": "Línea WhatsApp conectada",
};

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function parseAuditDetails(
  raw: string | Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildAuditSummary(
  action: string,
  details: Record<string, unknown> | null
): string {
  const label = getActionLabel(action);
  if (!details) return label;

  const contact =
    (details.contactName as string) ||
    (details.phone ? `+${details.phone}` : null);
  const line = details.lineName as string | undefined;

  switch (action) {
    case "conversation.delete":
      return `${label}: ${contact ?? "sin nombre"}${line ? ` · ${line}` : ""}`;
    case "conversation.mode":
      return `${label} → ${details.mode === "AI" ? "IA" : "Humano"}${contact ? ` (${contact})` : ""}`;
    case "conversation.assign":
      return `${label} a ${details.assignedToName ?? "usuario"}${contact ? ` · ${contact}` : ""}`;
    case "conversation.acknowledge":
      return `${label}${contact ? `: ${contact}` : ""}${line ? ` · ${line}` : ""}`;
    case "conversation.dismiss_summary":
    case "conversation.close_survey":
    case "conversation.close":
    case "conversation.reopen":
      return `${label}${contact ? `: ${contact}` : ""}${line ? ` · ${line}` : ""}`;
    case "conversation.tags":
      return `${label}${details.tagNames ? `: ${details.tagNames}` : ""}${contact ? ` · ${contact}` : ""}`;
    case "note.create":
      return `${label}${contact ? ` en ${contact}` : ""}`;
    case "faq.create":
    case "faq.delete":
      return `${label}: ${String(details.question ?? "").slice(0, 60)}`;
    case "tag.create":
    case "tag.delete":
      return `${label}: ${details.tagName ?? ""}`;
    case "quick_reply.create":
    case "quick_reply.delete":
      return `${label}: ${details.label ?? ""}`;
    case "user.create":
      return `${label}: ${details.displayName ?? "sin nombre"} (${details.role ?? "—"})`;
    case "user.update":
      return `${label}${details.displayName ? `: ${details.displayName}` : ""}${details.passwordChanged ? " · contraseña cambiada" : ""}`;
    case "settings.general":
      return `${label}: ${details.businessNameTo ?? ""}`;
    case "settings.holidays":
      return `${label} (${details.holidayCount ?? 0} fechas)`;
    case "settings.schedule":
      return `${label}`;
    case "settings.ai_menu":
      return `${label}${details.menuEnabled ? ` · menú ${String(details.menuEnabled).toLowerCase()}` : ""}`;
    case "settings.inactivity":
      return `${label}`;
    case "settings.appearance":
      return `${label}`;
    case "logo.update":
      return `${label} (${details.fileType ?? "imagen"})`;
    case "document.upload":
    case "document.delete":
      return `${label}: ${details.fileName ?? ""}`;
    case "document.reindex":
      return `${label}: ${details.chunkCount ?? 0} fragmentos`;
    case "line.rename":
      return `${label}: ${details.previousName ?? ""} → ${details.newName ?? ""}`;
    case "line.disconnect":
      return `${label}: ${details.lineName ?? ""}`;
    case "line.connect":
      return `${label}: ${details.lineName ?? ""}`;
    default:
      if (contact) return `${label}: ${contact}`;
      return label;
  }
}

const DETAIL_FIELD_LABELS: Record<string, string> = {
  conversationId: "ID conversación",
  contactName: "Nombre del contacto",
  phone: "Teléfono",
  lineId: "ID línea",
  lineName: "Línea WhatsApp",
  mode: "Modo",
  previousMode: "Modo anterior",
  category: "Categoría",
  priority: "Prioridad",
  assignedTo: "ID usuario asignado",
  assignedToName: "Asignado a",
  tagIds: "IDs de etiquetas",
  tagNames: "Etiquetas",
  noteId: "ID nota",
  notePreview: "Contenido de la nota",
  question: "Pregunta",
  answerPreview: "Respuesta",
  keywords: "Palabras clave",
  tagName: "Nombre etiqueta",
  tagColor: "Color",
  label: "Etiqueta botón",
  contentPreview: "Texto del mensaje",
  entityId: "ID entidad",
  displayName: "Nombre visible",
  usernameMasked: "Usuario (enmascarado)",
  role: "Rol",
  roleFrom: "Rol anterior",
  roleTo: "Rol nuevo",
  passwordChanged: "Contraseña cambiada",
  targetUserId: "ID usuario",
  businessNameFrom: "Nombre anterior",
  businessNameTo: "Nombre nuevo",
  timezoneFrom: "Zona horaria anterior",
  timezoneTo: "Zona horaria nueva",
  holidayCount: "Total festivos",
  holidays: "Fechas festivas",
  holidaysAdded: "Festivos agregados",
  holidaysRemoved: "Festivos eliminados",
  daysChanged: "Horarios modificados",
  menuEnabled: "Menú de bienvenida",
  welcomePreview: "Mensaje de bienvenida",
  urgencyKeywordCount: "Palabras de urgencia",
  urgencyKeywords: "Palabras de urgencia",
  colorsChanged: "Colores modificados",
  fileType: "Tipo de archivo",
  fileSizeKb: "Tamaño (KB)",
  fileName: "Archivo",
  documentKind: "Tipo documento",
  chunkCount: "Fragmentos indexados",
  sourceCount: "Archivos indexados",
  previousName: "Nombre anterior",
  newName: "Nombre nuevo",
  phoneMasked: "Teléfono",
  displayNameFrom: "Nombre visible anterior",
  displayNameTo: "Nombre visible nuevo",
};

export function formatDetailValue(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (key === "phone") return `+${value}`;
  if (key === "mode" || key === "previousMode") {
    return value === "AI" ? "IA (automático)" : "Humano";
  }
  if (key === "priority") {
    return value === "urgent" ? "Urgente" : "Normal";
  }
  if (key === "passwordChanged") {
    return value === true || value === "true" ? "Sí (valor no registrado)" : "No";
  }
  if (key === "menuEnabled" && typeof value === "boolean") {
    return value ? "Activado" : "Desactivado";
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function getAuditDetailRows(
  details: Record<string, unknown> | null
): { key: string; label: string; value: string }[] {
  if (!details) return [];

  const order = [
    "conversationId",
    "contactName",
    "phone",
    "phoneMasked",
    "lineName",
    "lineId",
    "targetUserId",
    "displayName",
    "usernameMasked",
    "role",
    "roleFrom",
    "roleTo",
    "displayNameFrom",
    "displayNameTo",
    "passwordChanged",
    "businessNameFrom",
    "businessNameTo",
    "timezoneFrom",
    "timezoneTo",
    "holidayCount",
    "holidays",
    "holidaysAdded",
    "holidaysRemoved",
    "daysChanged",
    "menuEnabled",
    "welcomePreview",
    "urgencyKeywordCount",
    "urgencyKeywords",
    "colorsChanged",
    "fileName",
    "fileType",
    "fileSizeKb",
    "documentKind",
    "chunkCount",
    "sourceCount",
    "previousName",
    "newName",
    "category",
    "mode",
    "previousMode",
    "priority",
    "assignedToName",
    "assignedTo",
    "tagNames",
    "tagIds",
    "notePreview",
    "noteId",
    "question",
    "answerPreview",
    "keywords",
    "tagName",
    "tagColor",
    "label",
    "contentPreview",
  ];

  const rows: { key: string; label: string; value: string }[] = [];
  const seen = new Set<string>();

  for (const key of order) {
    if (key in details) {
      seen.add(key);
      rows.push({
        key,
        label: DETAIL_FIELD_LABELS[key] ?? key,
        value: formatDetailValue(key, details[key]),
      });
    }
  }

  for (const [key, value] of Object.entries(details)) {
    if (!seen.has(key)) {
      rows.push({
        key,
        label: DETAIL_FIELD_LABELS[key] ?? key,
        value: formatDetailValue(key, value),
      });
    }
  }

  return rows;
}
