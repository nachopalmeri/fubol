/**
 * How a subtitle's timing is explained to the person watching.
 *
 * Confidence percentages and method names meant nothing at the couch. What
 * matters is whether the timing was checked against this film's sound, only
 * estimated, or set by someone in the house, and whether it is still being
 * checked.
 */
export type SyncMethodName = "none" | "reference" | "audio" | "manual";

export function formatShift(offsetMs: number): string {
  const seconds = Math.abs(offsetMs) / 1000;
  const value = seconds.toFixed(1).replace(".", ",");
  if (offsetMs === 0) return "sin corrimiento";
  return offsetMs > 0 ? `${value} s más tarde` : `${value} s antes`;
}

export function describeSync(
  method: SyncMethodName,
  measuring: "reference" | "audio" | null,
  offsetMs: number,
): string {
  if (method === "manual") return `Ajustado a mano · ${formatShift(offsetMs)}`;
  if (method === "audio") return `Alineado con el audio de esta copia · ${formatShift(offsetMs)}`;
  if (measuring === "reference") return "Comparando con otras pistas…";
  if (method === "reference") {
    return measuring === "audio"
      ? `Estimado con otras pistas · ${formatShift(offsetMs)} · midiendo contra el audio…`
      : `Estimado con otras pistas · ${formatShift(offsetMs)}`;
  }
  if (measuring === "audio") return "Midiendo contra el audio de esta copia…";
  return "Sin corregir";
}
