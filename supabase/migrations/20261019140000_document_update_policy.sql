-- La table document n'avait jamais eu de policy RLS pour UPDATE (seulement
-- select/insert/delete depuis la migration fondatrice) : le renommage
-- d'un document (modifierNomDocument) était donc silencieusement bloqué
-- par RLS — 0 ligne affectée, pas d'erreur Postgres, confondu par le code
-- avec "document introuvable".
create policy "document_update_membres" on document
  for update
  using (exists (
    select 1 from utilisateur u
    where u.entreprise_id = document.entreprise_id and u.auth_id = auth.uid()
  ))
  with check (exists (
    select 1 from utilisateur u
    where u.entreprise_id = document.entreprise_id and u.auth_id = auth.uid()
  ));
