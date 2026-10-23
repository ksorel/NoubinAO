-- Points flous du DAO (sprint S2, parcours expert v2, voir CLAUDE.md) :
-- incohérences/ambiguïtés détectées à l'extraction (article présent dans un
-- document mais pas un autre, renvoi vers une section vide, formulaire
-- numéroté en double, unité/valeur ambiguë, quantité absente) — pas des
-- exigences, juste des signaux à faire lever par l'acheteur (lettre de
-- questions, pas encore construite ce sprint-ci).
--
-- Pattern RLS : est_membre_entreprise (20261013150000) via join sur
-- appel_offres, même construction que go_no_go_select_membres
-- (20261016100000) — jamais utilisateur.id = auth.uid() (faux depuis
-- 20261013150000_utilisateur_auth_id.sql).

create table point_flou_ao (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  description text not null,
  source_section text,
  created_at timestamptz not null default now()
);

create index point_flou_ao_appel_offres_id_idx on point_flou_ao(appel_offres_id);

alter table point_flou_ao enable row level security;

create policy "point_flou_ao_select_membres" on point_flou_ao
  for select using (
    exists (
      select 1 from appel_offres ao
      where ao.id = point_flou_ao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "point_flou_ao_insert_membres" on point_flou_ao
  for insert with check (
    exists (
      select 1 from appel_offres ao
      where ao.id = point_flou_ao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "point_flou_ao_delete_membres" on point_flou_ao
  for delete using (
    exists (
      select 1 from appel_offres ao
      where ao.id = point_flou_ao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

-- Date limite d'envoi des questions/demandes de clarification à l'acheteur
-- (distincte de date_limite, qui est la date de dépôt de l'offre) : rappel
-- affiché avec les points flous, pour ne pas rater la fenêtre de
-- clarification avant de découvrir une ambiguïté trop tard.
alter table appel_offres add column date_limite_questions timestamptz;

comment on column appel_offres.date_limite_questions is
  'Date limite d''envoi des questions/clarifications à l''acheteur — distincte de date_limite (dépôt de l''offre).';
