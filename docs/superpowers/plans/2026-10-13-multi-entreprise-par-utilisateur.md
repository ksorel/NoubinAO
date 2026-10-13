# Multi-entreprise par utilisateur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un même compte Supabase Auth (un même email) d'appartenir à plusieurs entreprises NoubinAO, avec bascule explicite entre entreprises, sans toucher au comportement produit pour les utilisateurs qui n'en ont qu'une.

**Architecture:** `utilisateur` garde exactement sa forme actuelle (une ligne = une personne *dans* une entreprise, avec `entreprise_id`/`role`/`nom`) ; seule sa colonne d'identité change — `id` cesse d'être `= auth.uid()`, une nouvelle colonne `auth_id` porte le compte Auth, avec `unique(auth_id, entreprise_id)`. Les ~91 policies RLS existantes sont réécrites par un remplacement de token (`u.id = auth.uid()` → `u.auth_id = auth.uid()`, et pour chaque colonne `created_by`/`genere_par`/etc. `<col> = auth.uid()` → `<col> in (select id from utilisateur where auth_id = auth.uid())`), sans toucher à la structure des jointures. `obtenirUtilisateurCourant()` garde sa forme de retour `{id, entreprise_id, nom, role}` et résout l'entreprise active via un cookie parmi les lignes `utilisateur` du compte — tous ses appelants existants restent inchangés.

**Tech Stack:** Next.js App Router (Server Actions, Server Components), Supabase Postgres (RLS, fonctions SECURITY DEFINER), TypeScript, Zod, Vitest.

## Global Constraints

- Jamais modifier une migration historique — toute correction passe par une nouvelle migration (convention du projet, voir CLAUDE.md "Développement professionnel").
- Noms de contraintes/fonctions SQL vérifiés en base (`pg_constraint`, `pg_proc`) avant d'écrire une migration qui les droppe — jamais supposés (leçon déjà documentée dans le spec `invitation-equipe`).
- `obtenirUtilisateurCourant()` doit garder EXACTEMENT sa forme de retour actuelle (`{id, entreprise_id, nom, role} | null`) — c'est la contrainte qui limite le rayon d'impact côté TypeScript à une poignée de fichiers.
- Toute policy RLS modifiée doit l'être via `alter policy ... using (...) with check (...)` dans une seule migration consolidée, jamais en la recréant sous un autre nom.
- `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais apparaître côté client (règle projet existante, non concernée ici mais à ne pas enfreindre en écrivant les Server Actions).
- Après chaque tâche touchant la base : `npx supabase db push` depuis la racine du repo (CLI déjà lié au projet distant, confirmé dans cette session).
- Après chaque tâche touchant du code TypeScript : `npx tsc --noEmit` et `npx eslint <fichiers touchés>` doivent passer sans erreur avant de commit.

---

## Task 1: Migration — identité `utilisateur` détachée de `auth.uid()`

**Files:**
- Create: `supabase/migrations/20261013150000_utilisateur_auth_id.sql`

**Interfaces:**
- Consomme : aucune dépendance sur une tâche précédente.
- Produit : colonne `utilisateur.auth_id`, fonctions `est_membre_entreprise(uuid) returns boolean` et `est_admin_entreprise(uuid) returns boolean`, RPC `creer_entreprise`/`rejoindre_entreprise`/`obtenir_invitation_publique` mis à jour. Tous les fichiers TypeScript des tâches suivantes supposent que `auth_id` existe et que ces fonctions/RPC ont cette forme exacte.

- [ ] **Step 1: Vérifier les noms de contraintes actuels sur `utilisateur`**

Run: `npx supabase db query --linked "select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = 'public.utilisateur'::regclass;"`

Expected (déjà vérifié dans cette session, à reconfirmer avant d'écrire la migration si du temps s'est écoulé) :
```
utilisateur_entreprise_id_fkey | FOREIGN KEY (entreprise_id) REFERENCES entreprise(id) ON DELETE CASCADE
utilisateur_id_fkey            | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
utilisateur_pkey               | PRIMARY KEY (id)
utilisateur_role_check         | CHECK ((role = ANY (ARRAY['admin'::text, 'membre'::text])))
```
Si les noms diffèrent, adapter la migration de l'étape 2 en conséquence avant de continuer.

- [ ] **Step 2: Écrire la migration complète**

Créer `supabase/migrations/20261013150000_utilisateur_auth_id.sql` :

```sql
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
drop function if exists utilisateur_entreprise_id(uuid);
drop function if exists utilisateur_est_admin(uuid);

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
  where token = p_token and statut = 'en_attente' and expire_at > now();

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
```

(Le dernier `grant` reproduit celui de la fonction d'origine — `obtenir_invitation_publique` est appelée avant authentification, donc accessible à `anon`. Vérifier à l'étape 3 que ce grant existait bien avant le `drop`, sinon l'ajuster.)

- [ ] **Step 3: Vérifier le grant existant avant de pousser**

Run: `npx supabase db query --linked "select grantee, privilege_type from information_schema.routine_privileges where routine_name = 'obtenir_invitation_publique';"`

Si `anon` n'apparaît pas dans le résultat, retirer `anon` du `grant execute` final du Step 2 (ne reproduire que les grants réellement existants).

- [ ] **Step 4: Pousser la migration**

Run: `npx supabase db push`
Expected: `"migrations":["20261013150000_utilisateur_auth_id.sql"]`, pas d'erreur.

- [ ] **Step 5: Vérifier qu'aucune policy ne référence plus l'ancienne identité**

Run: `npx supabase db query --linked "select count(*) from pg_policies where schemaname in ('public','storage') and (coalesce(qual,'') like '%u.id = auth.uid()%' or coalesce(with_check,'') like '%u.id = auth.uid()%' or coalesce(qual,'') like '%utilisateur_entreprise_id%' or coalesce(with_check,'') like '%utilisateur_entreprise_id%' or coalesce(qual,'') = '(id = auth.uid())');"`

Expected: `0`.

- [ ] **Step 6: Vérifier le backfill `auth_id`**

Run: `npx supabase db query --linked "select count(*) as total, count(*) filter (where auth_id is null) as sans_auth_id from utilisateur;"`

Expected: `sans_auth_id = 0`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261013150000_utilisateur_auth_id.sql
git commit -m "feat(utilisateur): detache l'identite utilisateur.id de auth.uid()

Permet a un meme compte Auth d'avoir plusieurs lignes utilisateur (une
par entreprise). Reecrit les 91 policies RLS existantes par substitution
de token (structure de jointure inchangee), ajoute est_membre_entreprise/
est_admin_entreprise, adapte creer_entreprise/rejoindre_entreprise/
obtenir_invitation_publique."
```

---

## Task 2: `lib/utilisateur/queries.ts` — résolution multi-entreprise

**Files:**
- Modify: `lib/utilisateur/queries.ts:4-23` (fonction `obtenirUtilisateurCourant`)
- Modify: `lib/utilisateur/queries.ts` (ajout de `listerMesEntreprises`, après `obtenirUtilisateurCourant`)

**Interfaces:**
- Consomme : Task 1 (colonne `utilisateur.auth_id`).
- Produit : `obtenirUtilisateurCourant(): Promise<{id: string; entreprise_id: string; nom: string; role: RoleUtilisateur} | null>` (forme inchangée), `listerMesEntreprises(): Promise<{entreprise_id: string; nom: string; role: RoleUtilisateur}[]>`. Tâches 3, 4, 6, 7, 9 consomment ces deux fonctions.

- [ ] **Step 1: Remplacer `obtenirUtilisateurCourant`**

Dans `lib/utilisateur/queries.ts`, ajouter `import { cookies } from "next/headers";` en tête de fichier, puis remplacer les lignes 4-23 :

```ts
export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
  role: RoleUtilisateur;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const authId = authData?.claims?.sub as string | undefined;

  if (!authId) return null;

  const { data: memberships } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom, role")
    .eq("auth_id", authId)
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) return null;

  const cookieStore = await cookies();
  const entrepriseActiveId = cookieStore.get("entreprise_active_id")?.value;

  return memberships.find((m) => m.entreprise_id === entrepriseActiveId) ?? memberships[0];
}
```

- [ ] **Step 2: Ajouter `listerMesEntreprises`**

Juste après la fonction précédente, dans le même fichier :

```ts
export async function listerMesEntreprises(): Promise<
  { entreprise_id: string; nom: string; role: RoleUtilisateur }[]
> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const authId = authData?.claims?.sub as string | undefined;
  if (!authId) return [];

  const { data, error } = await supabase
    .from("utilisateur")
    .select("entreprise_id, role, entreprise:entreprise_id(nom)")
    .eq("auth_id", authId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  // Même contournement de typage que app/(app)/layout.tsx : postgrest-js
  // type l'embed `entreprise` comme un tableau par défaut sans client
  // Database-typé, alors que entreprise_id est une relation plusieurs-à-un.
  return data.map((m) => ({
    entreprise_id: m.entreprise_id as string,
    role: m.role as RoleUtilisateur,
    nom: (m.entreprise as unknown as { nom: string } | null)?.nom ?? "",
  }));
}
```

- [ ] **Step 3: Typecheck et lint**

Run: `npx tsc --noEmit && npx eslint lib/utilisateur/queries.ts`
Expected: aucune erreur.

- [ ] **Step 4: Vérification manuelle (pas de test unitaire — fonction qui ne fait qu'orchestrer des appels Supabase, déjà couverte par la vérification navigateur de la Task 9)**

Pas d'étape automatisée ici ; `obtenirUtilisateurCourant`/`listerMesEntreprises` seront exercées par toutes les pages existantes dès la Task 6.

- [ ] **Step 5: Commit**

```bash
git add lib/utilisateur/queries.ts
git commit -m "feat(utilisateur): resout l'entreprise active via cookie parmi les memberships"
```

---

## Task 3: `lib/utilisateur/actions.ts` — bascule d'entreprise + message d'erreur ciblé

**Files:**
- Modify: `lib/utilisateur/schema.ts` (ajout `changerEntrepriseActiveSchema`)
- Modify: `lib/utilisateur/actions.ts` (ajout `changerEntrepriseActive`, mise à jour `rejoindreEntreprise`)
- Test: `lib/utilisateur/schema.test.ts` (nouveau fichier)

**Interfaces:**
- Consomme : Task 2 (`obtenirUtilisateurCourant`).
- Produit : `changerEntrepriseActive(entrepriseId: string): Promise<{erreur: string} | undefined>`. Tâche 6 (switcher UI) consomme cette action.

- [ ] **Step 1: Écrire le schéma Zod et son test (failing d'abord)**

Dans `lib/utilisateur/schema.ts`, ajouter à la fin :

```ts
export const changerEntrepriseActiveSchema = z.object({
  entrepriseId: z.string().uuid("Identifiant d'entreprise invalide"),
});
export type ChangerEntrepriseActiveInput = z.infer<typeof changerEntrepriseActiveSchema>;
```

Créer `lib/utilisateur/schema.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { changerEntrepriseActiveSchema } from "./schema";

describe("changerEntrepriseActiveSchema", () => {
  it("valide un uuid", () => {
    const resultat = changerEntrepriseActiveSchema.parse({
      entrepriseId: "11111111-1111-1111-1111-111111111111",
    });
    expect(resultat.entrepriseId).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("rejette une chaîne qui n'est pas un uuid", () => {
    expect(() => changerEntrepriseActiveSchema.parse({ entrepriseId: "pas-un-uuid" })).toThrow();
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue avant l'implémentation du schéma**

(Le schéma étant déjà écrit à l'étape précédente dans le même fichier, ce test devrait déjà passer — lancer quand même pour confirmer.)

Run: `npx vitest run lib/utilisateur/schema.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Ajouter `changerEntrepriseActive` à `lib/utilisateur/actions.ts`**

Ajouter en tête de fichier : `import { cookies } from "next/headers";` et `changerEntrepriseActiveSchema` à l'import depuis `"./schema"`. Puis, après `revoquerInvitation` :

```ts
export async function changerEntrepriseActive(
  entrepriseId: string,
): Promise<{ erreur: string } | undefined> {
  const parsed = changerEntrepriseActiveSchema.safeParse({ entrepriseId });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Entreprise invalide" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const authId = authData?.claims?.sub as string | undefined;
  if (!authId) return { erreur: "Non authentifié" };

  const { data: membership } = await supabase
    .from("utilisateur")
    .select("id")
    .eq("auth_id", authId)
    .eq("entreprise_id", parsed.data.entrepriseId)
    .maybeSingle();

  if (!membership) {
    return { erreur: "Vous n'êtes pas membre de cette entreprise." };
  }

  const cookieStore = await cookies();
  cookieStore.set("entreprise_active_id", parsed.data.entrepriseId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
  redirect("/accueil");
}
```

- [ ] **Step 4: Mettre à jour le message d'erreur de `rejoindreEntreprise`**

Dans `lib/utilisateur/actions.ts:139-143`, remplacer :

```ts
  if (error) {
    if (error.message === "utilisateur_deja_rattache") {
      return { erreur: "Vous êtes déjà rattaché à une entreprise." };
    }
    return { erreur: "Ce lien d'invitation est invalide ou a expiré." };
  }
```

par :

```ts
  if (error) {
    if (error.message === "deja_membre_de_cette_entreprise") {
      return { erreur: "Vous êtes déjà membre de cette entreprise." };
    }
    return { erreur: "Ce lien d'invitation est invalide ou a expiré." };
  }
```

Et faire poser le cookie sur succès (avant le `redirect`) : remplacer `const { error } = await supabase.rpc(...)` par `const { data, error } = await supabase.rpc(...)`, puis juste avant `revalidatePath("/accueil", "layout");` ajouter :

```ts
  if (data) {
    const cookieStore = await cookies();
    cookieStore.set("entreprise_active_id", data, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }
```

(`cookies` déjà importé à l'étape 3.)

- [ ] **Step 5: Typecheck, lint, tests**

Run: `npx tsc --noEmit && npx eslint lib/utilisateur/actions.ts lib/utilisateur/schema.ts && npx vitest run lib/utilisateur`
Expected: aucune erreur, tous les tests passent.

- [ ] **Step 6: Commit**

```bash
git add lib/utilisateur/schema.ts lib/utilisateur/schema.test.ts lib/utilisateur/actions.ts
git commit -m "feat(utilisateur): action changerEntrepriseActive, message d'erreur de jonction cible"
```

---

## Task 4: `lib/entreprise/actions.ts` — cookie sur l'entreprise nouvellement créée

**Files:**
- Modify: `lib/entreprise/actions.ts`

**Interfaces:**
- Consomme : Task 1 (RPC `creer_entreprise` retourne `v_entreprise_id`).
- Produit : `creerEntreprise` pose le cookie `entreprise_active_id` sur succès. Consommé par Task 7 (nouvelle route "+ Nouvelle entreprise", qui réutilise cette action telle quelle).

- [ ] **Step 1: Capturer `data` et poser le cookie**

Dans `lib/entreprise/actions.ts`, ajouter `import { cookies } from "next/headers";` en tête, puis remplacer :

```ts
  const supabase = await createClient();
  const { error } = await supabase.rpc("creer_entreprise", {
    p_nom: parsed.data.nom,
    p_rccm: parsed.data.rccm ?? null,
    p_nom_utilisateur: parsed.data.nomUtilisateur,
  });

  if (error) {
    return { erreur: "Impossible de créer l'entreprise. Réessayez." };
  }

  revalidatePath("/accueil", "layout");
  redirect("/accueil");
```

par :

```ts
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creer_entreprise", {
    p_nom: parsed.data.nom,
    p_rccm: parsed.data.rccm ?? null,
    p_nom_utilisateur: parsed.data.nomUtilisateur,
  });

  if (error || !data) {
    return { erreur: "Impossible de créer l'entreprise. Réessayez." };
  }

  const cookieStore = await cookies();
  cookieStore.set("entreprise_active_id", data, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/accueil", "layout");
  redirect("/accueil");
```

- [ ] **Step 2: Typecheck et lint**

Run: `npx tsc --noEmit && npx eslint lib/entreprise/actions.ts`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/entreprise/actions.ts
git commit -m "feat(entreprise): bascule automatiquement vers l'entreprise nouvellement creee"
```

---

## Task 5: `app/onboarding/page.tsx` — filtre par `auth_id`

**Files:**
- Modify: `app/onboarding/page.tsx:16-19`

**Interfaces:**
- Consomme : Task 1 (colonne `auth_id`).
- Produit : aucun changement de comportement observable, juste la colonne de filtre corrigée.

- [ ] **Step 1: Remplacer le filtre**

Dans `app/onboarding/page.tsx`, remplacer :

```ts
  const { data: utilisateur, error: erreurUtilisateur } = await supabase
    .from("utilisateur")
    .select("id")
    .eq("id", authData.claims.sub)
    .maybeSingle();
```

par :

```ts
  const { data: utilisateur, error: erreurUtilisateur } = await supabase
    .from("utilisateur")
    .select("id")
    .eq("auth_id", authData.claims.sub)
    .maybeSingle();
```

(`.maybeSingle()` reste correct ici : un compte sans aucune entreprise a 0 ligne, pas plusieurs — même s'il en a ailleurs par la suite, cette page ne sert qu'à la création de la toute première.)

- [ ] **Step 2: Typecheck et lint**

Run: `npx tsc --noEmit && npx eslint app/onboarding/page.tsx`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/onboarding/page.tsx
git commit -m "fix(onboarding): filtre utilisateur par auth_id plutot que id"
```

---

## Task 6: App shell — résolution de l'entreprise active + switcher d'entreprise

Fusion volontaire de deux changements qui ne compilent pas indépendamment
(`UserMenu` gagne des props requises que seul `app/(app)/layout.tsx` peut
fournir) : les séparer en deux tâches laisserait l'une des deux dans un
état non buildable entre les deux.

**Files:**
- Modify: `app/(app)/layout.tsx`
- Modify: `components/user-menu.tsx`
- Modify: `messages/fr.json` (bloc `"UserMenu"`)
- Modify: `messages/en.json` (bloc `"UserMenu"`)

**Interfaces:**
- Consomme : Task 2 (`obtenirUtilisateurCourant`, `listerMesEntreprises`), `obtenirNomEntreprise` (déjà existante dans `lib/utilisateur/queries.ts`), Task 3 (`changerEntrepriseActive`).
- Produit : aucune nouvelle interface exportée — composant/layout terminaux de la chaîne UI.

- [ ] **Step 1: Remplacer la requête directe et le calcul d'entreprise**

Dans `app/(app)/layout.tsx`, remplacer les imports :

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
```

par :

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  obtenirUtilisateurCourant,
  obtenirNomEntreprise,
  listerMesEntreprises,
} from "@/lib/utilisateur/queries";
import { AppSidebar } from "@/components/app-sidebar";
import { UserMenu } from "@/components/user-menu";
import { NotificationBell } from "@/components/notification-bell";
```

Puis remplacer le bloc (lignes 23-50 dans la version actuelle, de `const supabase = await createClient();` jusqu'à la fin du commentaire sur le contournement de typage inclus) :

```ts
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getClaims();

  if (error || !authData?.claims) {
    redirect("/auth/login");
  }

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, nom, entreprise:entreprise_id(nom)")
    .eq("id", authData.claims.sub)
    .maybeSingle();

  if (!utilisateur) {
    redirect("/onboarding");
  }

  // Le client Supabase n'est pas typé avec un générique Database, donc
  // postgrest-js ne peut pas déduire la cardinalité de la relation à partir
  // de la seule chaîne de sélection : il type l'embed `entreprise` comme un
  // tableau (`{ nom: any }[]`) par défaut. En réalité, `entreprise_id` est
  // une relation plusieurs-à-un (chaque utilisateur appartient à une seule
  // entreprise), donc Supabase renvoie un objet unique à l'exécution. On
  // recadre le type ici plutôt que d'indexer `[0]`, ce qui serait incorrect
  // si l'hypothèse documentée sur le comportement runtime est correcte.
  const entreprise = utilisateur.entreprise as unknown as {
    nom: string;
  } | null;
```

par :

```ts
  const supabase = await createClient();
  const { data: authData, error } = await supabase.auth.getClaims();

  if (error || !authData?.claims) {
    redirect("/auth/login");
  }

  const utilisateur = await obtenirUtilisateurCourant();

  if (!utilisateur) {
    redirect("/onboarding");
  }

  const [nomEntreprise, mesEntreprises] = await Promise.all([
    obtenirNomEntreprise(utilisateur.entreprise_id),
    listerMesEntreprises(),
  ]);
```

Et dans le JSX, remplacer :

```tsx
                <UserMenu
                  nomUtilisateur={utilisateur.nom}
                  nomEntreprise={entreprise?.nom ?? ""}
                />
```

par :

```tsx
                <UserMenu
                  nomUtilisateur={utilisateur.nom}
                  nomEntreprise={nomEntreprise ?? ""}
                  mesEntreprises={mesEntreprises}
                  entrepriseActiveId={utilisateur.entreprise_id}
                />
```

- [ ] **Step 2: Ajouter les clés i18n**

Dans `messages/fr.json`, remplacer le bloc `"UserMenu"` :

```json
  "UserMenu": {
    "theme": "Thème",
    "light": "Clair",
    "dark": "Sombre",
    "system": "Système",
    "language": "Langue",
    "french": "Français",
    "english": "English",
    "logout": "Se déconnecter"
  },
```

par :

```json
  "UserMenu": {
    "theme": "Thème",
    "light": "Clair",
    "dark": "Sombre",
    "system": "Système",
    "language": "Langue",
    "french": "Français",
    "english": "English",
    "logout": "Se déconnecter",
    "entreprise": "Entreprise",
    "nouvelleEntreprise": "+ Nouvelle entreprise"
  },
```

Dans `messages/en.json`, remplacer le même bloc :

```json
  "UserMenu": {
    "theme": "Theme",
    "light": "Light",
    "dark": "Dark",
    "system": "System",
    "language": "Language",
    "french": "Français",
    "english": "English",
    "logout": "Log out"
  },
```

par :

```json
  "UserMenu": {
    "theme": "Theme",
    "light": "Light",
    "dark": "Dark",
    "system": "System",
    "language": "Language",
    "french": "Français",
    "english": "English",
    "logout": "Log out",
    "entreprise": "Company",
    "nouvelleEntreprise": "+ New company"
  },
```

(Vérifier le texte anglais exact actuel avec `grep -n "\"UserMenu\"" -A 10 messages/en.json` avant d'éditer, au cas où il diffère de ce qui précède — ne changer que l'ajout des deux dernières clés si le reste diffère.)

- [ ] **Step 3: Étendre le composant**

Dans `components/user-menu.tsx`, remplacer les imports :

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deriverInitiales } from "@/lib/utilisateur/initiales";

export function UserMenu({
  nomUtilisateur,
  nomEntreprise,
}: {
  nomUtilisateur: string;
  nomEntreprise: string;
}) {
```

par :

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deriverInitiales } from "@/lib/utilisateur/initiales";
import { changerEntrepriseActive } from "@/lib/utilisateur/actions";
import type { RoleUtilisateur } from "@/lib/utilisateur/types";
import Link from "next/link";
import { toast } from "sonner";

export function UserMenu({
  nomUtilisateur,
  nomEntreprise,
  mesEntreprises,
  entrepriseActiveId,
}: {
  nomUtilisateur: string;
  nomEntreprise: string;
  mesEntreprises: { entreprise_id: string; nom: string; role: RoleUtilisateur }[];
  entrepriseActiveId: string;
}) {
```

Puis, dans le corps du composant (avant le `return`), ajouter le handler de bascule :

```tsx
  async function basculerEntreprise(entrepriseId: string) {
    const resultat = await changerEntrepriseActive(entrepriseId);
    if (resultat && "erreur" in resultat) {
      toast.error(resultat.erreur);
    }
  }
```

(`changerEntrepriseActive` appelle `redirect()` sur succès, qui lève une
exception interne Next.js avant que la fonction ne retourne normalement —
`resultat` n'est donc défini que sur le chemin d'erreur, jamais sur un
succès. Même sémantique que `rejoindreEntreprise`, déjà utilisée ailleurs
dans le code existant.)

Puis, juste avant le bloc `<DropdownMenuGroup>` final (celui qui contient le bouton de déconnexion), insérer la nouvelle section — seulement si plus d'une entreprise :

```tsx
        {mesEntreprises.length > 1 && (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {t("entreprise")}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={entrepriseActiveId} onValueChange={basculerEntreprise}>
              {mesEntreprises.map((e) => (
                <DropdownMenuRadioItem key={e.entreprise_id} value={e.entreprise_id}>
                  {e.nom}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {e.role === "admin" ? "Admin" : "Membre"}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem asChild>
              <Link href="/entreprises/nouvelle">{t("nouvelleEntreprise")}</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
```

(Placé juste avant `<DropdownMenuGroup>` final, donc après le bloc thème/langue existant — pas besoin de condition `mounted` ici, `mesEntreprises` vient du serveur, pas de risque de désynchronisation hydratation/thème.)

- [ ] **Step 4: Mettre à jour tous les appelants existants de `UserMenu` (il n'y en a qu'un)**

Vérifier qu'aucun autre fichier n'instancie `UserMenu` :

Run: `grep -rn "<UserMenu" app components`
Expected : uniquement `app/(app)/layout.tsx` (déjà mis à jour au Step 1 de cette tâche).

- [ ] **Step 5: Typecheck et lint**

Run: `npx tsc --noEmit && npx eslint components/user-menu.tsx "app/(app)/layout.tsx"`
Expected: aucune erreur.

- [ ] **Step 6: Valider le JSON des fichiers de traduction**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/layout.tsx" components/user-menu.tsx messages/fr.json messages/en.json
git commit -m "feat(user-menu): switcher d'entreprise, visible seulement si plusieurs memberships"
```

---

## Task 7: Route "+ Nouvelle entreprise"

**Files:**
- Create: `app/(app)/entreprises/nouvelle/page.tsx`

**Interfaces:**
- Consomme : `OnboardingForm` (`app/onboarding/onboarding-form.tsx`, inchangé, réutilisé tel quel), `creerEntreprise` (Task 4, pose déjà le cookie).
- Produit : route `/entreprises/nouvelle`, cible du lien ajouté à la Task 6.

- [ ] **Step 1: Créer la page**

```tsx
import { OnboardingForm } from "@/app/onboarding/onboarding-form";

export const instant = false;

export default function NouvelleEntreprisePage() {
  return (
    <div className="flex flex-col gap-6 max-w-md">
      <h1 className="text-2xl font-bold">Créer une nouvelle entreprise</h1>
      <p className="text-muted-foreground">
        Chaque entreprise a son propre espace NoubinAO (AO, bibliothèque, pipeline).
      </p>
      <OnboardingForm />
    </div>
  );
}
```

(Dans le groupe `(app)` — contrairement à `/onboarding`, cette route est accessible uniquement à un utilisateur déjà authentifié et déjà rattaché à au moins une entreprise, donc protégée par le `redirect` existant de `app/(app)/layout.tsx` vers `/auth/login` si non authentifié.)

- [ ] **Step 2: Typecheck et lint**

Run: `npx tsc --noEmit && npx eslint "app/(app)/entreprises/nouvelle/page.tsx"`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/entreprises/nouvelle/page.tsx"
git commit -m "feat(entreprise): route de creation d'une entreprise supplementaire"
```

---

## Task 8: `app/invitation/[token]/page.tsx` — blocage ciblé

**Files:**
- Modify: `lib/utilisateur/types.ts` (ajout `entreprise_id` à `Invitation` retournée par `obtenirInvitationPublique` — en réalité un nouveau type, voir Step 1)
- Modify: `lib/utilisateur/queries.ts` (fonction `obtenirInvitationPublique`)
- Modify: `app/invitation/[token]/page.tsx:75-85`

**Interfaces:**
- Consomme : Task 1 (RPC `obtenir_invitation_publique` renvoie désormais `entreprise_id`), Task 2 (`listerMesEntreprises`).
- Produit : comportement ciblé sur la page d'invitation — fin de chaîne, aucune autre tâche n'en dépend.

- [ ] **Step 1: Étendre `obtenirInvitationPublique`**

Dans `lib/utilisateur/queries.ts`, remplacer :

```ts
export async function obtenirInvitationPublique(
  token: string,
): Promise<{ entreprise_nom: string | null; role: RoleUtilisateur | null; valide: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("obtenir_invitation_publique", { p_token: token })
    .single();

  if (error || !data) {
    return { entreprise_nom: null, role: null, valide: false };
  }

  const typedData = data as { entreprise_nom: string | null; role: RoleUtilisateur | null; valide: boolean };
  return {
    entreprise_nom: typedData.entreprise_nom,
    role: typedData.role,
    valide: typedData.valide,
  };
}
```

par :

```ts
export async function obtenirInvitationPublique(
  token: string,
): Promise<{
  entreprise_id: string | null;
  entreprise_nom: string | null;
  role: RoleUtilisateur | null;
  valide: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("obtenir_invitation_publique", { p_token: token })
    .single();

  if (error || !data) {
    return { entreprise_id: null, entreprise_nom: null, role: null, valide: false };
  }

  const typedData = data as {
    entreprise_id: string | null;
    entreprise_nom: string | null;
    role: RoleUtilisateur | null;
    valide: boolean;
  };
  return {
    entreprise_id: typedData.entreprise_id,
    entreprise_nom: typedData.entreprise_nom,
    role: typedData.role,
    valide: typedData.valide,
  };
}
```

- [ ] **Step 2: Remplacer le blocage générique par une vérification ciblée**

Dans `app/invitation/[token]/page.tsx`, remplacer l'import :

```tsx
import { obtenirInvitationPublique, obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
```

par :

```tsx
import { obtenirInvitationPublique, listerMesEntreprises } from "@/lib/utilisateur/queries";
```

Puis remplacer le bloc (lignes 75-85) :

```tsx
  const utilisateur = await obtenirUtilisateurCourant();
  if (utilisateur) {
    return (
      <PageShell titre="Déjà rattaché">
        <p className="text-sm text-muted-foreground">
          Tu es déjà rattaché à une entreprise. Un compte NoubinAO ne peut appartenir qu&apos;à
          une seule entreprise à la fois.
        </p>
      </PageShell>
    );
  }
```

par :

```tsx
  const mesEntreprises = await listerMesEntreprises();
  const dejaMembre = mesEntreprises.some((e) => e.entreprise_id === invitation.entreprise_id);
  if (dejaMembre) {
    return (
      <PageShell titre="Déjà membre">
        <p className="text-sm text-muted-foreground">
          Tu es déjà membre de cette entreprise.
        </p>
        <Button asChild className="mt-4">
          <Link href="/accueil">Retour à l&apos;accueil</Link>
        </Button>
      </PageShell>
    );
  }
```

(`Button` et `Link` sont déjà importés en tête du fichier actuel — ligne 1 `import Link from "next/link";`, ligne 3 `import { Button } from "@/components/ui/button";` — aucun nouvel import requis.)

- [ ] **Step 3: Typecheck et lint**

Run: `npx tsc --noEmit && npx eslint lib/utilisateur/queries.ts "app/invitation/[token]/page.tsx"`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/utilisateur/queries.ts "app/invitation/[token]/page.tsx"
git commit -m "fix(invitation): verifie l'appartenance a l'entreprise precise de l'invitation, pas globalement"
```

---

## Task 9: Vérification manuelle navigateur de bout en bout

**Files:** aucun (vérification, pas de code).

**Interfaces:**
- Consomme : toutes les tâches précédentes.
- Produit : confirmation que le parcours complet fonctionne réellement (pas seulement la lecture de code) — convention du projet (`noubinao_pilote_tests_sorel`) et exigence système pour les changements UI.

- [ ] **Step 1: Démarrer le serveur de dev**

Run: `npm run dev` (en arrière-plan, attendre `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` = `200`).

- [ ] **Step 2: Parcours "créer une 2e entreprise"**

Dans le navigateur, connecté avec un compte ayant déjà une entreprise :
1. Ouvrir le menu utilisateur en haut à droite → pas de section "Entreprise" (une seule membership) → confirme le comportement inchangé pour le cas courant.
2. Naviguer vers `/entreprises/nouvelle`, créer une entreprise B.
3. Vérifier la redirection vers `/accueil` et que le contenu affiché (AO, bibliothèque) est vide (nouvelle entreprise, pas celle d'avant).
4. Ouvrir le menu utilisateur → la section "Entreprise" apparaît maintenant avec 2 entrées, celle active cochée.
5. Basculer vers l'entreprise A via le switcher → redirection `/accueil`, les AO de l'entreprise A réapparaissent.

- [ ] **Step 3: Parcours "rejoindre via invitation" (reproduit le blocage original de Sorel)**

1. Depuis l'entreprise B (admin), aller sur `/parametres`, créer une invitation (`creerInvitation`), copier le lien.
2. Avec un compte qui a déjà une autre entreprise (ex. celui utilisé à l'étape 2 avec l'entreprise A), ouvrir le lien d'invitation.
3. Vérifier que le formulaire de jonction s'affiche (pas de blocage "déjà rattaché").
4. Soumettre → vérifier la redirection `/accueil` dans le contexte de l'entreprise B, et que le switcher liste désormais A et B.
5. Recliquer le même lien d'invitation → vérifier le message "Tu es déjà membre de cette entreprise." (pas d'erreur serveur).

- [ ] **Step 4: Vérifier l'absence d'erreur console**

Utiliser les outils `mcp__claude-in-chrome__read_console_messages` (pattern `error|Error`, `onlyErrors: true`) sur chaque page visitée aux étapes 2 et 3.
Expected: aucune erreur.

- [ ] **Step 5: Vérifier qu'un AO de l'entreprise A reste invisible depuis l'entreprise B**

Noter l'URL `/appels-offres/<id>` d'un AO de l'entreprise A pendant l'étape 2. Entreprise B active, naviguer directement vers cette URL.
Expected: page "introuvable" (RLS bloque — confirme l'isolation stricte entre entreprises).

- [ ] **Step 6: Arrêter le serveur de dev**

Utiliser `TaskStop` sur la tâche en arrière-plan démarrée au Step 1, puis vérifier que le port 3000 est libre (`netstat -ano | grep ":3000 " | grep LISTENING` → rien, sinon tuer le process orphelin directement comme déjà rencontré dans cette session).
