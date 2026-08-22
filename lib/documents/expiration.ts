export type StatutExpiration = "rouge" | "orange" | "vert" | null;

const JOUR_MS = 24 * 60 * 60 * 1000;

export function calculerStatutExpiration(
  dateExpiration: string | null,
  maintenant: Date = new Date(),
): StatutExpiration {
  if (!dateExpiration) return null;

  const expiration = new Date(dateExpiration);
  const joursRestants = Math.floor(
    (expiration.getTime() - maintenant.getTime()) / JOUR_MS,
  );

  if (joursRestants < 30) return "rouge";
  if (joursRestants < 90) return "orange";
  return "vert";
}
