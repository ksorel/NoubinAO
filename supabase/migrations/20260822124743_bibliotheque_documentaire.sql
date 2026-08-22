-- Fondations minimales : entreprise / utilisateur

create table entreprise (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  rccm text,
  created_at timestamptz not null default now()
);

create table utilisateur (
  id uuid primary key references auth.users(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  nom text not null,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create index utilisateur_entreprise_id_idx on utilisateur(entreprise_id);

-- Bibliothèque documentaire

create type document_type as enum (
  'piece_administrative',
  'reference_projet',
  'cv',
  'agrement'
);

create table document (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  type document_type not null,
  nom text not null,
  fichier_path text not null,
  fichier_nom_original text not null,
  mime_type text not null,
  taille_octets bigint not null,
  date_expiration date,
  contenu_markdown text,
  source_ocr boolean,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index document_entreprise_id_idx on document(entreprise_id);
create index document_type_idx on document(type);

-- RLS

alter table entreprise enable row level security;
alter table utilisateur enable row level security;
alter table document enable row level security;

create policy "utilisateur_select_self" on utilisateur
  for select using (id = auth.uid());

create policy "entreprise_select_membres" on entreprise
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  );

create policy "document_select_membres" on document
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = document.entreprise_id and u.id = auth.uid()
    )
  );

create policy "document_insert_membres" on document
  for insert with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = document.entreprise_id and u.id = auth.uid()
    )
  );

create policy "document_delete_membres" on document
  for delete using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = document.entreprise_id and u.id = auth.uid()
    )
  );

-- Onboarding : création atomique entreprise + utilisateur (contourne l'oeuf-et-poule RLS)

create or replace function creer_entreprise(
  p_nom text,
  p_rccm text default null,
  p_nom_utilisateur text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  if exists (select 1 from utilisateur where id = auth.uid()) then
    raise exception 'utilisateur_deja_rattache';
  end if;

  insert into entreprise (nom, rccm) values (p_nom, p_rccm)
  returning id into v_entreprise_id;

  insert into utilisateur (id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');

  return v_entreprise_id;
end;
$$;

revoke all on function creer_entreprise from public;
grant execute on function creer_entreprise to authenticated;

-- Storage : bucket privé + policies scopées par entreprise

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_select_membres" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  );

create policy "documents_insert_membres" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  );

create policy "documents_delete_membres" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and exists (
      select 1 from utilisateur u
      where u.id = auth.uid()
      and u.entreprise_id::text = (storage.foldername(name))[1]
    )
  );
