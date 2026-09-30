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
