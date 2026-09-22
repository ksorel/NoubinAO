-- Rôle admin plateforme (un seul compte aujourd'hui, extensible plus tard)
alter table utilisateur add column super_admin boolean not null default false;

-- Un appel_offres importé depuis le catalogue national n'a par définition
-- aucun fichier DAO à ce stade (le BOMP ne contient que l'avis, pas le
-- dossier complet — voir spec) — ces deux colonnes n'étaient jamais
-- nullables tant que tout appel_offres naissait d'un upload de DAO. Impact
-- sur le code existant traité en Tâche 13, pas laissé en incohérence.
alter table appel_offres alter column fichier_dao_path drop not null;
alter table appel_offres alter column fichier_dao_nom_original drop not null;

-- Informations de retrait du dossier (adresse/téléphone/email de l'autorité
-- contractante, ARTICLE 7 du BOMP). C'est la SEULE information qui permet au
-- client d'agir sur un avis importé : puisqu'aucun fichier DAO n'est joint,
-- il doit aller chercher le dossier complet lui-même auprès de ce contact
-- (voir spec, « Écran client Veille »). Recopiée sur l'appel_offres à
-- l'import pour survivre au-delà du catalogue partagé.
alter table appel_offres add column contact_retrait text;

-- Suivi de chaque édition hebdomadaire du BOMP
create type statut_traitement_bomp as enum (
  'en_attente', 'extraction_en_cours', 'termine', 'erreur'
);

create table bomp_numero (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  date_publication date not null,
  fichier_path text not null,
  statut statut_traitement_bomp not null default 'en_attente',
  nombre_avis_extraits integer not null default 0,
  erreur_message text,
  cree_par uuid not null references utilisateur(id),
  cree_le timestamptz not null default now(),
  -- Horodatage de la dernière écriture de `statut` (voir lib/veille/
  -- decoupage.ts et lib/veille/structuration-avis.ts). Sert d'échappatoire
  -- au cas où la fonction serverless est tuée par le plafond de 60 s de
  -- Vercel : le bloc catch ne s'exécute alors jamais, la ligne reste en
  -- 'extraction_en_cours' sans erreur_message, et l'écran admin ne peut
  -- pas distinguer un traitement en cours d'un traitement mort. Comparer
  -- mis_a_jour_le à maintenant rend cet état bloqué visible.
  mis_a_jour_le timestamptz not null default now()
);

-- Catalogue partagé des avis extraits. `type` nullable : renseigné par l'IA
-- à l'étape de structuration (voir plan, section "Décisions de conception"),
-- pas déduit au découpage.
create type type_avis_ao_national as enum (
  'travaux', 'fournitures', 'prestations', 'manifestation_interet'
);

create table avis_ao_national (
  id uuid primary key default gen_random_uuid(),
  bomp_numero_id uuid not null references bomp_numero(id) on delete cascade,
  reference text not null,
  type type_avis_ao_national,
  autorite_contractante text,
  objet text,
  secteur text,
  montant_caution numeric,
  date_limite_remise_offres date,
  contact_retrait text,
  nombre_lots integer,
  texte_brut text not null,
  cree_le timestamptz not null default now(),
  -- Marqueur « cet avis est passé par la structuration IA », renseigné à
  -- chaque écriture réussie de lib/veille/structuration-avis.ts. Ne PAS
  -- utiliser `type is null` pour ça : `type` est légitimement nullable
  -- (Claude peut ne pas savoir classer un avis), donc un avis classé
  -- null serait indistinguable d'un avis jamais traité, et le compteur
  -- « reste-t-il des avis à structurer ? » n'atteindrait jamais 0 —
  -- bloquant le bomp_numero en 'extraction_en_cours' à vie.
  structure_le timestamptz
);
create index avis_ao_national_secteur_idx on avis_ao_national(secteur);
create index avis_ao_national_date_limite_idx on avis_ao_national(date_limite_remise_offres);
create index avis_ao_national_bomp_numero_idx on avis_ao_national(bomp_numero_id);

create table avis_ao_national_importation (
  id uuid primary key default gen_random_uuid(),
  avis_id uuid not null references avis_ao_national(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  importe_par uuid not null references utilisateur(id),
  importe_le timestamptz not null default now(),
  unique (avis_id, entreprise_id)
);

alter table bomp_numero enable row level security;
alter table avis_ao_national enable row level security;
alter table avis_ao_national_importation enable row level security;

create policy "bomp_numero_select_authenticated" on bomp_numero
  for select using (auth.uid() is not null);

create policy "bomp_numero_write_super_admin" on bomp_numero
  for all using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  ) with check (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

create policy "avis_ao_national_select_authenticated" on avis_ao_national
  for select using (auth.uid() is not null);

create policy "avis_ao_national_write_super_admin" on avis_ao_national
  for all using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  ) with check (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

create policy "avis_importation_select_membres" on avis_ao_national_importation
  for select using (
    exists (
      select 1 from utilisateur u
      where u.id = auth.uid() and u.entreprise_id = avis_ao_national_importation.entreprise_id
    )
  );

create policy "avis_importation_insert_membres" on avis_ao_national_importation
  for insert with check (
    exists (
      select 1 from utilisateur u
      where u.id = auth.uid() and u.entreprise_id = avis_ao_national_importation.entreprise_id
    )
  );

-- Storage : bucket dédié, pas de préfixe entreprise (catalogue partagé),
-- accès réservé aux super_admin (même patron que le bucket "documents").
insert into storage.buckets (id, name, public)
values ('bomp-national', 'bomp-national', false)
on conflict (id) do nothing;

create policy "bomp_national_select_super_admin" on storage.objects
  for select using (
    bucket_id = 'bomp-national'
    and exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

create policy "bomp_national_insert_super_admin" on storage.objects
  for insert with check (
    bucket_id = 'bomp-national'
    and exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

-- Indispensable : RLS refuse par défaut, donc sans policy delete les appels
-- .remove() de rollback dans uploaderBomp (lib/veille/actions.ts) échouent
-- silencieusement et laissent un fichier orphelin dans le stockage à chaque
-- échec d'insertion bomp_numero ou de mise en file du découpage. Même patron
-- que documents_delete_membres (20260822124743_bibliotheque_documentaire.sql).
create policy "bomp_national_delete_super_admin" on storage.objects
  for delete using (
    bucket_id = 'bomp-national'
    and exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );

-- Import atomique : crée l'appel_offres ET la ligne de traçabilité en une
-- seule opération, contourne le même problème œuf-et-poule RLS que
-- creer_entreprise (l'utilisateur ne peut pas insérer directement dans
-- appel_offres sans passer par cette fonction, qui vérifie l'appartenance
-- via p_entreprise_id = auth uid's entreprise plutôt que de faire confiance
-- à l'appelant).
create or replace function importer_avis_national(
  p_avis_id uuid,
  p_entreprise_id uuid,
  p_utilisateur_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avis avis_ao_national%rowtype;
  v_appel_offres_id uuid;
begin
  if not exists (
    select 1 from utilisateur
    where id = p_utilisateur_id and entreprise_id = p_entreprise_id and id = auth.uid()
  ) then
    raise exception 'Utilisateur non autorisé pour cette entreprise.';
  end if;

  select * into v_avis from avis_ao_national where id = p_avis_id;
  if not found then
    raise exception 'Avis introuvable.';
  end if;

  -- statut_traitement = 'termine' explicitement : la valeur par défaut
  -- ('en_attente') suppose qu'un fichier DAO va être normalisé puis extrait
  -- par un job QStash. Ici il n'y a NI fichier DAO NI job — cet appel_offres
  -- naît donc déjà « traité », ses champs venant du catalogue national. Sans
  -- ça l'écran de détail garde tous ses champs et son bouton désactivés à vie
  -- (appel-offres-detail.tsx n'active qu'à 'termine') et le polling de la
  -- liste (lib/appels-offres/polling.ts, 'en_attente' ∈ STATUTS_EN_COURS)
  -- tourne indéfiniment toutes les 4 s dans chaque onglet ouvert.
  insert into appel_offres (
    entreprise_id, titre, acheteur, secteur, date_limite, montant_caution,
    contact_retrait, statut_traitement, created_by
  )
  values (
    p_entreprise_id,
    v_avis.objet,
    v_avis.autorite_contractante,
    v_avis.secteur,
    v_avis.date_limite_remise_offres,
    v_avis.montant_caution,
    v_avis.contact_retrait,
    'termine',
    p_utilisateur_id
  )
  returning id into v_appel_offres_id;

  insert into avis_ao_national_importation (avis_id, entreprise_id, appel_offres_id, importe_par)
  values (p_avis_id, p_entreprise_id, v_appel_offres_id, p_utilisateur_id);

  return v_appel_offres_id;
end;
$$;

revoke all on function importer_avis_national from public;
grant execute on function importer_avis_national to authenticated;
