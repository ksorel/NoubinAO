export type StatutEcheance = "depassee" | "rouge" | "orange" | "vert" | null;

const JOUR_MS = 24 * 60 * 60 * 1000;

export function calculerStatutEcheance(
  dateLimite: string | null,
  maintenant: Date = new Date(),
): StatutEcheance {
  if (!dateLimite) return null;

  const limite = new Date(dateLimite);
  const joursRestants = Math.floor(
    (limite.getTime() - maintenant.getTime()) / JOUR_MS,
  );

  if (joursRestants < 0) return "depassee";
  if (joursRestants < 30) return "rouge";
  if (joursRestants < 90) return "orange";
  return "vert";
}
