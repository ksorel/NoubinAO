-- Modèle de données Appel d'Offres (Module 3)

create type statut_pipeline_ao as enum (
  'identifie', 'en_preparation', 'soumis', 'en_attente', 'gagne', 'perdu'
);

create type statut_traitement_ao as enum (
  'en_attente', 'normalisation', 'extraction', 'termine', 'erreur'
);

create table appel_offres (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  titre text,
  acheteur text,
  secteur text,
  date_limite timestamptz,
  montant_caution numeric,
  statut_pipeline statut_pipeline_ao not null default 'identifie',
  statut_traitement statut_traitement_ao not null default 'en_attente',
  erreur_traitement text,
  fichier_dao_path text not null,
  fichier_dao_nom_original text not null,
  dao_markdown text,
  sommaire_attendu text[],
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index appel_offres_entreprise_id_idx on appel_offres(entreprise_id);
create index appel_offres_statut_pipeline_idx on appel_offres(statut_pipeline);

create type type_exigence_ao as enum ('piece_requise', 'critere_evaluation');

create table exigence_ao (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  type_exigence type_exigence_ao not null,
  libelle text not null,
  description text,
  ponderation numeric,
  source_section text,
  created_at timestamptz not null default now()
);

create index exigence_ao_appel_offres_id_idx on exigence_ao(appel_offres_id);

-- RLS

alter table appel_offres enable row level security;
alter table exigence_ao enable row level security;

create policy "appel_offres_select_membres" on appel_offres
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );

create policy "appel_offres_insert_membres" on appel_offres
  for insert with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );

create policy "appel_offres_delete_membres" on appel_offres
  for delete using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );

create policy "exigence_ao_select_membres" on exigence_ao
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = exigence_ao.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "exigence_ao_insert_membres" on exigence_ao
  for insert with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = exigence_ao.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "exigence_ao_delete_membres" on exigence_ao
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = exigence_ao.appel_offres_id and u.id = auth.uid()
    )
  );
