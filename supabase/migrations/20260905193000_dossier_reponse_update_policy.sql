-- Politique RLS update sur dossier_reponse (Module 4, sous-projet 3)
-- Manquante depuis le sous-projet 1 (seuls select/insert/delete existaient) —
-- nécessaire pour que l'export puisse écrire export_path/exporte_le/statut_relecture.
-- Même patron que appel_offres_update_membres (20260901190618).

create policy "dossier_reponse_update_membres" on dossier_reponse
  for update using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );
