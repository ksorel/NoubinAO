-- Corrige cotation_fournisseur (20261026090000) : les 3 policies utilisaient
-- encore "u.id = auth.uid()" et l'insert "created_by = auth.uid()", le motif
-- devenu faux depuis 20261013150000_utilisateur_auth_id.sql (utilisateur.id
-- n'est plus l'identifiant Auth, auth_id l'est ; created_by stocke
-- utilisateur.id, jamais auth.uid() — voir lib/appels-offres/actions.ts,
-- ajouterCotation). Ne « marchait » que par coïncidence pour les comptes
-- créés avant cette migration (id = auth_id à l'origine) ; cassé pour tout
-- compte créé depuis (nouvelle invitation acceptée, nouvelle entreprise).
-- Même avertissement déjà écrit dans 20261023083606_point_flou_ao.sql,
-- repassé inaperçu trois jours plus tard sur cette table — reprend le motif
-- est_membre_entreprise de ce fichier.

drop policy "cotation_fournisseur_select_membres" on cotation_fournisseur;
drop policy "cotation_fournisseur_insert_membres" on cotation_fournisseur;
drop policy "cotation_fournisseur_delete_membres" on cotation_fournisseur;

create policy "cotation_fournisseur_select_membres" on cotation_fournisseur
  for select using (
    exists (
      select 1 from ligne_bpu lb
      join section_bpu sb on sb.id = lb.section_bpu_id
      join appel_offres ao on ao.id = sb.appel_offres_id
      where lb.id = cotation_fournisseur.ligne_bpu_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "cotation_fournisseur_insert_membres" on cotation_fournisseur
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from ligne_bpu lb
      join section_bpu sb on sb.id = lb.section_bpu_id
      join appel_offres ao on ao.id = sb.appel_offres_id
      where lb.id = cotation_fournisseur.ligne_bpu_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "cotation_fournisseur_delete_membres" on cotation_fournisseur
  for delete using (
    exists (
      select 1 from ligne_bpu lb
      join section_bpu sb on sb.id = lb.section_bpu_id
      join appel_offres ao on ao.id = sb.appel_offres_id
      where lb.id = cotation_fournisseur.ligne_bpu_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
