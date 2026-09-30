import type { createServiceRoleClient } from "@/lib/supabase/service-role";

export function construireLignesNotification(
  avisNouveaux: { id: string; secteur: string | null }[],
  entreprises: { id: string; secteursActivite: string[] }[],
  utilisateursParEntreprise: Map<string, string[]>,
): { utilisateur_id: string; avis_id: string }[] {
  const lignes: { utilisateur_id: string; avis_id: string }[] = [];

  for (const avis of avisNouveaux) {
    if (avis.secteur === null) continue;

    for (const entreprise of entreprises) {
      if (!entreprise.secteursActivite.includes(avis.secteur)) continue;

      const utilisateurs = utilisateursParEntreprise.get(entreprise.id) ?? [];
      for (const utilisateurId of utilisateurs) {
        lignes.push({ utilisateur_id: utilisateurId, avis_id: avis.id });
      }
    }
  }

  return lignes;
}

type ClientServiceRole = ReturnType<typeof createServiceRoleClient>;

// Impure : lit entreprise/utilisateur en base puis écrit dans
// notification. Séparée du route handler pour rester appelable
// directement depuis un script tsx de vérification manuelle (voir
// plan, Tâche 2 Step 5) — le route handler exige une signature QStash
// valide, non reproductible facilement en local.
export async function notifierAvisPertinents(
  supabase: ClientServiceRole,
  avisNouveaux: { id: string; secteur: string | null }[],
): Promise<void> {
  const secteursDistincts = [
    ...new Set(
      avisNouveaux
        .map((a) => a.secteur)
        .filter((s): s is string => s !== null),
    ),
  ];
  if (secteursDistincts.length === 0) return;

  const { data: entreprises, error: erreurEntreprises } = await supabase
    .from("entreprise")
    .select("id, secteurs_activite")
    .overlaps("secteurs_activite", secteursDistincts);
  if (erreurEntreprises) throw erreurEntreprises;
  if (!entreprises || entreprises.length === 0) return;

  const entrepriseIds = entreprises.map((e) => e.id as string);
  const { data: utilisateurs, error: erreurUtilisateurs } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id")
    .in("entreprise_id", entrepriseIds);
  if (erreurUtilisateurs) throw erreurUtilisateurs;

  const utilisateursParEntreprise = new Map<string, string[]>();
  for (const u of utilisateurs ?? []) {
    const liste = utilisateursParEntreprise.get(u.entreprise_id as string) ?? [];
    liste.push(u.id as string);
    utilisateursParEntreprise.set(u.entreprise_id as string, liste);
  }

  const lignes = construireLignesNotification(
    avisNouveaux,
    entreprises.map((e) => ({
      id: e.id as string,
      secteursActivite: (e.secteurs_activite as string[]) ?? [],
    })),
    utilisateursParEntreprise,
  );
  if (lignes.length === 0) return;

  const { error: erreurNotification } = await supabase.from("notification").insert(lignes);
  if (erreurNotification) throw erreurNotification;
}
