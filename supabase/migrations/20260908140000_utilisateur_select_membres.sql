-- Complète utilisateur_select_self (20260822124743) : une policy RLS qui ne
-- permet à un utilisateur de lire QUE sa propre ligne empêche de facto toute
-- fonctionnalité listant les collègues (ex. listerUtilisateurs, assignation
-- de responsable) — découvert par la revue finale du complément Module 5
-- "responsable assigné". Policy permissive supplémentaire, s'ajoute à
-- utilisateur_select_self (OR logique entre policies permissives du même
-- type de commande) sans la remplacer.
create policy "utilisateur_select_membres" on utilisateur
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = utilisateur.entreprise_id and u.id = auth.uid()
    )
  );
