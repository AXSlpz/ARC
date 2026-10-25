/**
 * Helper: extracción segura de IP del cliente.
 *
 * XFF (X-Forwarded-For) es trivialmente falsificable por cualquier cliente.
 * Solo lo usamos cuando se configura explícitamente TRUSTED_PROXY=1
 * (indica que hay un proxy/balanceador de carga de confianza al frente).
 *
 * Sin TRUSTED_PROXY, devolvemos null para no almacenar IPs falsas
 * que den una falsa sensación de seguridad.
 */

export interface IpHeaders {
  /** Valor del header X-Forwarded-For (puede ser null si no viene). */
  xff: string | null;
  /** Valor del header X-Real-Ip (puede ser null). */
  realIp: string | null;
}

/**
 * Retorna la IP del cliente de forma segura.
 *
 * - Si `TRUSTED_PROXY=1`: usa x-forwarded-for (primera IP) o x-real-ip.
 * - En cualquier otro caso: devuelve `null`.
 *
 * No lanza nunca; devuelve null en caso de error.
 */
export function getTrustedIp(headers: IpHeaders): string | null {
  try {
    const trustedProxy = process.env.TRUSTED_PROXY === "1";
    if (!trustedProxy) return null;

    if (headers.xff) {
      const first = headers.xff.split(",")[0]?.trim();
      if (first) return first;
    }

    if (headers.realIp) return headers.realIp.trim() || null;

    return null;
  } catch {
    return null;
  }
}

/**
 * Extrae los valores de IpHeaders desde headers de Next.js (ReadonlyHeaders).
 */
export function extractIpHeaders(headers: {
  get(name: string): string | null;
}): IpHeaders {
  return {
    xff: headers.get("x-forwarded-for"),
    realIp: headers.get("x-real-ip"),
  };
}
