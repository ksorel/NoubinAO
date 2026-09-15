-- Checklist de soumission (items manuels uniquement — les vérifications
-- automatiques ne sont jamais persistées, elles sont recalculées à
-- chaque affichage depuis l'état réel du dossier, voir
-- lib/appels-offres/checklist.ts).
create type cle_checklist_item as enum (
  'pieces_signees',
  'prix_verifie',
  'depose_sigmap'
);

create table checklist_item_dossier (
  id uuid primary key default gen_random_uuid(),
  dossier_reponse_id uuid not null references dossier_reponse(id) on delete cascade,
  cle_item cle_checklist_item not null,
  -- Nullable + on delete set null (comme exigence_document.created_by) :
  -- l'item coché est un état d'équipe, pas une donnée privée — il doit
  -- rester coché même si la personne qui l'a coché quitte l'entreprise.
  coche_par uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (dossier_reponse_id, cle_item)
);

create index checklist_item_dossier_dossier_reponse_id_idx
  on checklist_item_dossier(dossier_reponse_id);

alter table checklist_item_dossier enable row level security;

-- Même pattern que exigence_document_select_membres /
-- section_document_select_membres : tout membre de l'entreprise
-- propriétaire de l'AO peut lire.
create policy "checklist_item_dossier_select_membres" on checklist_item_dossier
  for select using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = checklist_item_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

-- Comme les policies insert des tables de liaison existantes, mais avec
-- une condition supplémentaire : coche_par doit être l'appelant
-- lui-même — pas de coche_par forgé au nom d'un collègue.
create policy "checklist_item_dossier_insert_membres" on checklist_item_dossier
  for insert with check (
    coche_par = auth.uid()
    and exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = checklist_item_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );

-- N'importe quel membre de l'équipe peut décocher un item — même
-- logique que exigence_document_delete_membres (un mapping peut être
-- retiré par n'importe qui de l'équipe, pas seulement son auteur).
create policy "checklist_item_dossier_delete_membres" on checklist_item_dossier
  for delete using (
    exists (
      select 1 from dossier_reponse dr
      join appel_offres ao on ao.id = dr.appel_offres_id
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where dr.id = checklist_item_dossier.dossier_reponse_id and u.id = auth.uid()
    )
  );
