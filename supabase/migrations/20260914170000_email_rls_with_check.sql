-- Durcit email_update_self et email_insert_self avec un WITH CHECK
-- explicite. En Postgres, une policy `for update` sans `with check`
-- réutilise l'expression `using` comme `with check` — email_update_self
-- (20260914150000) n'avait que `using (utilisateur_id = auth.uid())`,
-- ce qui laissait entreprise_id et appel_offres_id librement réécrivables
-- sur une ligne qu'on possède : un attaquant connaissant l'entreprise_id
-- d'une entreprise tierce aurait pu y injecter un faux email dans son fil
-- de suivi. email_insert_self (20260914120000) avait le même problème
-- symétrique en insertion (aucune vérification de cohérence entreprise_id
-- / appel_offres_id).
--
-- On réutilise utilisateur_entreprise_id(uuid), la fonction SECURITY
-- DEFINER déjà en place (20260909120000) pour contourner la récursion RLS
-- lors de la résolution de l'entreprise_id de l'utilisateur courant.

drop policy "email_update_self" on email;

create policy "email_update_self" on email
  for update using (
    utilisateur_id = auth.uid()
  ) with check (
    utilisateur_id = auth.uid()
    and entreprise_id = utilisateur_entreprise_id(auth.uid())
    and (
      appel_offres_id is null
      or exists (
        select 1 from appel_offres ao
        where ao.id = email.appel_offres_id
          and ao.entreprise_id = utilisateur_entreprise_id(auth.uid())
      )
    )
  );

drop policy "email_insert_self" on email;

create policy "email_insert_self" on email
  for insert with check (
    utilisateur_id = auth.uid()
    and entreprise_id = utilisateur_entreprise_id(auth.uid())
    and (
      appel_offres_id is null
      or exists (
        select 1 from appel_offres ao
        where ao.id = email.appel_offres_id
          and ao.entreprise_id = utilisateur_entreprise_id(auth.uid())
      )
    )
  );
