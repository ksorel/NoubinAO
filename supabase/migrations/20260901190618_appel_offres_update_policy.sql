-- Politique RLS update sur appel_offres (Module 3, sous-projet 4B)
-- Reportée aux sous-projets 1 et 3 faute de besoin réel jusqu'ici.

create policy "appel_offres_update_membres" on appel_offres
  for update using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );
