-- Remplace le pipeline BOMP (PDF + structuration IA) par un scraping
-- quotidien de marchespublics.ci — voir
-- docs/superpowers/specs/2026-09-29-veille-marches-publics-design.md.
-- Les tables avis_ao_national/avis_ao_national_importation existantes
-- (migration 20260923090000_veille_bomp.sql) sont réutilisées telles
-- quelles, avec les ajustements suivants.

-- Un avis scrapé n'appartient à aucune édition BOMP.
alter table avis_ao_national alter column bomp_numero_id drop not null;

-- Un avis scrapé n'a pas de fragment de texte source à conserver pour
-- traçabilité (contrairement à un avis BOMP, extrait d'un bloc de texte
-- libre) — ses champs viennent directement de colonnes HTML structurées.
alter table avis_ao_national alter column texte_brut drop not null;

-- Dédoublonnage : "reference" seule n'est pas fiable comme clé, une
-- collision réelle a été observée dans la source (même référence, deux
-- objets différents). Voir spec, section "Piège trouvé à la vérification".
--
-- Prérequis vérifié avant application en prod (46 lignes BOMP, 0 doublon).
-- Avant de rejouer dans un autre environnement :
--   select reference, objet, count(*) from avis_ao_national
--   group by reference, objet having count(*) > 1;
alter table avis_ao_national
  add constraint avis_ao_national_reference_objet_key unique (reference, objet);

-- Historique des exécutions du scraping quotidien, pour supervision
-- admin (/admin/veille). Remplace l'ancien suivi par bomp_numero (qui
-- suivait des éditions PDF, un concept qui n'existe plus pour cette
-- source).
create type statut_execution_veille as enum ('succes', 'erreur');

create table veille_execution (
  id uuid primary key default gen_random_uuid(),
  execute_le timestamptz not null default now(),
  statut statut_execution_veille not null,
  nombre_ao_trouves integer,
  nombre_nouveaux_ao integer,
  erreur_message text
);

alter table veille_execution enable row level security;

-- Écriture réservée au rôle service (le scraping tourne avec
-- createServiceRoleClient, bypasse RLS) — aucune policy d'écriture
-- nécessaire pour les utilisateurs authentifiés, même patron que
-- avis_ao_national pour les insertions du job de scraping.
create policy "veille_execution_select_super_admin" on veille_execution
  for select using (
    exists (select 1 from utilisateur u where u.id = auth.uid() and u.super_admin)
  );
