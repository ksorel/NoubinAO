-- Évaluation Go/No-Go (Module 7, sous-projet 2). Relation 1:1 avec
-- appel_offres, créée paresseusement (get-or-create) comme
-- dossier_reponse. Les 3 critères sont NOT NULL avec une valeur par
-- défaut explicite 'a_evaluer' plutôt qu'une colonne nullable : un
-- <Select> shadcn/ui (Radix) interdit un SelectItem à value="" (seul
-- moyen naturel de représenter "pas encore répondu" avec un enum
-- nullable), donc l'état "pas encore répondu" est modélisé comme une
-- vraie 3ème valeur d'enum plutôt que NULL + un contournement de Select.
create table evaluation_go_no_go (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  critere_juridique text not null default 'a_evaluer'
    check (critere_juridique in ('a_evaluer', 'oui', 'non')),
  note_juridique text,
  critere_faisabilite text not null default 'a_evaluer'
    check (critere_faisabilite in ('a_evaluer', 'oui', 'non')),
  note_faisabilite text,
  critere_rentabilite text not null default 'a_evaluer'
    check (critere_rentabilite in ('a_evaluer', 'oui', 'non')),
  note_rentabilite text,
  modifie_par uuid references utilisateur(id) on delete set null,
  modifie_le timestamptz not null default now()
);

alter table evaluation_go_no_go enable row level security;

-- Même pattern que dossier_reponse_select_membres.
create policy "evaluation_go_no_go_select_membres" on evaluation_go_no_go
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "evaluation_go_no_go_insert_membres" on evaluation_go_no_go
  for insert with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );

-- UPDATE avec un WITH CHECK explicite — contrairement à checklist_item_dossier
-- (Module 7, sous-projet 1), cette table a besoin d'une policy update
-- puisque chaque ligne est éditée en place, pas insérée/supprimée. Leçon
-- du Module 6 (RLS WITH CHECK gotcha) appliquée dès la conception :
-- appel_offres_id ne doit jamais pouvoir être réécrit vers l'AO d'une
-- autre entreprise, et modifie_par doit être l'appelant lui-même, jamais
-- forgé au nom d'un collègue.
create policy "evaluation_go_no_go_update_membres" on evaluation_go_no_go
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    modifie_par = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = evaluation_go_no_go.appel_offres_id and u.id = auth.uid()
    )
  );
