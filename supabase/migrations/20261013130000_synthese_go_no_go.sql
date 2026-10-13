-- Questionnaire Go/No-Go (synthèse rapide du DAO, module 7). Relation 1:1
-- avec appel_offres, mais contrairement à evaluation_go_no_go, la ligne
-- n'est PAS créée paresseusement au chargement de page : tant qu'elle n'a
-- pas été générée, l'absence de ligne est l'état normal "pas encore
-- généré", pas un état à masquer derrière des valeurs par défaut.
create table synthese_go_no_go (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  -- Tableau de { cle, reponse, source_section } — une entrée par question
  -- fixe (lib/appels-offres/types.ts, CLES_QUESTION_GO_NO_GO). Les libellés
  -- de question restent côté code (i18n), pas dupliqués en base.
  reponses jsonb not null,
  genere_par uuid references utilisateur(id) on delete set null,
  genere_le timestamptz not null default now()
);

alter table synthese_go_no_go enable row level security;

create policy "synthese_go_no_go_select_membres" on synthese_go_no_go
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = synthese_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "synthese_go_no_go_insert_membres" on synthese_go_no_go
  for insert with check (
    genere_par = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = synthese_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );

-- UPDATE avec WITH CHECK explicite, même leçon qu'evaluation_go_no_go
-- (Module 6, RLS WITH CHECK gotcha) : appel_offres_id ne doit jamais
-- pouvoir être réécrit vers l'AO d'une autre entreprise, et genere_par
-- doit être l'appelant lui-même, jamais forgé au nom d'un collègue.
create policy "synthese_go_no_go_update_membres" on synthese_go_no_go
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = synthese_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    genere_par = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = synthese_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );
