-- Synchronisation des emails (Module 6, sous-projet 2). Un email
-- synchronisé reste strictement privé à son propriétaire (RLS) tant qu'il
-- n'est pas rattaché à un AO — appel_offres_id reste toujours null à
-- l'issue de ce sous-projet, un sous-projet ultérieur ajoutera la policy
-- élargie ("visible par l'équipe si appel_offres_id n'est pas null").
alter table compte_email_connecte
  add column dernier_sync_le timestamptz;

create table email (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  compte_email_connecte_id uuid not null references compte_email_connecte(id) on delete cascade,
  appel_offres_id uuid references appel_offres(id) on delete cascade,
  message_id_gmail text not null,
  expediteur text,
  destinataires text,
  objet text,
  contenu text,
  pieces_jointes jsonb not null default '[]'::jsonb,
  recu_le timestamptz,
  created_at timestamptz not null default now(),
  unique (compte_email_connecte_id, message_id_gmail)
);

create index email_utilisateur_id_idx on email(utilisateur_id);
create index email_appel_offres_id_idx on email(appel_offres_id);

alter table email enable row level security;

create policy "email_select_self" on email
  for select using (utilisateur_id = auth.uid());

create policy "email_insert_self" on email
  for insert with check (utilisateur_id = auth.uid());
