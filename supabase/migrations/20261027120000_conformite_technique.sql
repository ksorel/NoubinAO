-- Sprint S6, parcours expert v2 (voir CLAUDE.md), Étape 5.2 "Conformité
-- article par article (miroir)" : articles du DAO (TenderArticle), lignes
-- de spécification exigées (SpecLine), produits proposés réutilisables
-- entre AO (Product) et leurs caractéristiques (ProductSpec), association
-- article <-> produit comparé/retenu, et dérogation manuelle à la
-- conformité calculée (ComplianceCheck).
--
-- Pattern RLS : est_membre_entreprise (20261013150000), jamais
-- utilisateur.id = auth.uid() (voir 20261023083606_point_flou_ao.sql et le
-- correctif 20261027100000_fix_cotation_fournisseur_rls.sql).
--
-- Pièces jointes produit (fiche technique, autorisation fabricant,
-- certificat d'étalonnage) stockées en colonnes directes sur `produit`
-- (même patron que entreprise.logo_path / appel_offres.modele_cv_path),
-- pas via la bibliothèque documentaire : un produit est réutilisable entre
-- AO mais n'a pas la sémantique "pièce administrative de l'entreprise" de
-- la table `document`, et son flux d'upload (une pièce jointe par produit,
-- depuis le tableau de conformité) n'a rien à voir avec l'écran bibliothèque.

create type operateur_specification as enum ('>=', '<=', '=', 'includes');

create table article_dao (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  numero text,
  designation text not null,
  unite text not null,
  quantite numeric not null,
  -- Signale "in_bpu" (spec TenderArticle) : présent si cet article a été
  -- rattaché à une ligne du BPU. Pas de colonne in_dqe distincte — ce
  -- produit n'a pas de DQE séparé du BPU (voir bpu.sql).
  ligne_bpu_id uuid references ligne_bpu(id) on delete set null,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index article_dao_appel_offres_id_idx on article_dao(appel_offres_id);

create table ligne_specification (
  id uuid primary key default gen_random_uuid(),
  article_dao_id uuid not null references article_dao(id) on delete cascade,
  libelle text not null,
  operateur operateur_specification not null,
  valeur text not null,
  unite text,
  source_section text,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index ligne_specification_article_dao_id_idx on ligne_specification(article_dao_id);

create table produit (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  marque text not null,
  modele text not null,
  reference text,
  fiche_technique_path text,
  fiche_technique_nom_original text,
  autorisation_fabricant_path text,
  autorisation_fabricant_nom_original text,
  autorisation_valide_jusquau date,
  certificat_etalonnage_path text,
  certificat_etalonnage_nom_original text,
  certificat_etalonnage_valide_jusquau date,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index produit_entreprise_id_idx on produit(entreprise_id);

create table specification_produit (
  id uuid primary key default gen_random_uuid(),
  produit_id uuid not null references produit(id) on delete cascade,
  libelle text not null,
  valeur text not null,
  unite text,
  source_section text,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index specification_produit_produit_id_idx on specification_produit(produit_id);

create table article_produit (
  id uuid primary key default gen_random_uuid(),
  article_dao_id uuid not null references article_dao(id) on delete cascade,
  produit_id uuid not null references produit(id) on delete cascade,
  retenu boolean not null default false,
  -- Un produit ko sur une ligne ne peut pas être retenu sans justification
  -- écrite (spec 5.2) — vérifié côté application (modifierArticleProduit),
  -- pas en contrainte DB : la conformité par ligne est calculée, pas
  -- stockée, donc indisponible à une contrainte check SQL.
  justification_ko text,
  ordre integer not null default 0,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (article_dao_id, produit_id)
);

create index article_produit_article_dao_id_idx on article_produit(article_dao_id);
create index article_produit_produit_id_idx on article_produit(produit_id);

create table conformite_forcee (
  id uuid primary key default gen_random_uuid(),
  ligne_specification_id uuid not null references ligne_specification(id) on delete cascade,
  produit_id uuid not null references produit(id) on delete cascade,
  statut text not null check (statut in ('ok', 'ko', 'inconnu')),
  justification text,
  modifie_par uuid references utilisateur(id) on delete set null,
  modifie_le timestamptz not null default now(),
  unique (ligne_specification_id, produit_id)
);

create index conformite_forcee_ligne_specification_id_idx
  on conformite_forcee(ligne_specification_id);

alter table article_dao enable row level security;
alter table ligne_specification enable row level security;
alter table produit enable row level security;
alter table specification_produit enable row level security;
alter table article_produit enable row level security;
alter table conformite_forcee enable row level security;

create policy "article_dao_select_membres" on article_dao
  for select using (
    exists (
      select 1 from appel_offres ao
      where ao.id = article_dao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "article_dao_insert_membres" on article_dao
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from appel_offres ao
      where ao.id = article_dao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "article_dao_update_membres" on article_dao
  for update
  using (
    exists (
      select 1 from appel_offres ao
      where ao.id = article_dao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      where ao.id = article_dao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "article_dao_delete_membres" on article_dao
  for delete using (
    exists (
      select 1 from appel_offres ao
      where ao.id = article_dao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "ligne_specification_select_membres" on ligne_specification
  for select using (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = ligne_specification.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "ligne_specification_insert_membres" on ligne_specification
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = ligne_specification.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "ligne_specification_update_membres" on ligne_specification
  for update
  using (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = ligne_specification.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = ligne_specification.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "ligne_specification_delete_membres" on ligne_specification
  for delete using (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = ligne_specification.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "produit_select_membres" on produit
  for select using (est_membre_entreprise(produit.entreprise_id));
create policy "produit_insert_membres" on produit
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and est_membre_entreprise(produit.entreprise_id)
  );
create policy "produit_update_membres" on produit
  for update
  using (est_membre_entreprise(produit.entreprise_id))
  with check (est_membre_entreprise(produit.entreprise_id));
create policy "produit_delete_membres" on produit
  for delete using (est_membre_entreprise(produit.entreprise_id));

create policy "specification_produit_select_membres" on specification_produit
  for select using (
    exists (
      select 1 from produit p
      where p.id = specification_produit.produit_id and est_membre_entreprise(p.entreprise_id)
    )
  );
create policy "specification_produit_insert_membres" on specification_produit
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from produit p
      where p.id = specification_produit.produit_id and est_membre_entreprise(p.entreprise_id)
    )
  );
create policy "specification_produit_update_membres" on specification_produit
  for update
  using (
    exists (
      select 1 from produit p
      where p.id = specification_produit.produit_id and est_membre_entreprise(p.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from produit p
      where p.id = specification_produit.produit_id and est_membre_entreprise(p.entreprise_id)
    )
  );
create policy "specification_produit_delete_membres" on specification_produit
  for delete using (
    exists (
      select 1 from produit p
      where p.id = specification_produit.produit_id and est_membre_entreprise(p.entreprise_id)
    )
  );

create policy "article_produit_select_membres" on article_produit
  for select using (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = article_produit.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "article_produit_insert_membres" on article_produit
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = article_produit.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "article_produit_update_membres" on article_produit
  for update
  using (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = article_produit.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = article_produit.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "article_produit_delete_membres" on article_produit
  for delete using (
    exists (
      select 1 from article_dao ad
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ad.id = article_produit.article_dao_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "conformite_forcee_select_membres" on conformite_forcee
  for select using (
    exists (
      select 1 from ligne_specification ls
      join article_dao ad on ad.id = ls.article_dao_id
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ls.id = conformite_forcee.ligne_specification_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "conformite_forcee_insert_membres" on conformite_forcee
  for insert with check (
    modifie_par in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from ligne_specification ls
      join article_dao ad on ad.id = ls.article_dao_id
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ls.id = conformite_forcee.ligne_specification_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "conformite_forcee_update_membres" on conformite_forcee
  for update
  using (
    exists (
      select 1 from ligne_specification ls
      join article_dao ad on ad.id = ls.article_dao_id
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ls.id = conformite_forcee.ligne_specification_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from ligne_specification ls
      join article_dao ad on ad.id = ls.article_dao_id
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ls.id = conformite_forcee.ligne_specification_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );
create policy "conformite_forcee_delete_membres" on conformite_forcee
  for delete using (
    exists (
      select 1 from ligne_specification ls
      join article_dao ad on ad.id = ls.article_dao_id
      join appel_offres ao on ao.id = ad.appel_offres_id
      where ls.id = conformite_forcee.ligne_specification_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );
