-- Responsable assigné (Module 5) — pas de nouvelle policy RLS requise :
-- appel_offres_update_membres (20260901190618) couvre déjà toute colonne.
alter table appel_offres
  add column assigne_a uuid references utilisateur(id) on delete set null;
