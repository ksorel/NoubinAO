-- Remplace le booléen caché `est_eliminatoire` par une gravité explicite
-- (sprint S2, parcours expert v2 — voir CLAUDE.md) : "Les éliminatoires sont
-- un kind, pas un booléen caché". Orthogonal à `type_exigence` (quoi : une
-- pièce ou un critère) — `categorie_exigence` dit ce qui arrive en cas de
-- non-respect.

create type categorie_exigence_ao as enum (
  'eliminatoire', 'qualification', 'notee', 'formelle'
);

alter table exigence_ao
  add column categorie_exigence categorie_exigence_ao;

-- Backfill depuis les données existantes : une exigence déjà marquée
-- éliminatoire le reste ; sinon un critère d'évaluation devient "notee"
-- (il contribue déjà à une pondération), une pièce requise non éliminatoire
-- devient "formelle" par défaut (seule "qualification" ne peut pas être
-- déduite de l'existant, faute d'avoir jamais été distinguée avant ce
-- sprint — les futures extractions la détecteront).
update exigence_ao
set categorie_exigence = case
  when est_eliminatoire then 'eliminatoire'
  when type_exigence = 'critere_evaluation' then 'notee'
  else 'formelle'
end::categorie_exigence_ao;

alter table exigence_ao
  alter column categorie_exigence set not null,
  drop column est_eliminatoire;
