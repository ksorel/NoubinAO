-- Connexion OAuth Gmail (Module 6, sous-projet 1). Un compte email
-- connecté par utilisateur et par fournisseur, strictement privé à son
-- propriétaire (RLS) — contrairement aux emails eux-mêmes qui seront un
-- jour visibles par l'équipe une fois rattachés à un AO (table `email`,
-- sous-projet 3, pas celle-ci). Un token de connexion n'a pas de raison
-- d'être lisible par un collègue.
create type fournisseur_email as enum ('gmail', 'outlook');
create type statut_compte_email as enum ('connecte', 'revoque', 'erreur');

create table compte_email_connecte (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  fournisseur fournisseur_email not null,
  adresse_email text not null,
  refresh_token_chiffre text not null,
  access_token_chiffre text,
  expire_le timestamptz,
  statut statut_compte_email not null default 'connecte',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (utilisateur_id, fournisseur)
);

create index compte_email_connecte_utilisateur_id_idx on compte_email_connecte(utilisateur_id);

alter table compte_email_connecte enable row level security;

create policy "compte_email_connecte_select_self" on compte_email_connecte
  for select using (utilisateur_id = auth.uid());

create policy "compte_email_connecte_insert_self" on compte_email_connecte
  for insert with check (utilisateur_id = auth.uid());

create policy "compte_email_connecte_update_self" on compte_email_connecte
  for update using (utilisateur_id = auth.uid());

create policy "compte_email_connecte_delete_self" on compte_email_connecte
  for delete using (utilisateur_id = auth.uid());
