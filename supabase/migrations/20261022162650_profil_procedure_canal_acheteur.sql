-- Profil procédure × canal de dépôt × type d'acheteur (sprint S2, parcours
-- expert v2) : pilote quelles pièces/formulaires/règles de contrôle
-- s'appliquent à un AO, indépendamment de l'hypothèse "AO national +
-- SIGOMAP uniquement" (voir CLAUDE.md "Évolution en cours : Parcours
-- expert (v2)"). Nullable, même pattern que titre/acheteur/secteur sur
-- cette même table : non encore détecté/validé tant que l'extraction IA
-- ou l'utilisateur ne l'a pas renseigné.
--
-- Les valeurs liées aux bailleurs ('bailleur', 'procedure_bailleur',
-- 'portail_bailleur') sont acceptées par l'enum dès maintenant mais ne
-- sont pas détectées/activées en V1 — uniquement pour ne pas avoir à
-- migrer l'enum en V2 (CLAUDE.md : "le modèle de données enrichi est
-- pensé pour les accepter en V2 sans les activer en V1").

create type type_acheteur_ao as enum (
  'public', 'entreprise_publique', 'bailleur', 'prive', 'ong'
);

create type procedure_ao as enum (
  'ao_ouvert',
  'ao_restreint',
  'ao_deux_etapes',
  'procedure_simplifiee',
  'gre_a_gre',
  'ami',
  'demande_propositions',
  'consultation_privee',
  'procedure_bailleur'
);

create type canal_depot_ao as enum (
  'sigomap', 'papier', 'email', 'portail_acheteur', 'portail_bailleur', 'remise_main_propre'
);

alter table appel_offres
  add column type_acheteur type_acheteur_ao,
  add column procedure_marche procedure_ao,
  add column canal_depot canal_depot_ao;

comment on column appel_offres.type_acheteur is
  'Type d''acheteur (public, entreprise publique, bailleur, privé, ONG) — détecté à l''extraction, modifiable par l''utilisateur.';
comment on column appel_offres.procedure_marche is
  'Famille de procédure (AO ouvert, restreint, gré à gré, AMI...) — pilote les pièces/formulaires/règles applicables.';
comment on column appel_offres.canal_depot is
  'Canal de dépôt (SIGOMAP, papier, e-mail, portail...) — pilote le format d''export attendu.';
