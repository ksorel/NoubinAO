-- Bug pré-existant découvert lors de la revue finale du sous-projet
-- "transformation des CV" (Module 4) : storage.objects (bucket documents)
-- n'a jamais eu de policy update, alors que plusieurs Server Actions
-- (exporterDossierReponse, genererCvTransforme) utilisent upsert:true sur
-- un chemin déjà existant lors d'une régénération — une opération UPDATE
-- côté storage.objects, refusée par RLS sans cette policy. Même pattern
-- que documents_insert_membres (20260822124743_bibliotheque_documentaire.sql),
-- adapté à for update (using + with check identiques, comme requis par
-- Postgres pour une policy update scopée par entreprise).

create policy "documents_update_membres" on storage.objects
  for update
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  );
