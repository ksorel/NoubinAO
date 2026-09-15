-- Rétroplanning (Module 7, sous-projet 3). Liste de jalons par AO, CRUD
-- complet (contrairement à evaluation_go_no_go, qui est 1:1, et à
-- checklist_item_dossier, un ensemble fixe de 3 clés en insert/delete)
-- — ce module a besoin d'update (bascule coché) et de delete (retrait
-- d'un jalon), pas seulement d'insert/select.
create table jalon_retroplanning (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  libelle text not null,
  date_cible date not null,
  coche boolean not null default false,
  ordre integer not null default 0,
  coche_par uuid references utilisateur(id) on delete set null,
  coche_le timestamptz,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index jalon_retroplanning_appel_offres_id_idx
  on jalon_retroplanning(appel_offres_id);

alter table jalon_retroplanning enable row level security;

create policy "jalon_retroplanning_select_membres" on jalon_retroplanning
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "jalon_retroplanning_insert_membres" on jalon_retroplanning
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise (pas de
-- contrainte sur coche_par, contrairement à evaluation_go_no_go) : ce
-- n'est pas un enregistrement unique sensible mais une liste
-- collaborative où n'importe quel membre doit pouvoir cocher/décocher
-- un jalon déjà traité par un collègue, sans que la policy ne le
-- bloque à tort en exigeant coche_par = auth.uid() sur une ligne qu'il
-- ne vient pas de cocher lui-même.
create policy "jalon_retroplanning_update_membres" on jalon_retroplanning
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "jalon_retroplanning_delete_membres" on jalon_retroplanning
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = jalon_retroplanning.appel_offres_id and u.id = auth.uid()
    )
  );
