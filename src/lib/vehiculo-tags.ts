export const TAG_VEHICULAR_ESTATUS = ["Activo", "Inactivo"] as const;
export type TagVehicularEstatus = (typeof TAG_VEHICULAR_ESTATUS)[number];

export const VEHICULO_COLORES = [
  "Blanco",
  "Negro",
  "Gris",
  "Plata",
  "Rojo",
  "Azul",
  "Azul Marino",
  "Verde",
  "Verde Olivo",
  "Amarillo",
  "Naranja",
  "Cafe",
  "Beige",
  "Dorado",
  "Bronce",
  "Vino",
  "Morado",
  "Rosa",
  "Turquesa",
  "Champagne",
] as const;
export type VehiculoColor = (typeof VEHICULO_COLORES)[number];
