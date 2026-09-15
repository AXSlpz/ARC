const isProd = process.env.NODE_ENV === "production";

export function maskPhone(phone: string): string {
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

export function maskText(text: string, maxLen = 20): string {
  if (!isProd) return `"${text.slice(0, 80)}"`;
  const truncated = text.slice(0, maxLen);
  return `"${truncated}${text.length > maxLen ? "…" : ""}"`;
}

export function botLog(message: string) {
  console.log(`[bot] ${message}`);
}

export function botError(message: string, err?: unknown) {
  if (isProd) {
    console.error(`[bot] ERROR: ${message}`);
  } else {
    console.error(`[bot] ${message}`, err);
  }
}
