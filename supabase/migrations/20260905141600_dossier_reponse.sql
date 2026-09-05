-- Modèle de données Dossier de réponse (Module 4, sous-projet 1)

create type statut_relecture_dossier as enum ('brouillon', 'relu', 'exporte');

create table dossier_reponse (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  statut_relecture statut_relecture_dossier not null default 'brouillon',
  export_path text,
  exporte_le timestamptz,
  created_at timestamptz not null default now()
);

create table exigence_document (
  id uuid primary key default gen_random_uuid(),
  exigence_ao_id uuid not null references exigence_ao(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (exigence_ao_id, document_id)
);

create index exigence_document_exigence_ao_id_idx on exigence_document(exigence_ao_id);
create index exigence_document_document_id_idx on exigence_document(document_id);

-- Migration de rattrapage : crée les dossier_reponse manquants pour les AO
-- déjà 'termine' avant l'existence de cette table (ex. DAO Mairie de Dabou).
insert into dossier_reponse (appel_offres_id)
select id from appel_offres
where statut_traitement = 'termine'
  and id not in (select appel_offres_id from dossier_reponse);

-- RLS

alter table dossier_reponse enable row level security;
alter table exigence_document enable row level security;

create policy "dossier_reponse_select_membres" on dossier_reponse
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "dossier_reponse_insert_membres" on dossier_reponse
  for insert with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "dossier_reponse_delete_membres" on dossier_reponse
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "exigence_document_select_membres" on exigence_document
  for select using (
    exists (
      select 1 from exigence_ao ea
      join appel_offres ao on ao.id = ea.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ea.id = exigence_document.exigence_ao_id and u.id = auth.uid()
    )
  );

create policy "exigence_document_insert_membres" on exigence_document
  for insert with check (
    exists (
      select 1 from exigence_ao ea
      join appel_offres ao on ao.id = ea.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ea.id = exigence_document.exigence_ao_id and u.id = auth.uid()
    )
  );

create policy "exigence_document_delete_membres" on exigence_document
  for delete using (
    exists (
      select 1 from exigence_ao ea
      join appel_offres ao on ao.id = ea.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ea.id = exigence_document.exigence_ao_id and u.id = auth.uid()
    )
  );
