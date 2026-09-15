export function formatAllowedLineLabels(
  allowedLineIds: number[] | null,
  lineNames: Map<number, string> | Record<number, string>
): string {
  if (allowedLineIds === null) return "Todas las líneas";
  if (allowedLineIds.length === 0) return "Sin líneas";

  const nameMap =
    lineNames instanceof Map
      ? lineNames
      : new Map(Object.entries(lineNames).map(([id, name]) => [Number(id), name]));

  return allowedLineIds
    .map((id) => nameMap.get(id) ?? `Línea ${id}`)
    .join(", ");
}
