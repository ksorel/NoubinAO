-- Transformation des CV selon le modèle imposé par un DAO (lacune reportée
-- pendant le cadrage du sous-projet BPU du Module 7 — voir
-- docs/superpowers/specs/2026-09-16-pyramide-cout-bpu-design.md). Un seul
-- modèle par AO, saisi manuellement (upload), jamais extrait
-- automatiquement du DAO. Colonnes ajoutées à appel_offres, comme
-- fichier_dao_path : un modèle de CV est propre à un AO, jamais partagé.
alter table appel_offres
  add column modele_cv_path text,
  add column modele_cv_nom_original text,
  add column modele_cv_markdown text;

-- Résultat de transformation d'un CV vers le modèle de l'AO. Une
-- régénération remplace le résultat précédent (contrainte unique, pas
-- d'historique de versions — cohérent avec le reste du projet). document_id
-- référence le CV source (bibliothèque, type 'cv') ; appel_offres_id le
-- modèle utilisé. Les deux restent des FK explicites pour la traçabilité :
-- CV source et modèle restent consultables séparément.
create table cv_transforme (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  contenu_markdown text not null,
  export_path text not null,
  genere_par uuid references utilisateur(id) on delete set null,
  genere_le timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (appel_offres_id, document_id)
);

create index cv_transforme_appel_offres_id_idx on cv_transforme(appel_offres_id);

alter table cv_transforme enable row level security;

-- Même patron que jalon_retroplanning/evaluation_go_no_go : select/insert
-- scopés par appartenance entreprise via appel_offres, update autorisé à
-- toute l'équipe (une régénération peut être faite par n'importe qui,
-- pas seulement l'auteur de la première génération).
create policy "cv_transforme_select_membres" on cv_transforme
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_insert_membres" on cv_transforme
  for insert with check (
    genere_par = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_update_membres" on cv_transforme
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_delete_membres" on cv_transforme
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );
