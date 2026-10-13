alter table exigence_ao
  add column est_eliminatoire boolean not null default false;

comment on column exigence_ao.est_eliminatoire is
  'Vrai si le DAO qualifie explicitement cette exigence de facteur éliminatoire (rejet automatique de l''offre en cas de non-respect), indépendamment de la pondération ou du type de pièce/critère.';
