// La Côte d'Ivoire est en GMT (UTC+0) et les fonctions serverless Vercel
// tournent en UTC — traiter une date ISO comme équivalente à l'heure
// locale est donc correct pour ce marché, sans conversion de fuseau.
export function versValeurDatetimeLocal(dateIso: string | null): string {
  if (!dateIso) return "";
  return new Date(dateIso).toISOString().slice(0, 16);
}
