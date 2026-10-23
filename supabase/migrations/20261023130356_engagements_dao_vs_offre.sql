-- Engagements (délai de livraison, garantie, validité de l'offre) — sprint
-- S3, parcours expert v2 (voir CLAUDE.md). Deux valeurs par engagement :
-- celle exigée par le DAO (extraite par IA, éditable) et celle proposée par
-- l'entreprise dans son offre (saisie manuelle — la vision cible de la spec
-- ("F5, F11, F12... générés depuis Tender") suppose un moteur de génération
-- automatique F11/F12 pas encore construit ici, donc saisie manuelle pour
-- l'instant). Alimente le contrôle croisé ENG-01/02/03 (lib/appels-offres/
-- controle-croise.ts) : délai proposé ≤ délai exigé, garantie/validité
-- proposées ≥ exigées.

alter table appel_offres
  add column delai_livraison_max_jours integer,
  add column delai_livraison_propose_jours integer,
  add column garantie_exigee_jours integer,
  add column garantie_proposee_jours integer,
  add column validite_offre_jours integer,
  add column validite_offre_propose_jours integer;

comment on column appel_offres.delai_livraison_max_jours is
  'Délai de livraison maximal exigé par le DAO, en jours.';
comment on column appel_offres.delai_livraison_propose_jours is
  'Délai de livraison proposé par l''entreprise dans son offre, en jours — saisi manuellement.';
comment on column appel_offres.garantie_exigee_jours is
  'Durée de garantie minimale exigée par le DAO, en jours.';
comment on column appel_offres.garantie_proposee_jours is
  'Durée de garantie proposée par l''entreprise, en jours — saisie manuellement.';
comment on column appel_offres.validite_offre_jours is
  'Durée de validité de l''offre exigée par le DAO, en jours.';
comment on column appel_offres.validite_offre_propose_jours is
  'Durée de validité proposée par l''entreprise, en jours — saisie manuellement.';
