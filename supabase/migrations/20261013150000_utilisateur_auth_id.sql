-- Multi-entreprise par utilisateur. utilisateur.id cesse d'être = auth.uid()
-- (un compte Auth peut désormais avoir plusieurs lignes utilisateur, une
-- par entreprise) ; auth_id porte le compte Auth, id reste la clé primaire
-- référencée par les ~20 colonnes created_by/genere_par/etc. existantes
-- (aucun changement nécessaire sur ces FK : chaque ligne utilisateur
-- représente toujours "cette personne, dans cette entreprise").
-- Voir docs/superpowers/specs/2026-10-13-multi-entreprise-par-utilisateur-design.md.

alter table utilisateur drop constraint utilisateur_id_fkey;
alter table utilisateur alter column id set default gen_random_uuid();

alter table utilisateur add column auth_id uuid;
update utilisateur set auth_id = id;
alter table utilisateur alter column auth_id set not null;
alter table utilisateur
  add constraint utilisateur_auth_id_fkey foreign key (auth_id) references auth.users(id) on delete cascade;
alter table utilisateur
  add constraint utilisateur_auth_entreprise_unique unique (auth_id, entreprise_id);
create index utilisateur_auth_id_idx on utilisateur(auth_id);

-- Remplace utilisateur_entreprise_id/utilisateur_est_admin (supposaient
-- 1 ligne par auth.uid(), donc une seule entreprise) par deux fonctions
-- booléines scopées explicitement par entreprise. Même patron SECURITY
-- DEFINER qu'avant (anti-récursion RLS sur la table utilisateur elle-même,
-- voir 20260909120000_fix_utilisateur_select_membres_recursion.sql).
-- Les anciennes fonctions ne sont supprimées qu'en fin de fichier, une fois
-- que toutes les policies qui les référencent encore ont été réécrites
-- (voir commentaire plus bas, avant le bloc obtenir_invitation_publique).

create or replace function est_membre_entreprise(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from utilisateur
    where auth_id = auth.uid() and entreprise_id = p_entreprise_id
  );
$$;

create or replace function est_admin_entreprise(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from utilisateur
    where auth_id = auth.uid() and entreprise_id = p_entreprise_id and role = 'admin'
  );
$$;

-- Réécriture mécanique des policies existantes : remplacement de token
-- (u.id = auth.uid() -> u.auth_id = auth.uid(), <col> = auth.uid() -> <col>
-- in (select id from utilisateur where auth_id = auth.uid()) pour chaque
-- colonne FK vers utilisateur(id)). Structure de jointure et ordre des AND
-- inchangés partout — généré et vérifié statement par statement contre
-- pg_policies (91 policies au total, voir le spec pour la méthode).

alter policy "appel_offres_delete_membres" on appel_offres
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = appel_offres.entreprise_id) AND (u.auth_id = auth.uid())))));

alter policy "appel_offres_insert_membres" on appel_offres
  with check ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = appel_offres.entreprise_id) AND (u.auth_id = auth.uid())))));

alter policy "appel_offres_select_membres" on appel_offres
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = appel_offres.entreprise_id) AND (u.auth_id = auth.uid())))));

alter policy "appel_offres_update_membres" on appel_offres
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = appel_offres.entreprise_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = appel_offres.entreprise_id) AND (u.auth_id = auth.uid())))));

alter policy "avis_ao_national_write_super_admin" on avis_ao_national
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin))))
  with check ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin))));

alter policy "avis_importation_insert_membres" on avis_ao_national_importation
  with check ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND (u.entreprise_id = avis_ao_national_importation.entreprise_id)))));

alter policy "avis_importation_select_membres" on avis_ao_national_importation
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND (u.entreprise_id = avis_ao_national_importation.entreprise_id)))));

alter policy "bomp_numero_write_super_admin" on bomp_numero
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin))))
  with check ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin))));

alter policy "checklist_item_dossier_delete_membres" on checklist_item_dossier
  using ((EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = checklist_item_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid())))));

alter policy "checklist_item_dossier_insert_membres" on checklist_item_dossier
  with check (((coche_par in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = checklist_item_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid()))))));

alter policy "checklist_item_dossier_select_membres" on checklist_item_dossier
  using ((EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = checklist_item_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid())))));

alter policy "compte_email_connecte_delete_self" on compte_email_connecte
  using ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())));

alter policy "compte_email_connecte_insert_self" on compte_email_connecte
  with check ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())));

alter policy "compte_email_connecte_select_self" on compte_email_connecte
  using ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())));

alter policy "compte_email_connecte_update_self" on compte_email_connecte
  using ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())));

alter policy "cv_transforme_delete_membres" on cv_transforme
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = cv_transforme.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "cv_transforme_insert_membres" on cv_transforme
  with check (((genere_par in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = cv_transforme.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "cv_transforme_select_membres" on cv_transforme
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = cv_transforme.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "cv_transforme_update_membres" on cv_transforme
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = cv_transforme.appel_offres_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = cv_transforme.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "document_delete_membres" on document
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = document.entreprise_id) AND (u.auth_id = auth.uid())))));

alter policy "document_insert_membres" on document
  with check ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = document.entreprise_id) AND (u.auth_id = auth.uid())))));

alter policy "document_select_membres" on document
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = document.entreprise_id) AND (u.auth_id = auth.uid())))));

alter policy "dossier_reponse_delete_membres" on dossier_reponse
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = dossier_reponse.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "dossier_reponse_insert_membres" on dossier_reponse
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = dossier_reponse.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "dossier_reponse_select_membres" on dossier_reponse
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = dossier_reponse.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "dossier_reponse_update_membres" on dossier_reponse
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = dossier_reponse.appel_offres_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = dossier_reponse.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "email_select_equipe_si_rattache" on email
  using (((appel_offres_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = email.entreprise_id) AND (u.auth_id = auth.uid()))))));

alter policy "email_select_self" on email
  using ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())));

alter policy "entreprise_select_membres" on entreprise
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = entreprise.id) AND (u.auth_id = auth.uid())))));

alter policy "entreprise_update_membres" on entreprise
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = entreprise.id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.entreprise_id = entreprise.id) AND (u.auth_id = auth.uid())))));

alter policy "evaluation_go_no_go_insert_membres" on evaluation_go_no_go
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = evaluation_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "evaluation_go_no_go_select_membres" on evaluation_go_no_go
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = evaluation_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "evaluation_go_no_go_update_membres" on evaluation_go_no_go
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = evaluation_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid())))))
  with check (((modifie_par in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = evaluation_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "exigence_ao_delete_membres" on exigence_ao
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = exigence_ao.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "exigence_ao_insert_membres" on exigence_ao
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = exigence_ao.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "exigence_ao_select_membres" on exigence_ao
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = exigence_ao.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "exigence_document_delete_membres" on exigence_document
  using ((EXISTS ( SELECT 1
   FROM ((exigence_ao ea
     JOIN appel_offres ao ON ((ao.id = ea.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ea.id = exigence_document.exigence_ao_id) AND (u.auth_id = auth.uid())))));

alter policy "exigence_document_insert_membres" on exigence_document
  with check ((EXISTS ( SELECT 1
   FROM ((exigence_ao ea
     JOIN appel_offres ao ON ((ao.id = ea.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ea.id = exigence_document.exigence_ao_id) AND (u.auth_id = auth.uid())))));

alter policy "exigence_document_select_membres" on exigence_document
  using ((EXISTS ( SELECT 1
   FROM ((exigence_ao ea
     JOIN appel_offres ao ON ((ao.id = ea.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ea.id = exigence_document.exigence_ao_id) AND (u.auth_id = auth.uid())))));

alter policy "fichier_dao_supplementaire_delete_membres" on fichier_dao_supplementaire
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = fichier_dao_supplementaire.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "fichier_dao_supplementaire_insert_membres" on fichier_dao_supplementaire
  with check (((created_by in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = fichier_dao_supplementaire.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "fichier_dao_supplementaire_select_membres" on fichier_dao_supplementaire
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = fichier_dao_supplementaire.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "jalon_retroplanning_delete_membres" on jalon_retroplanning
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = jalon_retroplanning.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "jalon_retroplanning_insert_membres" on jalon_retroplanning
  with check (((created_by in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = jalon_retroplanning.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "jalon_retroplanning_select_membres" on jalon_retroplanning
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = jalon_retroplanning.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "jalon_retroplanning_update_membres" on jalon_retroplanning
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = jalon_retroplanning.appel_offres_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = jalon_retroplanning.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "ligne_bpu_delete_membres" on ligne_bpu
  using ((EXISTS ( SELECT 1
   FROM ((section_bpu sb
     JOIN appel_offres ao ON ((ao.id = sb.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sb.id = ligne_bpu.section_bpu_id) AND (u.auth_id = auth.uid())))));

alter policy "ligne_bpu_insert_membres" on ligne_bpu
  with check (((created_by in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM ((section_bpu sb
     JOIN appel_offres ao ON ((ao.id = sb.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sb.id = ligne_bpu.section_bpu_id) AND (u.auth_id = auth.uid()))))));

alter policy "ligne_bpu_select_membres" on ligne_bpu
  using ((EXISTS ( SELECT 1
   FROM ((section_bpu sb
     JOIN appel_offres ao ON ((ao.id = sb.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sb.id = ligne_bpu.section_bpu_id) AND (u.auth_id = auth.uid())))));

alter policy "ligne_bpu_update_membres" on ligne_bpu
  using ((EXISTS ( SELECT 1
   FROM ((section_bpu sb
     JOIN appel_offres ao ON ((ao.id = sb.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sb.id = ligne_bpu.section_bpu_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM ((section_bpu sb
     JOIN appel_offres ao ON ((ao.id = sb.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sb.id = ligne_bpu.section_bpu_id) AND (u.auth_id = auth.uid())))));

alter policy "membre_groupement_delete_membres" on membre_groupement
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = membre_groupement.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "membre_groupement_insert_membres" on membre_groupement
  with check (((created_by in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = membre_groupement.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "membre_groupement_select_membres" on membre_groupement
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = membre_groupement.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "membre_groupement_update_membres" on membre_groupement
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = membre_groupement.appel_offres_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = membre_groupement.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "notification_select_self" on notification
  using ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())));

alter policy "notification_update_self" on notification
  using ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())))
  with check ((utilisateur_id in (select id from utilisateur where auth_id = auth.uid())));

alter policy "piece_membre_groupement_delete_membres" on piece_membre_groupement
  using ((EXISTS ( SELECT 1
   FROM ((membre_groupement mg
     JOIN appel_offres ao ON ((ao.id = mg.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((mg.id = piece_membre_groupement.membre_groupement_id) AND (u.auth_id = auth.uid())))));

alter policy "piece_membre_groupement_insert_membres" on piece_membre_groupement
  with check ((EXISTS ( SELECT 1
   FROM ((membre_groupement mg
     JOIN appel_offres ao ON ((ao.id = mg.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((mg.id = piece_membre_groupement.membre_groupement_id) AND (u.auth_id = auth.uid())))));

alter policy "piece_membre_groupement_select_membres" on piece_membre_groupement
  using ((EXISTS ( SELECT 1
   FROM ((membre_groupement mg
     JOIN appel_offres ao ON ((ao.id = mg.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((mg.id = piece_membre_groupement.membre_groupement_id) AND (u.auth_id = auth.uid())))));

alter policy "section_bpu_delete_membres" on section_bpu
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = section_bpu.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "section_bpu_insert_membres" on section_bpu
  with check (((created_by in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = section_bpu.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "section_bpu_select_membres" on section_bpu
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = section_bpu.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "section_bpu_update_membres" on section_bpu
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = section_bpu.appel_offres_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = section_bpu.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "section_document_delete_membres" on section_document
  using ((EXISTS ( SELECT 1
   FROM (((section_dossier sd
     JOIN dossier_reponse dr ON ((dr.id = sd.dossier_reponse_id)))
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sd.id = section_document.section_dossier_id) AND (u.auth_id = auth.uid())))));

alter policy "section_document_insert_membres" on section_document
  with check ((EXISTS ( SELECT 1
   FROM (((section_dossier sd
     JOIN dossier_reponse dr ON ((dr.id = sd.dossier_reponse_id)))
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sd.id = section_document.section_dossier_id) AND (u.auth_id = auth.uid())))));

alter policy "section_document_select_membres" on section_document
  using ((EXISTS ( SELECT 1
   FROM (((section_dossier sd
     JOIN dossier_reponse dr ON ((dr.id = sd.dossier_reponse_id)))
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((sd.id = section_document.section_dossier_id) AND (u.auth_id = auth.uid())))));

alter policy "section_dossier_delete_membres" on section_dossier
  using ((EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = section_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid())))));

alter policy "section_dossier_insert_membres" on section_dossier
  with check ((EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = section_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid())))));

alter policy "section_dossier_select_membres" on section_dossier
  using ((EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = section_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid())))));

alter policy "section_dossier_update_membres" on section_dossier
  using ((EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = section_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid())))))
  with check ((EXISTS ( SELECT 1
   FROM ((dossier_reponse dr
     JOIN appel_offres ao ON ((ao.id = dr.appel_offres_id)))
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((dr.id = section_dossier.dossier_reponse_id) AND (u.auth_id = auth.uid())))));

alter policy "synthese_go_no_go_insert_membres" on synthese_go_no_go
  with check (((genere_par in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = synthese_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "synthese_go_no_go_select_membres" on synthese_go_no_go
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = synthese_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid())))));

alter policy "synthese_go_no_go_update_membres" on synthese_go_no_go
  using ((EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = synthese_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid())))))
  with check (((genere_par in (select id from utilisateur where auth_id = auth.uid())) AND (EXISTS ( SELECT 1
   FROM (appel_offres ao
     JOIN utilisateur u ON ((u.entreprise_id = ao.entreprise_id)))
  WHERE ((ao.id = synthese_go_no_go.appel_offres_id) AND (u.auth_id = auth.uid()))))));

alter policy "veille_execution_select_super_admin" on veille_execution
  using ((EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin))));

alter policy "bomp_national_delete_super_admin" on storage.objects
  using (((bucket_id = 'bomp-national'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin)))));

alter policy "bomp_national_insert_super_admin" on storage.objects
  with check (((bucket_id = 'bomp-national'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin)))));

alter policy "bomp_national_select_super_admin" on storage.objects
  using (((bucket_id = 'bomp-national'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND u.super_admin)))));

alter policy "documents_delete_membres" on storage.objects
  using (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND ((u.entreprise_id)::text = (storage.foldername(objects.name))[1]))))));

alter policy "documents_insert_membres" on storage.objects
  with check (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND ((u.entreprise_id)::text = (storage.foldername(objects.name))[1]))))));

alter policy "documents_select_membres" on storage.objects
  using (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND ((u.entreprise_id)::text = (storage.foldername(objects.name))[1]))))));

alter policy "documents_update_membres" on storage.objects
  using (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND ((u.entreprise_id)::text = (storage.foldername(objects.name))[1]))))))
  with check (((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1
   FROM utilisateur u
  WHERE ((u.auth_id = auth.uid()) AND ((u.entreprise_id)::text = (storage.foldername(objects.name))[1]))))));

-- Les 7 policies suivantes utilisaient utilisateur_entreprise_id()/
-- utilisateur_est_admin() (forme fonction, pas jointure) : réécrites à la
-- main avec les nouvelles fonctions plutôt que par substitution de token.

alter policy "abonnement_select_membres" on abonnement
  using (est_membre_entreprise(entreprise_id));

alter policy "email_insert_self" on email
  with check (
    (utilisateur_id in (select id from utilisateur where auth_id = auth.uid()))
    and est_membre_entreprise(entreprise_id)
    and (
      appel_offres_id is null
      or exists (
        select 1 from appel_offres ao
        where ao.id = email.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
      )
    )
    and exists (
      select 1 from compte_email_connecte cec
      where cec.id = email.compte_email_connecte_id
        and cec.utilisateur_id in (select id from utilisateur where auth_id = auth.uid())
    )
  );

alter policy "email_update_self" on email
  using (utilisateur_id in (select id from utilisateur where auth_id = auth.uid()))
  with check (
    (utilisateur_id in (select id from utilisateur where auth_id = auth.uid()))
    and est_membre_entreprise(entreprise_id)
    and (
      appel_offres_id is null
      or exists (
        select 1 from appel_offres ao
        where ao.id = email.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
      )
    )
    and exists (
      select 1 from compte_email_connecte cec
      where cec.id = email.compte_email_connecte_id
        and cec.utilisateur_id in (select id from utilisateur where auth_id = auth.uid())
    )
  );

alter policy "invitation_equipe_insert_admin" on invitation_equipe
  with check (
    (cree_par in (select id from utilisateur where auth_id = auth.uid()))
    and est_membre_entreprise(entreprise_id)
    and est_admin_entreprise(entreprise_id)
  );

alter policy "invitation_equipe_select_admin" on invitation_equipe
  using (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

alter policy "invitation_equipe_update_admin" on invitation_equipe
  using (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id))
  with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

alter policy "utilisateur_select_membres" on utilisateur
  using (est_membre_entreprise(entreprise_id));

-- Seule policy n'ayant ni la forme jointure ni la forme fonction : compare
-- directement id (plus jamais = auth.uid() une fois la migration passée).
alter policy "utilisateur_select_self" on utilisateur
  using (auth_id = auth.uid());

-- RPC appelées par lib/entreprise/actions.ts et lib/utilisateur/actions.ts.
-- Signatures inchangées (create or replace garde les grants existants).

create or replace function creer_entreprise(p_nom text, p_rccm text, p_nom_utilisateur text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  insert into entreprise (nom, rccm) values (p_nom, p_rccm) returning id into v_entreprise_id;
  insert into utilisateur (auth_id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');
  insert into abonnement (entreprise_id) values (v_entreprise_id);
  return v_entreprise_id;
end;
$$;

create or replace function rejoindre_entreprise(p_token text, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
  v_utilisateur_id uuid;
begin
  select * into v_invitation
  from invitation_equipe
  where token = p_token and statut = 'en_attente' and expire_at > now()
  for update;

  if v_invitation is null then
    raise exception 'invitation_invalide';
  end if;

  if exists (
    select 1 from utilisateur
    where auth_id = auth.uid() and entreprise_id = v_invitation.entreprise_id
  ) then
    raise exception 'deja_membre_de_cette_entreprise';
  end if;

  insert into utilisateur (auth_id, entreprise_id, nom, role)
  values (auth.uid(), v_invitation.entreprise_id, p_nom, v_invitation.role)
  returning id into v_utilisateur_id;

  update invitation_equipe
  set statut = 'utilisee', utilisee_par = v_utilisateur_id, utilisee_at = now()
  where id = v_invitation.id;

  return v_invitation.entreprise_id;
end;
$$;

-- utilisateur_entreprise_id/utilisateur_est_admin ne peuvent être supprimées
-- qu'à partir d'ici : Postgres refuse un DROP FUNCTION tant qu'une policy en
-- dépend encore (pg_depend, deptype 'n'), et les 7 policies qui les
-- référençaient (abonnement_select_membres, email_insert_self,
-- email_update_self, invitation_equipe_insert_admin,
-- invitation_equipe_select_admin, invitation_equipe_update_admin,
-- utilisateur_select_membres) ne sont réécrites avec
-- est_membre_entreprise/est_admin_entreprise que plus haut dans ce fichier.
-- Pas de CASCADE : on ne veut surtout pas supprimer silencieusement ces
-- policies au passage.
drop function if exists utilisateur_entreprise_id(uuid);
drop function if exists utilisateur_est_admin(uuid);

-- Changement de type de retour (ajout de entreprise_id) : drop requis
-- avant de recréer, create or replace ne suffit pas pour ça.
drop function if exists obtenir_invitation_publique(text);

create or replace function obtenir_invitation_publique(p_token text)
returns table(entreprise_id uuid, entreprise_nom text, role text, valide boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
  v_valide boolean;
begin
  select * into v_invitation from invitation_equipe where token = p_token;

  if v_invitation is null then
    return query select null::uuid, null::text, null::text, false;
    return;
  end if;

  v_valide := v_invitation.statut = 'en_attente' and v_invitation.expire_at > now();

  if not v_valide then
    return query select null::uuid, null::text, null::text, false;
    return;
  end if;

  return query
  select e.id, e.nom, v_invitation.role, true
  from entreprise e
  where e.id = v_invitation.entreprise_id;
end;
$$;

grant execute on function obtenir_invitation_publique(text) to anon, authenticated;
