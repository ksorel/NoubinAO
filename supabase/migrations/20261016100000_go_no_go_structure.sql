-- Fiche Go/No-Go structurée (remplace evaluation_go_no_go, pas droppée ici —
-- voir docs/superpowers/specs/2026-10-16-go-no-go-structure-design.md,
-- section "Modèle de données", suppression différée à confirmation de Sorel).
-- Pattern RLS : est_membre_entreprise/est_admin_entreprise (20261013150000),
-- jamais utilisateur.id = auth.uid() (faux depuis cette migration, voir
-- 20261014120000_followup_multi_entreprise.sql).

alter table entreprise add column note_min_go_defaut numeric not null default 14
  check (note_min_go_defaut >= 0 and note_min_go_defaut <= 20);
alter table entreprise add column marge_min_visee_defaut numeric not null default 0.15
  check (marge_min_visee_defaut >= 0 and marge_min_visee_defaut <= 1);

create table type_marche_go_no_go (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  nom text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table type_marche_go_no_go enable row level security;

create policy "type_marche_go_no_go_select_membres" on type_marche_go_no_go
  for select using (est_membre_entreprise(entreprise_id));

create policy "type_marche_go_no_go_insert_admin" on type_marche_go_no_go
  for insert with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create policy "type_marche_go_no_go_update_admin" on type_marche_go_no_go
  for update
  using (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id))
  with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create table question_go_no_go (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  type_marche_id uuid references type_marche_go_no_go(id) on delete cascade,
  categorie text not null check (categorie in ('administratif', 'savoir_faire', 'ouverture_marche')),
  texte text not null,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint question_go_no_go_type_marche_coherent check (
    (categorie = 'savoir_faire' and type_marche_id is not null)
    or (categorie <> 'savoir_faire' and type_marche_id is null)
  )
);

-- Clé stable pour rattacher une question à une suggestion issue de la
-- bibliothèque documentaire. L'UI matchait auparavant le texte libre de la
-- question ("agrément", "attestations"), ce qui déclenchait la mauvaise
-- suggestion sur des questions sans rapport et cassait dès qu'un admin
-- reformulait une question depuis /parametres/go-no-go. NULL = aucune
-- suggestion (cas de toutes les questions créées par un admin).
alter table question_go_no_go add column cle_suggestion text
  check (cle_suggestion in ('agrement', 'attestations'));

alter table question_go_no_go enable row level security;

create policy "question_go_no_go_select_membres" on question_go_no_go
  for select using (est_membre_entreprise(entreprise_id));

create policy "question_go_no_go_insert_admin" on question_go_no_go
  for insert with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create policy "question_go_no_go_update_admin" on question_go_no_go
  for update
  using (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id))
  with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create table go_no_go (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  type_marche_id uuid references type_marche_go_no_go(id) on delete set null,
  montant_marche_estime numeric,
  cout_total_realisation numeric,
  prix_dao numeric,
  caution_soumission numeric,
  frais_preparation numeric,
  avance_pourcentage numeric check (avance_pourcentage is null or (avance_pourcentage >= 0 and avance_pourcentage <= 1)),
  delai_paiement_jours integer,
  argent_disponible_banque numeric,
  note_interet_strategique integer check (note_interet_strategique is null or (note_interet_strategique between 0 and 4)),
  note_client_paie integer check (note_client_paie is null or (note_client_paie between 0 and 3)),
  note_concurrence integer check (note_concurrence is null or (note_concurrence between 0 and 2)),
  note_risques integer check (note_risques is null or (note_risques between 0 and 3)),
  commentaire_global text,
  modifie_par uuid references utilisateur(id) on delete set null,
  modifie_le timestamptz not null default now()
);

alter table go_no_go enable row level security;

-- Même pattern que evaluation_go_no_go_select_membres (20260915140000),
-- traduit avec est_membre_entreprise au lieu du join direct.
create policy "go_no_go_select_membres" on go_no_go
  for select using (
    exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

-- Pas de condition sur modifie_par ici, contrairement à la policy UPDATE :
-- la création d'une fiche vide (obtenirOuCreerGoNoGo) n'est pas un acte
-- d'écriture d'auteur et laisse modifie_par à NULL — `NULL in (...)` vaut
-- NULL, que WITH CHECK traite comme un rejet, ce qui ferait échouer la
-- première visite de chaque page de détail d'AO.
create policy "go_no_go_insert_membres" on go_no_go
  for insert with check (
    exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "go_no_go_update_membres" on go_no_go
  for update
  using (
    exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    modifie_par in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create table reponse_go_no_go (
  id uuid primary key default gen_random_uuid(),
  go_no_go_id uuid not null references go_no_go(id) on delete cascade,
  question_id uuid not null references question_go_no_go(id) on delete cascade,
  texte_question_snapshot text not null,
  reponse text not null check (reponse in ('oui', 'non', 'a_confirmer')),
  commentaire text,
  modifie_le timestamptz not null default now(),
  unique (go_no_go_id, question_id)
);

alter table reponse_go_no_go enable row level security;

create policy "reponse_go_no_go_select_membres" on reponse_go_no_go
  for select using (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "reponse_go_no_go_insert_membres" on reponse_go_no_go
  for insert with check (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "reponse_go_no_go_update_membres" on reponse_go_no_go
  for update
  using (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
