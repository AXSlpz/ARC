import type { Residente } from "./residentes";
import { looksLikeAccountQuestion } from "./residente-account-reply";
import { looksLikeTagVehicularQuestion } from "./residente-tag-reply";
import { hasSubstantiveQuestion } from "./personalized-replies";
import { detectQueryTopics, getSearchTokens, normalizeQuery } from "./query-enrichment";
import { parsePropertyMentionInQuestion } from "./property-choice";

export function looksLikeContactQuestion(query: string): boolean {
  const hay = normalizeQuery(query);
  if (!hay) return false;
  if (
    [
      "contacto de emergencia",
      "contactos de emergencia",
      "mis contactos",
      "mi contacto",
      "telefono de emergencia",
      "a quien llamo",
      "a quién llamo",
    ].some((p) => hay.includes(normalizeQuery(p)))
  ) {
    return true;
  }
  const tokens = getSearchTokens(query);
  return tokens.some((t) => t === "contacto" || t === "contactos");
}

/** TAGS, cuotas, contactos, reglamento/docs u otra consulta ligada a la vivienda. */
export function looksLikePropertyScopedQuestion(text: string): boolean {
  if (looksLikeTagVehicularQuestion(text)) return true;
  if (looksLikeAccountQuestion(text)) return true;
  if (looksLikeContactQuestion(text)) return true;
  if (hasSubstantiveQuestion(text)) return true;
  return detectQueryTopics(text).length > 0;
}

export function shouldPromptPropertyChoice(
  text: string,
  properties: Residente[],
  state: { propertyExplicitlyChosen: boolean }
): boolean {
  if (properties.length <= 1) return false;
  if (state.propertyExplicitlyChosen) return false;
  if (!looksLikePropertyScopedQuestion(text)) return false;
  if (parsePropertyMentionInQuestion(text, properties)) return false;
  return true;
}
