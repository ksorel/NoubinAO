-- Modèle de données Sections rédactionnelles (Module 4, sous-projet 4)

create type statut_section_dossier as enum ('brouillon', 'validee');

create table section_dossier (
  id uuid primary key default gen_random_uuid(),
  dossier_reponse_id uuid not null references dossier_reponse(id) on delete cascade,
  titre text not null,
  contenu text,
  statut statut_section_dossier not null default 'brouillon',
  generated_at timestamptz,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dossier_reponse_id, titre)
);

create table section_document (
  id uuid primary key default gen_random_uuid(),
  section_dossier_id uuid not null references section_dossier(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (section_dossier_id, document_id)
);

create index section_document_document_id_idx on section_document(document_id);

-- RLS

alter table section_dossier enable row level security;
alter table section_document enable row level security;

create policy "section_dossier_select_membres" on section_dossier
  for select using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

create policy "section_dossier_insert_membres" on section_dossier
  for insert with check (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

-- Policy update présente dès la création de cette table (contrairement à
-- dossier_reponse, où son absence a dû être corrigée par une migration de
-- rattrapage au sous-projet 3) : section_dossier a besoin d'UPDATE dès le
-- premier usage (changement de statut, régénération) — la leçon est
-- appliquée directement ici.
create policy "section_dossier_update_membres" on section_dossier
  for update using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

create policy "section_dossier_delete_membres" on section_dossier
  for delete using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = section_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

create policy "section_document_select_membres" on section_document
  for select using (
    exists (
      select 1 from section_dossier sd
      join dossier_reponse dr on dr.id = sd.dossier_reponse_id
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sd.id = section_document.section_dossier_id and u.id = auth.uid()
    )
  );

create policy "section_document_insert_membres" on section_document
  for insert with check (
    exists (
      select 1 from section_dossier sd
      join dossier_reponse dr on dr.id = sd.dossier_reponse_id
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sd.id = section_document.section_dossier_id and u.id = auth.uid()
    )
  );

create policy "section_document_delete_membres" on section_document
  for delete using (
    exists (
      select 1 from section_dossier sd
      join dossier_reponse dr on dr.id = sd.dossier_reponse_id
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sd.id = section_document.section_dossier_id and u.id = auth.uid()
    )
  );
