-- Secteurs d'activité choisis par l'entreprise, pour filtrer /veille aux
-- avis pertinents. Liste fermée à 4 valeurs (voir CLAUDE.md, ciblage
-- commercial déjà restreint à BTP/ingénierie/environnement/énergie-
-- climat) — validée côté application (Zod, lib/utilisateur/schema.ts),
-- pas de contrainte SQL check : même patron que appel_offres.secteur
-- (text libre sans contrainte).
alter table entreprise
  add column secteurs_activite text[] not null default '{}';
