-- Améliorations de re-review sur email_update_self / email_insert_self
-- (définies avec WITH CHECK explicite dans 20260914170000, déjà appliquée
-- sur le projet Supabase distant — cette migration ne modifie pas ce
-- fichier-là, elle recrée les deux policies par-dessus).
--
-- 1. Perf (Minor) : chaque appel à utilisateur_entreprise_id(auth.uid())
--    était fait en dehors d'un sous-select, ce qui force Postgres à
--    ré-évaluer la fonction à CHAQUE LIGNE évaluée par la policy (2 à 3
--    fois par ligne ici) même si elle est `stable` et que son résultat ne
--    change pas pour la durée de la requête. Le pattern recommandé par
--    Supabase/Postgres pour forcer une évaluation unique par requête (mise
--    en cache par l'optimiseur) est d'envelopper l'appel dans un sous-select :
--    (select utilisateur_entreprise_id(auth.uid())). `auth.uid()` seul
--    reste tel quel (déjà optimal, et l'enveloppe de l'appel de fonction
--    l'inclut de toute façon).
--
-- 2. Sécurité (Minor) : le WITH CHECK ne contraignait pas
--    compte_email_connecte_id. Un membre de l'entreprise connaissant
--    l'UUID du compte_email_connecte d'un collègue de la même entreprise
--    pouvait donc forger/déplacer une ligne `email` vers le compte email
--    d'un collègue (pas de fuite inter-entreprises — compte_email_connecte
--    est lui-même isolé par entreprise via utilisateur_id/RLS propre — mais
--    une incohérence de propriété au sein de la même équipe). On ajoute une
--    4ème condition : compte_email_connecte_id doit appartenir à
--    l'utilisateur appelant (compte_email_connecte.utilisateur_id =
--    auth.uid(), colonne confirmée dans 20260909150000_compte_email_connecte.sql).

drop policy "email_update_self" on email;

create policy "email_update_self" on email
  for update using (
    utilisateur_id = auth.uid()
  ) with check (
    utilisateur_id = auth.uid()
    and entreprise_id = (select utilisateur_entreprise_id(auth.uid()))
    and (
      appel_offres_id is null
      or exists (
        select 1 from appel_offres ao
        where ao.id = email.appel_offres_id
          and ao.entreprise_id = (select utilisateur_entreprise_id(auth.uid()))
      )
    )
    and exists (
      select 1 from compte_email_connecte cec
      where cec.id = email.compte_email_connecte_id
        and cec.utilisateur_id = auth.uid()
    )
  );

drop policy "email_insert_self" on email;

create policy "email_insert_self" on email
  for insert with check (
    utilisateur_id = auth.uid()
    and entreprise_id = (select utilisateur_entreprise_id(auth.uid()))
    and (
      appel_offres_id is null
      or exists (
        select 1 from appel_offres ao
        where ao.id = email.appel_offres_id
          and ao.entreprise_id = (select utilisateur_entreprise_id(auth.uid()))
      )
    )
    and exists (
      select 1 from compte_email_connecte cec
      where cec.id = email.compte_email_connecte_id
        and cec.utilisateur_id = auth.uid()
    )
  );
