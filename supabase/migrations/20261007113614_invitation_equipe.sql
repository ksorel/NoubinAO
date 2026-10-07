-- Élargit utilisateur.role pour admettre 'membre', et ajoute l'invitation
-- d'équipe (lien à partager, pas d'email système) — voir
-- docs/superpowers/specs/2026-10-07-invitation-equipe-design.md

-- Le nom de la contrainte check inline d'origine (20260822124743) n'est pas
-- garanti ("utilisateur_role_check" par convention Postgres, pas vérifié) :
-- on la retrouve dynamiquement plutôt que de supposer son nom.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = con.conrelid
  where rel.relname = 'utilisateur'
    and con.contype = 'c'
    and att.attname = 'role'
    and att.attnum = any(con.conkey);

  if v_constraint_name is not null then
    execute format('alter table utilisateur drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table utilisateur add constraint utilisateur_role_check
  check (role in ('admin', 'membre'));

create table invitation_equipe (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  token text not null unique,
  role text not null check (role in ('admin', 'membre')),
  cree_par uuid references utilisateur(id) on delete set null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'utilisee', 'revoquee')),
  expire_at timestamptz not null default (now() + interval '7 days'),
  utilisee_par uuid references utilisateur(id) on delete set null,
  utilisee_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitation_equipe_entreprise_id_idx
  on invitation_equipe(entreprise_id);

alter table invitation_equipe enable row level security;

create policy "invitation_equipe_select_admin" on invitation_equipe
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

create policy "invitation_equipe_insert_admin" on invitation_equipe
  for insert with check (
    cree_par = auth.uid()
    and exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

-- "with check" explicite (pas seulement "using") : sans lui Postgres réutilise
-- le "using" pour les nouvelles valeurs de la ligne, ce qui permettrait de
-- réassigner entreprise_id à une entreprise où l'appelant n'est pas admin
-- lors d'une révocation. Voir noubinao_rls_with_check_gotcha.
create policy "invitation_equipe_update_admin" on invitation_equipe
  for update using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

-- Jonction : contourne RLS (l'appelant n'a pas encore de ligne utilisateur,
-- même patron que creer_entreprise) et marque l'invitation utilisée de
-- façon atomique.
create or replace function rejoindre_entreprise(p_token text, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
begin
  if exists (select 1 from utilisateur where id = auth.uid()) then
    raise exception 'utilisateur_deja_rattache';
  end if;

  select * into v_invitation
  from invitation_equipe
  where token = p_token and statut = 'en_attente' and expire_at > now();

  if v_invitation is null then
    raise exception 'invitation_invalide';
  end if;

  insert into utilisateur (id, entreprise_id, nom, role)
  values (auth.uid(), v_invitation.entreprise_id, p_nom, v_invitation.role);

  update invitation_equipe
  set statut = 'utilisee', utilisee_par = auth.uid(), utilisee_at = now()
  where id = v_invitation.id;

  return v_invitation.entreprise_id;
end;
$$;

revoke all on function rejoindre_entreprise from public;
grant execute on function rejoindre_entreprise to authenticated;

-- Lecture publique minimale (nom entreprise + rôle proposé + validité) pour
-- afficher l'écran de confirmation avant jonction, sans exposer la table
-- invitation_equipe via RLS à un utilisateur qui n'est pas encore membre.
-- Accessible à "anon" : un visiteur non connecté doit pouvoir savoir que son
-- lien est invalide avant même qu'on lui propose de se connecter.
create or replace function obtenir_invitation_publique(p_token text)
returns table (entreprise_nom text, role text, valide boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
begin
  select * into v_invitation from invitation_equipe where token = p_token;

  if v_invitation is null then
    return query select null::text, null::text, false;
    return;
  end if;

  return query
  select e.nom, v_invitation.role,
    (v_invitation.statut = 'en_attente' and v_invitation.expire_at > now())
  from entreprise e
  where e.id = v_invitation.entreprise_id;
end;
$$;

revoke all on function obtenir_invitation_publique from public;
grant execute on function obtenir_invitation_publique to anon, authenticated;
