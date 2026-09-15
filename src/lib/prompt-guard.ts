/**
 * Detección determinística de intentos de jailbreak / prompt injection
 * antes de invocar al LLM. Solo se permiten consultas sobre contenido indexado.
 */

export const PROMPT_GUARD_REJECTION =
  "No puedo procesar tu solicitud. Solo atiendo preguntas sobre el reglamento y avisos del condominio.";

const MANIPULATION_PATTERNS: RegExp[] = [
  // Meta-preguntas sobre limitaciones del asistente
  /\b(romper|violar|saltar|saltarte|ignorar|desactivar|anular|bypass|hackear)\b.{0,40}\b(limitantes?|limitaciones|instrucciones|restricciones|reglas)\b/i,
  /\b(limitantes?|instrucciones|restricciones)\b.{0,40}\b(romper|violar|saltar|ignorar|desactivar)\b/i,
  /\b(tus?|vuestras?)\s+(limitantes?|limitaciones|instrucciones|restricciones|reglas)\b/i,
  /\b(puedes|podr[ií]as|podr[ií]as)\s+(romper|ignorar|saltarte|violar|desactivar|anular)\b/i,
  /\b(sin|fuera de)\s+(limitaciones|restricciones|reglas)\b/i,
  /\bviol(a|ar[ií]as|ar[ií]a)\s+(tus?\s+)?(limitantes?|limitaciones|reglas|instrucciones)\b/i,

  // Instrucciones de override / roleplay
  /\b(ignora|olvida|desobedece|anula)\s+(las?\s+)?(instrucciones|reglas|directrices|prompt)\b/i,
  /\b(olvida|ignora)\s+(tu|el)\s+(prompt|rol|sistema)\b/i,
  /\b(act[uú]a|finge|pretende|comportate|comp[oó]rtate)\s+como\s+(si\s+)?(no\s+)?(fueras|tuvieras)\b/i,
  /\b(eres|sos)\s+(un\s+)?(llm|gpt|chatbot|modelo|ia|inteligencia artificial)\b/i,
  /\b(prompt|instrucciones)\s+(del|de)\s+sistema\b/i,
  /\bsystem\s+prompt\b/i,
  /\bjailbreak\b/i,
  /\bmodo\s+(dan|desarrollador|dev)\b/i,
  /\bmu[eé]str(a|ame|ame)\s+(tu|tus|las)\s+(instrucciones|prompt|reglas)\b/i,
  /\bcu[aá]l\s+es\s+tu\s+prompt\b/i,

  // Trampas lógicas sobre el comportamiento del bot
  /\bcorrecto\s+que\s+no\s+(me\s+)?(dir[ií]as|contestar[ií]as|responder[ií]as)\b/i,
  /\bno\s+(me\s+)?(dir[ií]as|contestar[ií]as|responder[ií]as)\s+porque\b/i,
  /\bpor\s+qu[eé]\s+no\s+(me\s+)?(dices|contestas|respondes)\b/i,
  /\b(entonces|as[ií]\s+que)\s+.{0,30}\bno\s+(me\s+)?(dir[ií]as|contestar[ií]as)\b/i,

  // Preguntas sobre capacidades técnicas (no identidad simple)
  /\b(cu[aá]les\s+son\s+tus\s+capacidades|para\s+qu[eé]\s+sirves\s+exactamente)\b/i,
  /\b(est[aá]s|estas)\s+limitad[oa]\b/i,
  /\bqu[eé]\s+(informaci[oó]n|datos)\s+tienes\s+(sobre|de)\s+ti\b/i,

  // Inglés frecuente en jailbreaks
  /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions\b/i,
  /\bpretend\s+you\s+are\b/i,
  /\bact\s+as\s+(if\s+)?(you\s+)?(are|were)\b/i,
  /\bdo\s+anything\s+now\b/i,
  /\bdeveloper\s+mode\b/i,
];

const ARITHMETIC_TRAP_PATTERNS: RegExp[] = [
  /\bcu[aá]nto\s+es\s+\d+\s*[+\-*/×÷x]\s*\d+\b/i,
  /\bcu[aá]nto\s+da\s+\d+\s*[+\-*/×÷x]\s*\d+\b/i,
  /\b\d+\s*[+\-*/×÷x]\s*\d+\s*(=\s*\?|\?)\b/,
  /\b(suma|resta|multiplica|divide)\s+(de\s+)?\d+\s*(y|mas|m[aá]s|con|por|entre)\s+\d+\b/i,
  /\bresuelve\s+(esta\s+)?(operaci[oó]n|suma|resta|ecuaci[oó]n)\b/i,
];

/** Palabras que indican consulta legítima sobre el condominio (evita falsos positivos). */
const CONDO_TOPIC_HINTS =
  /\b(condominio|reglamento|cuota|cuotas|mantenimiento|alberca|piscina|mascota|mascotas|estacionamiento|tag|tags|acceso|visitante|ruido|multa|horario|horarios|paris|coto|capital\s+sur|administraci[oó]n|junt[aá]|avisos?|estacionam|port[oó]n|pluma|identificador|banco|clabe|pago|pagos)\b/i;

function normalizeForGuard(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isArithmeticTrap(text: string): boolean {
  const normalized = normalizeForGuard(text);
  if (CONDO_TOPIC_HINTS.test(normalized)) return false;
  return ARITHMETIC_TRAP_PATTERNS.some((re) => re.test(normalized));
}

function isManipulationPattern(text: string): boolean {
  const normalized = normalizeForGuard(text);
  return MANIPULATION_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Devuelve true si el mensaje intenta manipular al asistente o pedir
 * información ajena al reglamento indexado.
 */
export function isPromptManipulationAttempt(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;

  if (isManipulationPattern(trimmed)) return true;
  if (isArithmeticTrap(trimmed)) return true;

  return false;
}

/** Respuestas del LLM que filtran meta-conversación sobre limitaciones. */
const LEAKED_META_PATTERNS: RegExp[] = [
  /\bviol(a|ar[ií]a)\s+(mis\s+)?limitantes?\b/i,
  /\bno\s+te\s+dir[ií]a\s+que\s+\d+\s*[+\-*/×÷]\s*\d+/i,
  /\b(esa|esta)\s+informaci[oó]n\s+no\s+est[aá]\s+contenida\s+en\s+los\s+documentos\b/i,
  /\bresponder\s+a\s+esa\s+pregunta\s+viol/i,
  /\b(mis|tus)\s+limitantes?\b/i,
  /\bconocimiento\s+general\b/i,
];

export function sanitizeLeakedManipulationReply(reply: string): string | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;
  if (LEAKED_META_PATTERNS.some((re) => re.test(trimmed))) {
    return PROMPT_GUARD_REJECTION;
  }
  return null;
}
