export function detectUrgency(text: string, keywords: string[]): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  return keywords.some((kw) => {
    const k = kw
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    return k.length > 2 && normalized.includes(k);
  });
}
