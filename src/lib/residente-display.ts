export function formatResidenteAccountLabel(residente: {
  num_vivienda?: number | null;
}): string | null {
  if (residente.num_vivienda == null) return null;
  return `Núm° Vivienda - ${residente.num_vivienda}`;
}
