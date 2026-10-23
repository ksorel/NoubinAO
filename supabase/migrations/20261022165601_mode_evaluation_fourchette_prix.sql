-- Mode d'évaluation + paramètres de prix (sprint S2, parcours expert v2,
-- voir CLAUDE.md "Évolution en cours : Parcours expert (v2)"). Nullable,
-- même pattern que le profil procédure×canal×acheteur sur cette même
-- table : non encore détecté/validé tant que l'extraction IA ou
-- l'utilisateur ne l'a pas renseigné.
--
-- Les pourcentages sont stockés tels quels (80 = 80 %, pas 0.80) : pas de
-- moteur de calcul consommateur pour l'instant (chiffrage = sprint S5),
-- donc pas de raison de normaliser en ratio avant d'en avoir besoin.

create type mode_evaluation_ao as enum ('points', 'conformite_moins_disant');

alter table appel_offres
  add column mode_evaluation mode_evaluation_ao,
  add column fourchette_prix_basse numeric,
  add column fourchette_prix_haute numeric,
  add column variation_quantite_hausse numeric,
  add column variation_quantite_baisse numeric,
  add column taux_redevance_reglementation numeric,
  add column timbre_requis boolean;

comment on column appel_offres.mode_evaluation is
  'Barème à points ou offre conforme la moins-disante — pilote l''affichage de l''évaluation (barres de pondération vs liste conforme/non conforme).';
comment on column appel_offres.fourchette_prix_basse is
  'Borne basse (%) de la fourchette des offres anormalement basses, ex. 80.';
comment on column appel_offres.fourchette_prix_haute is
  'Borne haute (%) de la fourchette des offres anormalement élevées, ex. 110.';
comment on column appel_offres.variation_quantite_hausse is
  'Variation maximale des quantités à la hausse admise par le DAO (%).';
comment on column appel_offres.variation_quantite_baisse is
  'Variation maximale des quantités à la baisse admise par le DAO (%).';
comment on column appel_offres.taux_redevance_reglementation is
  'Redevance de régulation ARCOP (%), marché public uniquement (ex. 0.5).';
comment on column appel_offres.timbre_requis is
  'Timbre fiscal exigé sur la lettre de soumission (marché public ivoirien, ex. 1000 FCFA).';
