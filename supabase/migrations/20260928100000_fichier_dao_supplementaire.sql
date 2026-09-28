-- Ingestion DAO multi-fichiers. appel_offres.fichier_dao_path reste le
-- premier fichier téléversé (inchangé, tout le code existant continue de
-- fonctionner tel quel pour un AO à un seul fichier). Cette table porte
-- les fichiers 2+ d'un même DAO éclaté. type_classifie est nullable :
-- rempli après coup par traiterDao une fois la classification par
-- contenu effectuée (best-effort, pour affichage seulement — jamais relu
-- par le traitement lui-même, qui reçoit ses chemins/mimeTypes via le
-- message QStash, pas via cette table).
--
-- ENUM plutôt que text, cohérent avec statut_traitement_ao
-- (20260831140310_appel_offres.sql) — petit ensemble de valeurs fixes,
-- même patron que STATUTS_TRAITEMENT_AO/StatutTraitementAo côté TS (voir
-- TYPES_FICHIER_DAO dans classification-fichier.ts). Type et colonne
-- créés dans la même migration : pas de risque du piège ALTER TYPE
-- (mémoire noubinao_postgres_enum_vs_ts_union), qui ne concerne que
-- l'ajout d'une valeur à un enum déjà en prod.
create type type_fichier_dao as enum (
  'aao', 'is', 'dpao', 'ccag', 'ccap', 'bpu', 'non_classe'
);

create table fichier_dao_supplementaire (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  chemin_stockage text not null,
  nom_original text not null,
  type_mime text not null,
  type_classifie type_fichier_dao,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index fichier_dao_supplementaire_appel_offres_id_idx
  on fichier_dao_supplementaire(appel_offres_id);

alter table fichier_dao_supplementaire enable row level security;

create policy "fichier_dao_supplementaire_select_membres" on fichier_dao_supplementaire
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "fichier_dao_supplementaire_insert_membres" on fichier_dao_supplementaire
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "fichier_dao_supplementaire_delete_membres" on fichier_dao_supplementaire
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = fichier_dao_supplementaire.appel_offres_id and u.id = auth.uid()
    )
  );
