-- Sprint S7, parcours expert v2 (voir CLAUDE.md, Étape 5.3 "Références") :
-- catalogue de références projets structuré, réutilisable entre AO (même
-- patron que `produit`, sprint S6) — une référence n'est pas propre à un
-- AO, elle est citée dans plusieurs dossiers au fil du temps.
--
-- Pattern RLS : est_membre_entreprise (20261013150000), jamais
-- utilisateur.id = auth.uid() — voir l'avertissement de
-- 20261023083606_point_flou_ao.sql et le correctif de
-- 20261027100000_fix_cotation_fournisseur_rls.sql.

-- Paramètres de filtrage par AO (période exigée, nature, montant minimal,
-- nombre exigé) — même esprit que fourchette_prix_basse/haute (sprint S2) :
-- extraits du DAO ou saisis par l'entreprise, consommés par
-- lib/appels-offres/reference-filtre.ts et REF-01.
alter table appel_offres add column periode_references_debut date;
alter table appel_offres add column periode_references_fin date;
alter table appel_offres add column nature_references_tags text[] not null default '{}';
alter table appel_offres add column montant_minimal_reference numeric;
alter table appel_offres add column nombre_references_exigees integer;

create type role_reference as enum ('principal', 'groupement', 'sous_traitant');

create table reference_projet (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  client_nom text not null,
  client_rccm text,
  client_date_creation date,
  -- Coordonnées de l'émetteur (client) telles que déclarées sur la
  -- référence — comparées à celles du soumissionnaire (entreprise) par
  -- lib/appels-offres/reference-integrite.ts pour détecter une référence
  -- qui cite en réalité ses propres coordonnées comme "client".
  client_telephone text,
  client_email text,
  client_adresse text,
  objet text not null,
  nature_tags text[] not null default '{}',
  montant numeric,
  role role_reference not null default 'principal',
  date_debut date,
  date_fin date,
  -- Valeurs figées à la création, jamais réécrites par une mise à jour
  -- (voir modifierReferenceProjet) : comparées à date_debut/date_fin
  -- courants pour détecter "période modifiée après une première
  -- importation" (contrôle d'intégrité, spec 5.3).
  date_debut_origine date,
  date_fin_origine date,
  abe_document_id uuid references document(id) on delete set null,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now()
);

create index reference_projet_entreprise_id_idx on reference_projet(entreprise_id);

-- Justificatifs (contrat, facture, preuve de paiement) — plusieurs par
-- référence, documents existants de la bibliothèque (pas de nouveau type
-- de document : un contrat/une facture est déjà uploadable comme
-- "référence de projet" ou "pièce administrative" selon le cas).
create table reference_projet_justificatif (
  id uuid primary key default gen_random_uuid(),
  reference_projet_id uuid not null references reference_projet(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  created_by uuid references utilisateur(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (reference_projet_id, document_id)
);

create index reference_projet_justificatif_reference_id_idx
  on reference_projet_justificatif(reference_projet_id);

alter table reference_projet enable row level security;
alter table reference_projet_justificatif enable row level security;

create policy "reference_projet_select_membres" on reference_projet
  for select using (est_membre_entreprise(reference_projet.entreprise_id));
create policy "reference_projet_insert_membres" on reference_projet
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and est_membre_entreprise(reference_projet.entreprise_id)
  );
create policy "reference_projet_update_membres" on reference_projet
  for update
  using (est_membre_entreprise(reference_projet.entreprise_id))
  with check (est_membre_entreprise(reference_projet.entreprise_id));
create policy "reference_projet_delete_membres" on reference_projet
  for delete using (est_membre_entreprise(reference_projet.entreprise_id));

create policy "reference_projet_justificatif_select_membres" on reference_projet_justificatif
  for select using (
    exists (
      select 1 from reference_projet rp
      where rp.id = reference_projet_justificatif.reference_projet_id
        and est_membre_entreprise(rp.entreprise_id)
    )
  );
create policy "reference_projet_justificatif_insert_membres" on reference_projet_justificatif
  for insert with check (
    created_by in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from reference_projet rp
      where rp.id = reference_projet_justificatif.reference_projet_id
        and est_membre_entreprise(rp.entreprise_id)
    )
  );
create policy "reference_projet_justificatif_delete_membres" on reference_projet_justificatif
  for delete using (
    exists (
      select 1 from reference_projet rp
      where rp.id = reference_projet_justificatif.reference_projet_id
        and est_membre_entreprise(rp.entreprise_id)
    )
  );
