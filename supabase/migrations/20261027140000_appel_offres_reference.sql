-- Sprint S7, parcours expert v2 (voir CLAUDE.md, Étape 5.3) : association
-- entre un AO et les références du catalogue entreprise retenues pour ce
-- dossier précis — même rôle que article_produit (sprint S6) pour les
-- produits : reference_projet est un catalogue réutilisable, cette table
-- dit quelles références font partie du dossier en cours.

create table appel_offres_reference (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  reference_projet_id uuid not null references reference_projet(id) on delete cascade,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (appel_offres_id, reference_projet_id)
);

create index appel_offres_reference_appel_offres_id_idx on appel_offres_reference(appel_offres_id);
create index appel_offres_reference_reference_projet_id_idx on appel_offres_reference(reference_projet_id);

alter table appel_offres_reference enable row level security;

create policy "appel_offres_reference_select_membres" on appel_offres_reference
  for select using (
    exists (
      select 1 from appel_offres ao
      where ao.id = appel_offres_reference.appel_offres_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "appel_offres_reference_insert_membres" on appel_offres_reference
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from appel_offres ao
      where ao.id = appel_offres_reference.appel_offres_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "appel_offres_reference_delete_membres" on appel_offres_reference
  for delete using (
    exists (
      select 1 from appel_offres ao
      where ao.id = appel_offres_reference.appel_offres_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );
