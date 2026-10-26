-- Montant de référence pour situer le total HT du BPU dans la fourchette
-- anormalement basse/haute (fourchette_prix_basse/haute, sprint S2) —
-- indicateurs chiffrage, sprint S5, parcours expert v2. Nullable : la
-- fourchette ARCOP se calcule normalement sur la moyenne des offres
-- recevables (inconnue avant dépôt) ; ce montant est une estimation
-- indicative (budget administration quand il est communiqué, ou estimation
-- interne) que l'entreprise saisit elle-même, pas une valeur extraite du
-- DAO avec certitude.
alter table appel_offres
  add column montant_estimatif numeric;

comment on column appel_offres.montant_estimatif is
  'Montant de référence (FCFA) saisi par l''entreprise pour situer son total HT dans la fourchette anormalement basse/haute — estimation indicative, pas une valeur certaine du DAO.';
