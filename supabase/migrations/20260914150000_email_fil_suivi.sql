-- Rattachement email <-> AO (Module 6, sous-projet 3). Une fois
-- appel_offres_id renseigné sur un email, il devient visible par toute
-- l'équipe de l'entreprise — c'est ce rattachement qui déclenche la
-- visibilité "équipe" actée au sous-projet 1, pas la synchronisation
-- elle-même (email_select_self, sous-projet 2, reste inchangée : un
-- email non rattaché reste toujours privé à son propriétaire).
create policy "email_select_equipe_si_rattache" on email
  for select using (
    appel_offres_id is not null
    and exists (
      select 1 from utilisateur u
      where u.entreprise_id = email.entreprise_id and u.id = auth.uid()
    )
  );

-- Seul le propriétaire de la connexion (celui qui a reçu l'email) peut
-- le lier/délier — un email non rattaché n'est de toute façon visible
-- que par lui (email_select_self), donc lui seul peut jamais le
-- sélectionner dans l'interface pour le lier en premier lieu.
create policy "email_update_self" on email
  for update using (utilisateur_id = auth.uid());
