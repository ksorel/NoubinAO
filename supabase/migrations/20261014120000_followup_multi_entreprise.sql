-- Suivi de la revue de branche "multi-entreprise par utilisateur" :
-- corrige deux angles morts qu'un scan pg_policies ne couvre pas (un corps
-- de fonction RPC, pas une policy ; des ACL de fonction, pas des policies)
-- plus un index devenu redondant par la même migration. Ne modifie pas
-- 20261013150000_utilisateur_auth_id.sql (déjà appliquée en production) :
-- tout se fait ici en create or replace / grants / drop index.

-- 1) importer_avis_national comparait encore utilisateur.id à auth.uid() —
-- or depuis 20261013150000, utilisateur.id n'est plus l'identifiant Auth
-- (auth_id l'est). Cette condition est donc fausse pour toute ligne
-- utilisateur créée après cette migration (nouvelle invitation acceptée ou
-- nouvelle entreprise créée) ; elle ne « marchait » encore que par
-- coïncidence pour les 6 lignes historiques où id = auth_id. Corps repris
-- à l'identique de la définition live (pg_get_functiondef), seule la
-- condition fautive est corrigée.
create or replace function public.importer_avis_national(p_avis_id uuid, p_entreprise_id uuid, p_utilisateur_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avis avis_ao_national%rowtype;
  v_appel_offres_id uuid;
begin
  if not exists (
    select 1 from utilisateur
    where id = p_utilisateur_id and entreprise_id = p_entreprise_id and auth_id = auth.uid()
  ) then
    raise exception 'Utilisateur non autorisé pour cette entreprise.';
  end if;

  select * into v_avis from avis_ao_national where id = p_avis_id;
  if not found then
    raise exception 'Avis introuvable.';
  end if;

  -- statut_traitement = 'termine' explicitement : la valeur par défaut
  -- ('en_attente') suppose qu'un fichier DAO va être normalisé puis extrait
  -- par un job QStash. Ici il n'y a NI fichier DAO NI job — cet appel_offres
  -- naît donc déjà « traité », ses champs venant du catalogue national. Sans
  -- ça l'écran de détail garde tous ses champs et son bouton désactivés à vie
  -- (appel-offres-detail.tsx n'active qu'à 'termine') et le polling de la
  -- liste (lib/appels-offres/polling.ts, 'en_attente' ∈ STATUTS_EN_COURS)
  -- tourne indéfiniment toutes les 4 s dans chaque onglet ouvert.
  insert into appel_offres (
    entreprise_id, titre, acheteur, secteur, date_limite, montant_caution,
    contact_retrait, statut_traitement, created_by
  )
  values (
    p_entreprise_id,
    v_avis.objet,
    v_avis.autorite_contractante,
    v_avis.secteur,
    v_avis.date_limite_remise_offres,
    v_avis.montant_caution,
    v_avis.contact_retrait,
    'termine',
    p_utilisateur_id
  )
  returning id into v_appel_offres_id;

  insert into avis_ao_national_importation (avis_id, entreprise_id, appel_offres_id, importe_par)
  values (p_avis_id, p_entreprise_id, v_appel_offres_id, p_utilisateur_id);

  return v_appel_offres_id;
end;
$$;

-- Signature inchangée : create or replace garde les grants existants
-- (authenticated uniquement) sur importer_avis_national, pas besoin de les
-- rejouer ici.

-- 2) Trois fonctions exposent encore EXECUTE à PUBLIC (confirmé via
-- pg_proc.proacl : entrée nue "=X/postgres"), un oubli plutôt qu'un choix :
-- - obtenir_invitation_publique avait le bon revoke+grant dans
--   20261007113614_invitation_equipe.sql, mais 20261013150000 l'a droppée
--   puis recréée (changement de type de retour) sans rejouer le revoke —
--   un DROP FUNCTION réinitialise l'ACL au défaut PUBLIC.
-- - est_membre_entreprise / est_admin_entreprise sont des créations neuves
--   de 20261013150000 qui n'ont jamais eu de revoke/grant du tout.
revoke all on function obtenir_invitation_publique(text) from public;
grant execute on function obtenir_invitation_publique(text) to anon, authenticated;

-- est_membre_entreprise/est_admin_entreprise ne sont évaluées que depuis des
-- policies RLS pour des utilisateurs déjà authentifiés : authenticated
-- suffit, anon n'a rien à y faire (contrairement à obtenir_invitation_publique,
-- appelée avant authentification depuis l'écran d'acceptation d'invitation).
revoke all on function est_membre_entreprise(uuid) from public;
grant execute on function est_membre_entreprise(uuid) to authenticated;

revoke all on function est_admin_entreprise(uuid) from public;
grant execute on function est_admin_entreprise(uuid) to authenticated;

-- 3) utilisateur_auth_id_idx (index simple sur auth_id) est redondant avec
-- la colonne de tête de l'index unique composite utilisateur_auth_entreprise_unique
-- (auth_id, entreprise_id) déjà créé par 20261013150000 : Postgres peut
-- utiliser cet index composite pour toute requête filtrant sur auth_id seul.
drop index if exists utilisateur_auth_id_idx;
