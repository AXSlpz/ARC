interface LineColorSet {
  badge: string;
  chip: string;
  active: string;
  dotConnected: string;
  dotDisconnected: string;
}

/** Paleta refinada: sky, violet, teal, amber, rose */
const LINE_PALETTE: LineColorSet[] = [
  {
    badge: "bg-sky-100 text-sky-900",
    chip: "bg-sky-50 text-sky-800 border-sky-200",
    active: "bg-sky-600 text-white",
    dotConnected: "bg-emerald-500",
    dotDisconnected: "bg-slate-300",
  },
  {
    badge: "bg-violet-100 text-violet-900",
    chip: "bg-violet-50 text-violet-800 border-violet-200",
    active: "bg-violet-600 text-white",
    dotConnected: "bg-emerald-500",
    dotDisconnected: "bg-slate-300",
  },
  {
    badge: "bg-teal-100 text-teal-900",
    chip: "bg-teal-50 text-teal-800 border-teal-200",
    active: "bg-teal-600 text-white",
    dotConnected: "bg-emerald-500",
    dotDisconnected: "bg-slate-300",
  },
  {
    badge: "bg-amber-100 text-amber-900",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    active: "bg-amber-600 text-white",
    dotConnected: "bg-emerald-500",
    dotDisconnected: "bg-slate-300",
  },
  {
    badge: "bg-rose-100 text-rose-900",
    chip: "bg-rose-50 text-rose-800 border-rose-200",
    active: "bg-rose-600 text-white",
    dotConnected: "bg-emerald-500",
    dotDisconnected: "bg-slate-300",
  },
] as const;

function paletteIndex(lineId: number): number {
  return ((lineId - 1) % LINE_PALETTE.length + LINE_PALETTE.length) % LINE_PALETTE.length;
}

function getPalette(lineId: number): LineColorSet {
  return LINE_PALETTE[paletteIndex(lineId)];
}

export function getLineBadgeClass(lineId: number): string {
  return getPalette(lineId).badge;
}

export function getLineChipClass(lineId: number): string {
  return getPalette(lineId).chip;
}

export function getLineActiveClass(lineId: number): string {
  return getPalette(lineId).active;
}

export function getLineStatusDotClass(_lineId: number, connected: boolean): string {
  if (connected) return "bg-emerald-500";
  return "bg-red-600 animate-blink-line-dot";
}
