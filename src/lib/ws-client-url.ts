/** URL del bus de tiempo real. En local el WS va en su puerto (p. ej. 3011), no en el de Next. */
export function getWsBaseUrl(): string {
  if (typeof window === "undefined") return "";

  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const hostname = window.location.hostname;
  const port = window.location.port;

  if (process.env.NEXT_PUBLIC_WS_SAME_ORIGIN === "true") {
    return `${proto}://${window.location.host}/ws`;
  }

  const configured = process.env.NEXT_PUBLIC_WS_PORT;
  if (configured) {
    return `${proto}://${hostname}:${configured}/ws`;
  }

  if (!port || port === "3000") {
    return `${proto}://${hostname}:3001/ws`;
  }

  return `${proto}://${window.location.host}/ws`;
}
