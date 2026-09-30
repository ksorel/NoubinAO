-- Notification in-app : un nouvel avis classé dans un secteur configuré
-- par l'entreprise génère une ligne par utilisateur de cette entreprise
-- (granularité par utilisateur, pas par entreprise — voir spec
-- 2026-09-30-notifications-veille-design.md). `on delete cascade` sur
-- avis_id : une notification disparaît automatiquement quand son avis
-- est purgé par le nettoyage quotidien existant de
-- app/api/veille/marches-publics/sync/route.ts (date_limite_remise_offres
-- échue) — aucune logique de nettoyage supplémentaire à écrire.
create table notification (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  avis_id uuid not null references avis_ao_national(id) on delete cascade,
  lu boolean not null default false,
  cree_le timestamptz not null default now(),
  unique (utilisateur_id, avis_id)
);
create index notification_utilisateur_non_lues_idx on notification(utilisateur_id, lu);

alter table notification enable row level security;

create policy "notification_select_self" on notification
  for select using (utilisateur_id = auth.uid());

-- with check explicite : une policy "for update" sans lui réutilise
-- silencieusement using(), laissant utilisateur_id réécrivable (piège
-- déjà rencontré sur ce projet, voir mémoire
-- noubinao_rls_with_check_gotcha).
create policy "notification_update_self" on notification
  for update using (utilisateur_id = auth.uid())
  with check (utilisateur_id = auth.uid());

-- Pas de policy insert/delete pour authenticated : l'écriture se fait
-- uniquement via le route handler service-role (voir
-- lib/veille/notifications.ts, notifierAvisPertinents), la suppression
-- uniquement par cascade.
