-- Migration de rattrapage : la migration 20260923090000 n'a créé que les
-- policies select/insert sur le bucket "bomp-national", pas de policy
-- delete. RLS refuse par défaut, donc les appels .remove() de rollback
-- dans uploaderBomp (lib/veille/actions.ts) échouaient silencieusement,
-- laissant le fichier orphelin dans le storage à chaque échec d'insertion
-- bomp_numero ou de mise en file du découpage. Même patron que
-- documents_delete_membres (20260822124743_bibliotheque_documentaire.sql),
-- scopé au bucket bomp-national et réservé aux super_admin (comme les deux
-- autres policies déjà présentes sur ce bucket).
create policy "bomp_national_delete_super_admin" on storage.objects
  for delete using (
    bucket_id = 'bomp-national'
    and exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );
