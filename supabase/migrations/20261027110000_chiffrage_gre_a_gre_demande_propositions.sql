-- Fin du sprint S5 chiffrage (parcours expert v2, voir CLAUDE.md), dernière
-- tranche : gré à gré (marge plancher + historique de négociation) et
-- demande de propositions (verrouillage de l'offre financière tant que la
-- note technique simulée n'atteint pas le seuil qualificatif).
--
-- Pattern RLS : est_membre_entreprise (20261013150000), jamais
-- utilisateur.id = auth.uid() — voir l'avertissement de
-- 20261023083606_point_flou_ao.sql et le correctif de
-- 20261027100000_fix_cotation_fournisseur_rls.sql.

alter table appel_offres add column marge_plancher_pct numeric;
alter table appel_offres add column seuil_qualificatif_technique_pct numeric;

comment on column appel_offres.marge_plancher_pct is
  'Seuil (%) sous lequel la marge globale du BPU (indicateurs chiffrage) est signalée — utile en gré à gré où la négociation peut tirer la marge vers le bas.';
comment on column appel_offres.seuil_qualificatif_technique_pct is
  'Seuil (%) de note technique simulée (exigence_ao.note_simulee pondérée) sous lequel l''offre financière reste verrouillée pour une demande de propositions.';

alter table exigence_ao add column note_simulee numeric;

comment on column exigence_ao.note_simulee is
  'Note auto-déclarée (0-100, % du critère atteint) — uniquement sur un critère d''évaluation technique, pour simuler la note globale sans attendre la commission.';

-- exigence_ao n'avait jusqu'ici aucune policy "update" (seulement
-- select/insert/delete, voir 20260831140310_appel_offres.sql) : note_simulee
-- est le premier champ modifiable par l'utilisateur sur cette table. USING
-- et WITH CHECK identiques (pas de distinction de colonne sensible côté
-- RLS) — sans WITH CHECK, la policy réutiliserait USING à l'écriture et
-- autoriserait implicitement n'importe quelle ligne lue, pas seulement
-- celle visée (piège déjà rencontré, voir noubinao_rls_with_check_gotcha).
create policy "exigence_ao_update_membres" on exigence_ao
  for update using (
    exists (
      select 1 from appel_offres ao
      where ao.id = exigence_ao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      where ao.id = exigence_ao.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create table tour_negociation_gre_a_gre (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  numero integer not null,
  montant_propose numeric not null,
  date_tour date not null,
  commentaire text,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (appel_offres_id, numero)
);

create index tour_negociation_gre_a_gre_appel_offres_id_idx
  on tour_negociation_gre_a_gre(appel_offres_id);

alter table tour_negociation_gre_a_gre enable row level security;

create policy "tour_negociation_select_membres" on tour_negociation_gre_a_gre
  for select using (
    exists (
      select 1 from appel_offres ao
      where ao.id = tour_negociation_gre_a_gre.appel_offres_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "tour_negociation_insert_membres" on tour_negociation_gre_a_gre
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from appel_offres ao
      where ao.id = tour_negociation_gre_a_gre.appel_offres_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "tour_negociation_delete_membres" on tour_negociation_gre_a_gre
  for delete using (
    exists (
      select 1 from appel_offres ao
      where ao.id = tour_negociation_gre_a_gre.appel_offres_id
        and est_membre_entreprise(ao.entreprise_id)
    )
  );
