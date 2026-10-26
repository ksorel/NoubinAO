-- Comparatif fournisseurs (Sprint S5, parcours expert v2, voir CLAUDE.md) :
-- plusieurs cotations par ligne du BPU, pour retenir la moins-disante parmi
-- celles encore valides à la date d'exécution (lib/appels-offres/cotations.ts).
-- Même patron RLS que ligne_bpu, un niveau de jointure plus loin.
create table cotation_fournisseur (
  id uuid primary key default gen_random_uuid(),
  ligne_bpu_id uuid not null references ligne_bpu(id) on delete cascade,
  fournisseur text not null,
  prix numeric not null,
  devise text not null default 'FCFA',
  delai_jours integer,
  validite_date date,
  incoterm text,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index cotation_fournisseur_ligne_bpu_id_idx on cotation_fournisseur(ligne_bpu_id);

alter table cotation_fournisseur enable row level security;

create policy "cotation_fournisseur_select_membres" on cotation_fournisseur
  for select using (
    exists (
      select 1 from ligne_bpu lb
      join section_bpu sb on sb.id = lb.section_bpu_id
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where lb.id = cotation_fournisseur.ligne_bpu_id and u.id = auth.uid()
    )
  );

create policy "cotation_fournisseur_insert_membres" on cotation_fournisseur
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from ligne_bpu lb
      join section_bpu sb on sb.id = lb.section_bpu_id
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where lb.id = cotation_fournisseur.ligne_bpu_id and u.id = auth.uid()
    )
  );

create policy "cotation_fournisseur_delete_membres" on cotation_fournisseur
  for delete using (
    exists (
      select 1 from ligne_bpu lb
      join section_bpu sb on sb.id = lb.section_bpu_id
      join appel_offres ao on ao.id = sb.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where lb.id = cotation_fournisseur.ligne_bpu_id and u.id = auth.uid()
    )
  );
