-- Groupement / co-traitance sur un AO (Module 7, lacune 5, la seule des
-- 5 lacunes identifiées vs un ebook générique sur la réponse aux AO qui
-- restait à traiter — voir mémoire noubinao_lacunes_ebook_checklist).
-- Scope volontairement informatif seulement : aucune donnée partagée
-- entre comptes entreprise, un membre du groupement (y compris notre
-- propre entreprise) n'est qu'une ligne texte dans le compte de
-- l'utilisateur. CRUD complet comme section_bpu (ajout, modification,
-- réordonnancement, suppression), pas 1:1 comme evaluation_go_no_go.
create type role_membre_groupement as enum ('mandataire', 'co_traitant');

create table membre_groupement (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  nom text not null,
  role role_membre_groupement not null,
  -- Nullable, comme prix_unitaire/debourse_sec : un membre peut être
  -- listé avant que la répartition du marché soit négociée.
  pourcentage numeric,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index membre_groupement_appel_offres_id_idx on membre_groupement(appel_offres_id);

-- Pièces administratives à fournir par un co-traitant, mêmes 6 clés que
-- documentées dans CLAUDE.md (bibliothèque documentaire). Existence de
-- la ligne = pièce fournie, même convention que checklist_item_dossier
-- (pas de colonne booléenne) : cocher/décocher insère/supprime la ligne.
-- Affiché côté UI uniquement pour les membres de rôle co_traitant, mais
-- rien n'empêche techniquement une ligne sur un membre mandataire — la
-- restriction est une décision d'affichage, pas une contrainte de
-- données (plus simple, évite un check contraint sur une jointure).
create type cle_piece_groupement as enum (
  'rccm',
  'carte_contribuable',
  'attestation_fiscale',
  'cnps',
  'non_faillite',
  'idu'
);

create table piece_membre_groupement (
  id uuid primary key default gen_random_uuid(),
  membre_groupement_id uuid not null references membre_groupement(id) on delete cascade,
  cle_piece cle_piece_groupement not null,
  created_at timestamptz not null default now(),
  unique (membre_groupement_id, cle_piece)
);

create index piece_membre_groupement_membre_id_idx on piece_membre_groupement(membre_groupement_id);

alter table membre_groupement enable row level security;
alter table piece_membre_groupement enable row level security;

create policy "membre_groupement_select_membres" on membre_groupement
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "membre_groupement_insert_membres" on membre_groupement
  for insert with check (
    created_by = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

-- WITH CHECK volontairement limité à l'appartenance entreprise, comme
-- section_bpu_update_membres : n'importe quel membre de l'équipe doit
-- pouvoir corriger une ligne créée par un collègue.
create policy "membre_groupement_update_membres" on membre_groupement
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "membre_groupement_delete_membres" on membre_groupement
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = membre_groupement.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "piece_membre_groupement_select_membres" on piece_membre_groupement
  for select using (
    exists (
      select 1 from membre_groupement mg
      join appel_offres ao on ao.id = mg.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where mg.id = piece_membre_groupement.membre_groupement_id and u.id = auth.uid()
    )
  );

create policy "piece_membre_groupement_insert_membres" on piece_membre_groupement
  for insert with check (
    exists (
      select 1 from membre_groupement mg
      join appel_offres ao on ao.id = mg.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where mg.id = piece_membre_groupement.membre_groupement_id and u.id = auth.uid()
    )
  );

create policy "piece_membre_groupement_delete_membres" on piece_membre_groupement
  for delete using (
    exists (
      select 1 from membre_groupement mg
      join appel_offres ao on ao.id = mg.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where mg.id = piece_membre_groupement.membre_groupement_id and u.id = auth.uid()
    )
  );
