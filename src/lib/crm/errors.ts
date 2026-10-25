export class CrmError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CrmError";
    this.status = status;
  }
}

export function isSqliteUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code) : "";
  const message =
    err instanceof Error ? err.message : String((err as { message?: unknown }).message ?? "");
  return (
    code.includes("CONSTRAINT") ||
    /UNIQUE constraint failed/i.test(message) ||
    /FOREIGN KEY constraint failed/i.test(message)
  );
}
