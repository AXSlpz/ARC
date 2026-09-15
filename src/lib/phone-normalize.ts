/** Digits-only variants used to match residentes.celular (10-digit MX local). */
export function phoneLookupCandidates(phone: string): string[] {
  const digits = phone.replace(/\D/g, "");
  const candidates = new Set<string>();
  if (!digits) return [];

  candidates.add(digits);
  if (digits.length >= 10) candidates.add(digits.slice(-10));
  if (digits.startsWith("52") && digits.length >= 12) {
    candidates.add(digits.slice(2));
    candidates.add(digits.slice(-10));
  }
  if (digits.startsWith("521") && digits.length >= 13) {
    candidates.add(digits.slice(3));
    candidates.add(digits.slice(-10));
  }

  return [...candidates].filter(Boolean);
}

export function jidToPhoneDigits(jid: string): string | null {
  if (!jid) return null;
  const user = jid.replace(/@.+$/, "");
  const digits = user.replace(/\D/g, "");
  return digits || null;
}

export function primaryContactPhone(jidOrPhone: string): string | null {
  const candidates = phoneLookupCandidates(jidOrPhone);
  return candidates.find((c) => c.length >= 10) ?? candidates[0] ?? null;
}
