-- Étape 9 "Après dépôt" (parcours expert v2, voir CLAUDE.md et
-- NoubinAO_Spec_Parcours_Expert_v2_2.md § 2) : saisie du PV d'ouverture
-- (prix des concurrents, notre rang, motif de rejet éventuel), qui alimente
-- ensuite le post-mortem enrichi (écart de prix avec l'attributaire,
-- position dans la fourchette, comparaison avec le score Go/No-Go prévu —
-- calculés à la volée côté application, pas stockés ici).
--
-- Pattern RLS : est_membre_entreprise (20261013150000), même structure que
-- go_no_go/reponse_go_no_go (20261016100000) — jamais utilisateur.id =
-- auth.uid() (voir l'avertissement de 20261023083606_point_flou_ao.sql).

create table pv_ouverture (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  attributaire_nom text,
  attributaire_prix numeric,
  notre_rang integer check (notre_rang is null or notre_rang > 0),
  motif_rejet text,
  modifie_par uuid references utilisateur(id) on delete set null,
  modifie_le timestamptz not null default now()
);

alter table pv_ouverture enable row level security;

create policy "pv_ouverture_select_membres" on pv_ouverture
  for select using (
    exists (
      select 1 from appel_offres ao
      where ao.id = pv_ouverture.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

-- Même garde-fou qu'sur go_no_go_insert_membres : modifie_par accepte NULL
-- (création vide sans auteur) ou doit correspondre à l'utilisateur courant.
create policy "pv_ouverture_insert_membres" on pv_ouverture
  for insert with check (
    (modifie_par is null or modifie_par in (select id from utilisateur where auth_id = auth.uid()))
    and exists (
      select 1 from appel_offres ao
      where ao.id = pv_ouverture.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "pv_ouverture_update_membres" on pv_ouverture
  for update
  using (
    exists (
      select 1 from appel_offres ao
      where ao.id = pv_ouverture.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    modifie_par in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from appel_offres ao
      where ao.id = pv_ouverture.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

-- Un concurrent par ligne du PV (hors attributaire, qui vit sur
-- pv_ouverture ci-dessus) — plusieurs par AO, d'où la table à part plutôt
-- que des colonnes répétées.
create table pv_ouverture_concurrent (
  id uuid primary key default gen_random_uuid(),
  pv_ouverture_id uuid not null references pv_ouverture(id) on delete cascade,
  nom text not null,
  prix numeric,
  rang integer check (rang is null or rang > 0),
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

create index pv_ouverture_concurrent_pv_ouverture_id_idx on pv_ouverture_concurrent(pv_ouverture_id);

alter table pv_ouverture_concurrent enable row level security;

create policy "pv_ouverture_concurrent_select_membres" on pv_ouverture_concurrent
  for select using (
    exists (
      select 1 from pv_ouverture pvo
      join appel_offres ao on ao.id = pvo.appel_offres_id
      where pvo.id = pv_ouverture_concurrent.pv_ouverture_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "pv_ouverture_concurrent_insert_membres" on pv_ouverture_concurrent
  for insert with check (
    exists (
      select 1 from pv_ouverture pvo
      join appel_offres ao on ao.id = pvo.appel_offres_id
      where pvo.id = pv_ouverture_concurrent.pv_ouverture_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "pv_ouverture_concurrent_update_membres" on pv_ouverture_concurrent
  for update
  using (
    exists (
      select 1 from pv_ouverture pvo
      join appel_offres ao on ao.id = pvo.appel_offres_id
      where pvo.id = pv_ouverture_concurrent.pv_ouverture_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from pv_ouverture pvo
      join appel_offres ao on ao.id = pvo.appel_offres_id
      where pvo.id = pv_ouverture_concurrent.pv_ouverture_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "pv_ouverture_concurrent_delete_membres" on pv_ouverture_concurrent
  for delete using (
    exists (
      select 1 from pv_ouverture pvo
      join appel_offres ao on ao.id = pvo.appel_offres_id
      where pvo.id = pv_ouverture_concurrent.pv_ouverture_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
