-- BPU détaillé (Module 7, sous-projet 4a). Bordereau des prix unitaires
-- organisé en sections (lots), chacune avec ses lignes chiffrées. CRUD
-- complet comme jalon_retroplanning (contrairement à evaluation_go_no_go,
-- 1:1, et à checklist_item_dossier, insert/delete seul) : ajout,
-- modification, réordonnancement et suppression de sections et de lignes.
create table section_bpu (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  titre text not null,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index section_bpu_appel_offres_id_idx on section_bpu(appel_offres_id);

create table ligne_bpu (
  id uuid primary key default gen_random_uuid(),
  section_bpu_id uuid not null references section_bpu(id) on delete cascade,
  code_article text,
  designation text not null,
  unite text not null,
  quantite numeric not null,
  -- Nullable : une ligne peut être structurée avant d'être chiffrée (le
  -- bordereau peut provenir du DAO avec désignation/unité/quantité déjà
  -- fixées, prix à déterminer ensuite).
  prix_unitaire numeric,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ligne_bpu_section_bpu_id_idx on ligne_bpu(section_bpu_id);

alter table section_bpu enable row level security;
alter table ligne_bpu enable row level security;

create policy "section_bpu_select_membres" on section_bpu
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "section_bpu_insert_membres" on section_bpu
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, comme
-- jalon_retroplanning_update_membres : n'importe quel membre doit pouvoir
-- renommer/réordonner une section créée par un collègue.
create policy "section_bpu_update_membres" on section_bpu
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "section_bpu_delete_membres" on section_bpu
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = section_bpu.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_select_membres" on ligne_bpu
  for select using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_insert_membres" on ligne_bpu
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, même
-- raisonnement que section_bpu_update_membres : n'importe quel membre
-- doit pouvoir corriger le prix saisi par un collègue.
create policy "ligne_bpu_update_membres" on ligne_bpu
  for update
  using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );

create policy "ligne_bpu_delete_membres" on ligne_bpu
  for delete using (
    exists (
      select 1 from section_bpu sb
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where sb.id = ligne_bpu.section_bpu_id and u.id = auth.uid()
    )
  );
