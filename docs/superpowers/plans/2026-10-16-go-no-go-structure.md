# Fiche Go/No-Go structurée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'évaluation Go/No-Go à 3 critères qualitatifs par une fiche structurée paramétrable par type de marché (10 questions OUI/NON/À confirmer, calculateur financier, note sur 20), utilisable avant et après achat du DAO, avec un écran de paramétrage par entreprise (types de marché, questions, seuils).

**Architecture:** 4 nouvelles tables Postgres (`type_marche_go_no_go`, `question_go_no_go`, `go_no_go`, `reponse_go_no_go`) + 2 colonnes sur `entreprise` (seuils), RLS via les helpers existants `est_membre_entreprise`/`est_admin_entreprise`. Logique de calcul en pure functions TypeScript testées Vitest (`lib/appels-offres/go-no-go.ts`), séparées de la couche données (`queries.ts`/`actions.ts`) et de l'UI (nouvel onglet dédié dans la fiche détail AO + nouvelle page de paramétrage).

**Tech Stack:** Next.js App Router / Server Actions, Supabase (Postgres + RLS), TypeScript strict, Zod, Vitest, shadcn/ui, next-intl.

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-10-16-go-no-go-structure-design.md` — toute divergence avec ce plan doit être résolue en faveur de la spec, sauf les 2 simplifications actées ci-dessous.
- **Simplification actée en planification** : pas de table `parametre_go_no_go` séparée — `note_min_go`/`marge_min_visee` deviennent 2 colonnes directement sur `entreprise` (`note_min_go_defaut`, `marge_min_visee_defaut`), même convention que `taux_frais_structure_defaut` déjà existant. Comportement identique à la spec, juste une table en moins.
- **Ne jamais exécuter `supabase db push`, `supabase migration up`, `supabase db reset` ou toute autre commande qui modifie une base réelle.** Chaque tâche de migration se limite à écrire le fichier SQL. L'application en base est une action manuelle de Sorel, hors de ce plan.
- RLS : utiliser exclusivement les fonctions `est_membre_entreprise(uuid)` / `est_admin_entreprise(uuid)` (définies dans `20261013150000_utilisateur_auth_id.sql`). Ne jamais écrire `utilisateur.id = auth.uid()` ou un join direct sur `utilisateur` — c'est le bug déjà corrigé par `20261014120000_followup_multi_entreprise.sql` (`utilisateur.id` n'est plus l'identifiant Auth, `auth_id` l'est).
- `evaluation_go_no_go` (table existante) **n'est pas droppée dans ce plan** — confirmation explicite de Sorel requise avant suppression (cf. spec, section Modèle de données). Son code applicatif (types, query, action, composant) est en revanche entièrement remplacé.
- Toute note/texte libre utilisateur réutilise le validateur `noteGoNoGo` déjà défini dans `lib/appels-offres/schema.ts` (2000 caractères max) plutôt que d'en recréer un.
- Commits fréquents, un par tâche, messages conventionnels (`feat:`, `test:`, `refactor:`).

---

## File Structure

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261016100000_go_no_go_structure.sql` | Nouvelles tables + colonnes `entreprise` + RLS (Tâche 1) |
| `supabase/migrations/20261016110000_go_no_go_seed.sql` | Seed `creer_entreprise` + backfill entreprises existantes (Tâche 2) |
| `lib/appels-offres/types.ts` | Types `TypeMarcheGoNoGo`, `QuestionGoNoGo`, `ReponseGoNoGo`, `GoNoGo` ; suppression `CritereGoNoGo`/`EvaluationGoNoGo` (Tâche 3) |
| `lib/utilisateur/types.ts` | Ajout `note_min_go_defaut`/`marge_min_visee_defaut` sur `Entreprise` (Tâche 3) |
| `lib/appels-offres/schema.ts` | Schémas zod des nouvelles actions ; suppression `mettreAJourEvaluationGoNoGoSchema` (Tâche 4) |
| `lib/appels-offres/go-no-go.ts` | Calculs purs (remplace entièrement le fichier actuel) (Tâche 5) |
| `lib/appels-offres/go-no-go.test.ts` | Tests des calculs (remplace entièrement) (Tâche 5) |
| `lib/appels-offres/go-no-go-suggestions.ts` | Suggestions administratif ↔ bibliothèque documentaire (Tâche 6) |
| `lib/appels-offres/go-no-go-suggestions.test.ts` | Tests des suggestions (Tâche 6) |
| `lib/appels-offres/queries.ts` | `obtenirOuCreerGoNoGo`, `listerTypesMarcheGoNoGo`, `listerQuestionsGoNoGo`, `listerReponsesGoNoGo` ; suppression `obtenirEvaluationGoNoGo` (Tâche 7) |
| `lib/utilisateur/queries.ts` | `obtenirParametresGoNoGo` (Tâche 7) |
| `lib/appels-offres/actions.ts` | Nouvelles server actions ; suppression `mettreAJourEvaluationGoNoGo` (Tâche 8) |
| `messages/fr.json`, `messages/en.json` | Nouvelles clés i18n (Tâche 9) |
| `app/(app)/appels-offres/[id]/go-no-go.tsx` | Composant fiche (remplace entièrement) (Tâche 10) |
| `app/(app)/appels-offres/[id]/appel-offres-detail.tsx` | Nouvel onglet, déplacement `QuestionnaireGoNoGo` (Tâche 11) |
| `app/(app)/appels-offres/[id]/page.tsx` | Nouveau data fetching (Tâche 11) |
| `app/(app)/parametres/go-no-go-card.tsx` | Carte seuils (Tâche 12) |
| `app/(app)/parametres/page.tsx` | Intégration de la carte (Tâche 12) |
| `app/(app)/parametres/go-no-go/page.tsx` | Page paramétrage types/questions (Tâche 13) |
| `app/(app)/parametres/go-no-go/types-marche-table.tsx` | CRUD types de marché (Tâche 13) |
| `app/(app)/parametres/go-no-go/questions-table.tsx` | CRUD questions (Tâche 13) |

---

### Task 1: Migration — tables et RLS

**Files:**
- Create: `supabase/migrations/20261016100000_go_no_go_structure.sql`

**Interfaces:**
- Produces: tables `type_marche_go_no_go`, `question_go_no_go`, `go_no_go`, `reponse_go_no_go` ; colonnes `entreprise.note_min_go_defaut`, `entreprise.marge_min_visee_defaut`. Noms de colonnes exacts utilisés par toutes les tâches suivantes.

- [ ] **Step 1: Écrire la migration**

```sql
-- Fiche Go/No-Go structurée (remplace evaluation_go_no_go, pas droppée ici —
-- voir docs/superpowers/specs/2026-10-16-go-no-go-structure-design.md,
-- section "Modèle de données", suppression différée à confirmation de Sorel).
-- Pattern RLS : est_membre_entreprise/est_admin_entreprise (20261013150000),
-- jamais utilisateur.id = auth.uid() (faux depuis cette migration, voir
-- 20261014120000_followup_multi_entreprise.sql).

alter table entreprise add column note_min_go_defaut numeric not null default 14
  check (note_min_go_defaut >= 0 and note_min_go_defaut <= 20);
alter table entreprise add column marge_min_visee_defaut numeric not null default 0.15
  check (marge_min_visee_defaut >= 0 and marge_min_visee_defaut <= 1);

create table type_marche_go_no_go (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  nom text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

alter table type_marche_go_no_go enable row level security;

create policy "type_marche_go_no_go_select_membres" on type_marche_go_no_go
  for select using (est_membre_entreprise(entreprise_id));

create policy "type_marche_go_no_go_insert_admin" on type_marche_go_no_go
  for insert with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create policy "type_marche_go_no_go_update_admin" on type_marche_go_no_go
  for update
  using (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id))
  with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create table question_go_no_go (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  type_marche_id uuid references type_marche_go_no_go(id) on delete cascade,
  categorie text not null check (categorie in ('administratif', 'savoir_faire', 'ouverture_marche')),
  texte text not null,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint question_go_no_go_type_marche_coherent check (
    (categorie = 'savoir_faire' and type_marche_id is not null)
    or (categorie <> 'savoir_faire' and type_marche_id is null)
  )
);

alter table question_go_no_go enable row level security;

create policy "question_go_no_go_select_membres" on question_go_no_go
  for select using (est_membre_entreprise(entreprise_id));

create policy "question_go_no_go_insert_admin" on question_go_no_go
  for insert with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create policy "question_go_no_go_update_admin" on question_go_no_go
  for update
  using (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id))
  with check (est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id));

create table go_no_go (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  type_marche_id uuid references type_marche_go_no_go(id) on delete set null,
  montant_marche_estime numeric,
  cout_total_realisation numeric,
  prix_dao numeric,
  caution_soumission numeric,
  frais_preparation numeric,
  avance_pourcentage numeric check (avance_pourcentage is null or (avance_pourcentage >= 0 and avance_pourcentage <= 1)),
  delai_paiement_jours integer,
  argent_disponible_banque numeric,
  note_interet_strategique integer check (note_interet_strategique is null or (note_interet_strategique between 0 and 4)),
  note_client_paie integer check (note_client_paie is null or (note_client_paie between 0 and 3)),
  note_concurrence integer check (note_concurrence is null or (note_concurrence between 0 and 2)),
  note_risques integer check (note_risques is null or (note_risques between 0 and 3)),
  commentaire_global text,
  modifie_par uuid references utilisateur(id) on delete set null,
  modifie_le timestamptz not null default now()
);

alter table go_no_go enable row level security;

-- Même pattern que evaluation_go_no_go_select_membres (20260915140000),
-- traduit avec est_membre_entreprise au lieu du join direct.
create policy "go_no_go_select_membres" on go_no_go
  for select using (
    exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "go_no_go_insert_membres" on go_no_go
  for insert with check (
    exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "go_no_go_update_membres" on go_no_go
  for update
  using (
    exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    modifie_par in (select id from utilisateur where auth_id = auth.uid())
    and exists (
      select 1 from appel_offres ao
      where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create table reponse_go_no_go (
  id uuid primary key default gen_random_uuid(),
  go_no_go_id uuid not null references go_no_go(id) on delete cascade,
  question_id uuid not null references question_go_no_go(id) on delete cascade,
  texte_question_snapshot text not null,
  reponse text not null check (reponse in ('oui', 'non', 'a_confirmer')),
  commentaire text,
  modifie_le timestamptz not null default now(),
  unique (go_no_go_id, question_id)
);

alter table reponse_go_no_go enable row level security;

create policy "reponse_go_no_go_select_membres" on reponse_go_no_go
  for select using (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "reponse_go_no_go_insert_membres" on reponse_go_no_go
  for insert with check (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  );

create policy "reponse_go_no_go_update_membres" on reponse_go_no_go
  for update
  using (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  )
  with check (
    exists (
      select 1 from go_no_go gng
      join appel_offres ao on ao.id = gng.appel_offres_id
      where gng.id = reponse_go_no_go.go_no_go_id and est_membre_entreprise(ao.entreprise_id)
    )
  );
```

- [ ] **Step 2: Vérifier la syntaxe sans toucher à une base réelle**

Run: `npx supabase db lint supabase/migrations/20261016100000_go_no_go_structure.sql` si la CLI est disponible localement ; sinon relire le fichier à froid (pas de `db push`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261016100000_go_no_go_structure.sql
git commit -m "feat(go-no-go): tables et RLS de la fiche structurée"
```

---

### Task 2: Migration — seed par défaut et backfill

**Files:**
- Create: `supabase/migrations/20261016110000_go_no_go_seed.sql`

**Interfaces:**
- Consumes: tables de la Tâche 1, fonction `creer_entreprise` existante (`20261013150000_utilisateur_auth_id.sql:652`).
- Produces: nouvelle version de `creer_entreprise` (seed automatique pour toute future entreprise) + backfill des entreprises déjà existantes.

- [ ] **Step 1: Écrire la migration**

```sql
-- Seed par défaut des types de marché et questions Go/No-Go, pour toute
-- nouvelle entreprise (via creer_entreprise) ET backfill des entreprises
-- déjà existantes (le pilote notamment) qui n'auraient jamais appelé cette
-- fonction avec le nouveau comportement.

create or replace function seed_go_no_go(p_entreprise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_btp uuid;
  v_ingenierie uuid;
  v_environnement uuid;
  v_energie uuid;
  v_it uuid;
  v_agro uuid;
begin
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'BTP / Travaux', 1) returning id into v_btp;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Ingénierie / Études', 2) returning id into v_ingenierie;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Environnement', 3) returning id into v_environnement;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Énergie-climat', 4) returning id into v_energie;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'IT / Informatique', 5) returning id into v_it;
  insert into type_marche_go_no_go (entreprise_id, nom, ordre) values
    (p_entreprise_id, 'Agro-industrie', 6) returning id into v_agro;

  -- 5 questions administratives génériques (ordre 1-5)
  insert into question_go_no_go (entreprise_id, categorie, texte, ordre) values
    (p_entreprise_id, 'administratif', 'Avons-nous l''agrément ou la qualification exigée dans le DAO ?', 1),
    (p_entreprise_id, 'administratif', 'Nos attestations sont-elles à jour (impôts, CNPS, RCCM… selon la liste du DAO) ?', 2),
    (p_entreprise_id, 'administratif', 'Atteignons-nous le chiffre d''affaires moyen exigé ?', 3),
    (p_entreprise_id, 'administratif', 'Avons-nous le nombre de références similaires demandé (attestations de bonne exécution) ?', 4),
    (p_entreprise_id, 'administratif', 'Pouvons-nous fournir la caution de soumission demandée ?', 5);

  -- 1 question ouverture de marché générique (ordre 10, comme le xls)
  insert into question_go_no_go (entreprise_id, categorie, texte, ordre) values
    (p_entreprise_id, 'ouverture_marche', 'Le marché n''est PAS « fléché » (pas de gagnant connu d''avance) ?', 10);

  -- 4 questions savoir-faire par type de marché (ordre 6-9)
  insert into question_go_no_go (entreprise_id, type_marche_id, categorie, texte, ordre) values
    (p_entreprise_id, v_btp, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_btp, 'savoir_faire', 'Avons-nous le matériel minimum demandé (bétonnière, camion benne…) ?', 7),
    (p_entreprise_id, v_btp, 'savoir_faire', 'Le lieu du chantier est-il accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_btp, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'Avons-nous les outils et références méthodologiques demandés pour cette étude ?', 7),
    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'La zone d''intervention est-elle accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_ingenierie, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_environnement, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_environnement, 'savoir_faire', 'Avons-nous le matériel et les agréments environnementaux demandés ?', 7),
    (p_entreprise_id, v_environnement, 'savoir_faire', 'Le site d''intervention est-il accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_environnement, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_energie, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience) ?', 6),
    (p_entreprise_id, v_energie, 'savoir_faire', 'Avons-nous le matériel et les habilitations électriques/solaires demandés ?', 7),
    (p_entreprise_id, v_energie, 'savoir_faire', 'Le site d''intervention est-il accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_energie, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens ?', 9),

    (p_entreprise_id, v_it, 'savoir_faire', 'Avons-nous les profils clés demandés (chef de projet, développeurs, expert données…) avec l''expérience exigée ?', 6),
    (p_entreprise_id, v_it, 'savoir_faire', 'Avons-nous les outils et l''hébergement demandés (serveurs, licences, sécurité) ?', 7),
    (p_entreprise_id, v_it, 'savoir_faire', 'Pouvons-nous assurer la maintenance et l''assistance après livraison sur la durée demandée ?', 8),
    (p_entreprise_id, v_it, 'savoir_faire', 'Le délai de livraison est-il réalisable avec notre équipe actuelle ?', 9),

    (p_entreprise_id, v_agro, 'savoir_faire', 'Avons-nous le personnel clé demandé (diplômes + années d''expérience agricole/agro-industrielle) ?', 6),
    (p_entreprise_id, v_agro, 'savoir_faire', 'Avons-nous le matériel et les agréments sanitaires/phytosanitaires demandés ?', 7),
    (p_entreprise_id, v_agro, 'savoir_faire', 'La zone de production ou d''intervention est-elle accessible pour nous (distance, logistique) ?', 8),
    (p_entreprise_id, v_agro, 'savoir_faire', 'Le délai d''exécution est-il réalisable avec nos moyens (saisonnalité comprise) ?', 9);
end;
$$;

revoke all on function seed_go_no_go(uuid) from public;
grant execute on function seed_go_no_go(uuid) to authenticated;

-- creer_entreprise : corps repris à l'identique de 20261013150000, ajout
-- du seed à la fin.
create or replace function creer_entreprise(p_nom text, p_rccm text default null, p_nom_utilisateur text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  insert into entreprise (nom, rccm) values (p_nom, p_rccm) returning id into v_entreprise_id;
  insert into utilisateur (auth_id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');
  insert into abonnement (entreprise_id) values (v_entreprise_id);
  perform seed_go_no_go(v_entreprise_id);
  return v_entreprise_id;
end;
$$;

-- Backfill : toute entreprise déjà existante n'a jamais eu ce seed (créée
-- avant cette migration). On ne seed que celles qui n'ont encore aucun type
-- de marché Go/No-Go — idempotent si cette migration est relancée.
do $$
declare
  v_entreprise record;
begin
  for v_entreprise in
    select e.id from entreprise e
    where not exists (
      select 1 from type_marche_go_no_go t where t.entreprise_id = e.id
    )
  loop
    perform seed_go_no_go(v_entreprise.id);
  end loop;
end;
$$;
```

- [ ] **Step 2: Relecture à froid (pas de `db push`)**

Vérifier que chaque `insert` référence bien un id de `type_marche_go_no_go` déclaré juste avant (v_btp, v_ingenierie, etc.), et que les `ordre` des questions savoir-faire (6-9) ne chevauchent pas les administratives (1-5) ni l'ouverture de marché (10) — cohérent avec l'affichage trié par `ordre` dans la Tâche 10.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261016110000_go_no_go_seed.sql
git commit -m "feat(go-no-go): seed des types de marché et questions par défaut"
```

---

### Task 3: Types TypeScript

**Files:**
- Modify: `lib/appels-offres/types.ts`
- Modify: `lib/utilisateur/types.ts`

**Interfaces:**
- Consumes: colonnes de la Tâche 1.
- Produces: tous les types utilisés par les Tâches 4 à 13.

- [ ] **Step 1: Retirer les types de l'ancienne évaluation dans `lib/appels-offres/types.ts`**

Supprimer entièrement ce bloc (lignes 173-187 environ, vérifier les numéros exacts avant d'éditer) :

```ts
export const CRITERES_GO_NO_GO = ["a_evaluer", "oui", "non"] as const;
export type CritereGoNoGo = (typeof CRITERES_GO_NO_GO)[number];

export interface EvaluationGoNoGo {
  id: string;
  appel_offres_id: string;
  critere_juridique: CritereGoNoGo;
  note_juridique: string | null;
  critere_faisabilite: CritereGoNoGo;
  note_faisabilite: string | null;
  critere_rentabilite: CritereGoNoGo;
  note_rentabilite: string | null;
  modifie_par: string | null;
  modifie_le: string;
}
```

- [ ] **Step 2: Ajouter les nouveaux types au même endroit**

```ts
export const CATEGORIES_QUESTION_GO_NO_GO = [
  "administratif",
  "savoir_faire",
  "ouverture_marche",
] as const;
export type CategorieQuestionGoNoGo = (typeof CATEGORIES_QUESTION_GO_NO_GO)[number];

export const REPONSES_GO_NO_GO = ["oui", "non", "a_confirmer"] as const;
export type ReponseGoNoGoValeur = (typeof REPONSES_GO_NO_GO)[number];

export interface TypeMarcheGoNoGo {
  id: string;
  entreprise_id: string;
  nom: string;
  actif: boolean;
  ordre: number;
  created_at: string;
}

export interface QuestionGoNoGo {
  id: string;
  entreprise_id: string;
  type_marche_id: string | null;
  categorie: CategorieQuestionGoNoGo;
  texte: string;
  ordre: number;
  actif: boolean;
  created_at: string;
}

export interface ReponseGoNoGo {
  id: string;
  go_no_go_id: string;
  question_id: string;
  texte_question_snapshot: string;
  reponse: ReponseGoNoGoValeur;
  commentaire: string | null;
  modifie_le: string;
}

export interface GoNoGo {
  id: string;
  appel_offres_id: string;
  type_marche_id: string | null;
  montant_marche_estime: number | null;
  cout_total_realisation: number | null;
  prix_dao: number | null;
  caution_soumission: number | null;
  frais_preparation: number | null;
  avance_pourcentage: number | null;
  delai_paiement_jours: number | null;
  argent_disponible_banque: number | null;
  note_interet_strategique: number | null;
  note_client_paie: number | null;
  note_concurrence: number | null;
  note_risques: number | null;
  commentaire_global: string | null;
  modifie_par: string | null;
  modifie_le: string;
}
```

- [ ] **Step 3: Ajouter les 2 colonnes à `Entreprise` dans `lib/utilisateur/types.ts`**

```ts
export interface Entreprise {
  id: string;
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representant_legal_nom: string | null;
  representant_legal_qualite: string | null;
  idu: string | null;
  telephone: string | null;
  email: string | null;
  taux_frais_structure_defaut: number | null;
  secteurs_activite: string[];
  note_min_go_defaut: number;
  marge_min_visee_defaut: number;
  created_at: string;
}
```

- [ ] **Step 4: Vérifier que le projet compile encore (les erreurs sur les fichiers consommant les anciens types sont attendues et seront corrigées par les tâches suivantes)**

Run: `npx tsc --noEmit`
Expected: erreurs listées dans `go-no-go.ts`, `go-no-go.test.ts`, `actions.ts`, `queries.ts`, `go-no-go.tsx` (anciens imports `CritereGoNoGo`/`EvaluationGoNoGo`) — normal à ce stade, elles disparaissent au fil des tâches suivantes.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/types.ts lib/utilisateur/types.ts
git commit -m "feat(go-no-go): nouveaux types, suppression des types de l'évaluation 3-critères"
```

---

### Task 4: Schémas Zod

**Files:**
- Modify: `lib/appels-offres/schema.ts`

**Interfaces:**
- Consumes: `CATEGORIES_QUESTION_GO_NO_GO`, `REPONSES_GO_NO_GO` (Tâche 3).
- Produces: `mettreAJourGoNoGoSchema`, `mettreAJourReponseGoNoGoSchema`, `typeMarcheGoNoGoSchema`, `questionGoNoGoSchema`, `parametresGoNoGoSchema` — noms et formes de retour utilisés tels quels par la Tâche 8.

- [ ] **Step 1: Supprimer `mettreAJourEvaluationGoNoGoSchema`**

Retirer ce bloc de `lib/appels-offres/schema.ts` :

```ts
export const mettreAJourEvaluationGoNoGoSchema = z.object({
  critereJuridique: z.enum(CRITERES_GO_NO_GO),
  noteJuridique: noteGoNoGo,
  critereFaisabilite: z.enum(CRITERES_GO_NO_GO),
  noteFaisabilite: noteGoNoGo,
  critereRentabilite: z.enum(CRITERES_GO_NO_GO),
  noteRentabilite: noteGoNoGo,
});
```

Retirer l'import de `CRITERES_GO_NO_GO` en haut du fichier.

- [ ] **Step 2: Ajouter les helpers de validation numérique, juste avant `export const mettreAJourEvaluationGoNoGoSchema` (maintenant supprimé) — les placer à l'endroit où se trouvait ce bloc**

```ts
function montantNullable() {
  return z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+(\.\d+)?$/.test(v), { message: "Montant invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
      message: "Le montant doit être positif",
    });
}

function pourcentageNullable() {
  return z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+(\.\d+)?$/.test(v), { message: "Pourcentage invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (v >= 0 && v <= 100), {
      message: "Le pourcentage doit être compris entre 0 et 100",
    })
    .transform((v) => (v === null ? null : v / 100));
}

function joursNullable() {
  return z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+$/.test(v), { message: "Nombre de jours invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || v >= 0, { message: "Le délai doit être positif" });
}

function noteBornee(max: number) {
  return z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+$/.test(v), { message: "Note invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (v >= 0 && v <= max), {
      message: `Note hors barème (0 à ${max})`,
    });
}

export const mettreAJourGoNoGoSchema = z.object({
  typeMarcheId: z.string().uuid().nullable(),
  montantMarcheEstime: montantNullable(),
  coutTotalRealisation: montantNullable(),
  prixDao: montantNullable(),
  cautionSoumission: montantNullable(),
  fraisPreparation: montantNullable(),
  avancePourcentage: pourcentageNullable(),
  delaiPaiementJours: joursNullable(),
  argentDisponibleBanque: montantNullable(),
  noteInteretStrategique: noteBornee(4),
  noteClientPaie: noteBornee(3),
  noteConcurrence: noteBornee(2),
  noteRisques: noteBornee(3),
  commentaireGlobal: noteGoNoGo,
});

export const mettreAJourReponseGoNoGoSchema = z.object({
  questionId: z.string().uuid(),
  reponse: z.enum(REPONSES_GO_NO_GO),
  commentaire: noteGoNoGo,
});

export const typeMarcheGoNoGoSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, "Le nom est requis")
    .max(100, "Nom trop long (100 caractères maximum)"),
});

export const questionGoNoGoSchema = z
  .object({
    categorie: z.enum(CATEGORIES_QUESTION_GO_NO_GO),
    typeMarcheId: z.string().uuid().nullable(),
    texte: z
      .string()
      .trim()
      .min(1, "Le texte est requis")
      .max(500, "Texte trop long (500 caractères maximum)"),
  })
  .refine((v) => (v.categorie === "savoir_faire") === (v.typeMarcheId !== null), {
    message: "Une question savoir-faire doit être liée à un type de marché (et inversement).",
    path: ["typeMarcheId"],
  });

export const parametresGoNoGoSchema = z.object({
  noteMinGo: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Note invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => v >= 0 && v <= 20, { message: "La note doit être comprise entre 0 et 20" }),
  margeMinVisee: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Marge invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => v >= 0 && v <= 100, { message: "La marge doit être comprise entre 0 et 100" })
    .transform((v) => v / 100),
});
```

Ajouter l'import `CATEGORIES_QUESTION_GO_NO_GO, REPONSES_GO_NO_GO` en haut du fichier, aux côtés des autres imports de `./types`.

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: plus d'erreur sur `schema.ts` lui-même (les erreurs restantes concernent encore `actions.ts`/`go-no-go.tsx`, corrigées Tâches 8 et 10).

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/schema.ts
git commit -m "feat(go-no-go): schemas zod de la fiche structurée"
```

---

### Task 5: Calculs purs (TDD)

**Files:**
- Create: `lib/appels-offres/go-no-go.ts` (remplace le fichier existant)
- Create: `lib/appels-offres/go-no-go.test.ts` (remplace le fichier existant)

**Interfaces:**
- Produces: `calculerSectionB`, `noteMargeAuto`, `noteTresorerieAuto`, `calculerNoteTotale`, `calculerDecision`, types `MontantsGoNoGo`, `ResultatsSectionB`, `DecisionGoNoGo` — noms et signatures utilisés tels quels par la Tâche 10 (composant fiche).

- [ ] **Step 1: Écrire les tests (remplace entièrement l'ancien fichier)**

```ts
import { describe, expect, it } from "vitest";
import {
  calculerSectionB,
  noteMargeAuto,
  noteTresorerieAuto,
  calculerNoteTotale,
  calculerDecision,
  type MontantsGoNoGo,
} from "./go-no-go";

function montants(partiel: Partial<MontantsGoNoGo>): MontantsGoNoGo {
  return {
    montantMarcheEstime: null,
    coutTotalRealisation: null,
    prixDao: null,
    cautionSoumission: null,
    fraisPreparation: null,
    avancePourcentage: null,
    delaiPaiementJours: null,
    argentDisponibleBanque: null,
    ...partiel,
  };
}

describe("calculerSectionB", () => {
  it("reproduit l'exemple du xls (AO n°012/2026/MENA)", () => {
    const resultat = calculerSectionB(
      montants({
        montantMarcheEstime: 45_000_000,
        coutTotalRealisation: 36_000_000,
        prixDao: 100_000,
        cautionSoumission: 900_000,
        fraisPreparation: 150_000,
        avancePourcentage: 0.15,
        delaiPaiementJours: 120,
        argentDisponibleBanque: 12_000_000,
      }),
    );
    expect(resultat.coutPourRepondre).toBe(1_150_000);
    expect(resultat.beneficeEstime).toBe(9_000_000);
    expect(resultat.margeEstimee).toBeCloseTo(0.2, 5);
    expect(resultat.avanceRecue).toBe(6_750_000);
    expect(resultat.argentAAvancer).toBe(30_150_000);
    expect(resultat.couverture).toBeCloseTo(0.398009950248756, 10);
    expect(resultat.moisATenir).toBe(4);
  });

  it("montant du marché à 0 -> marge à 0 plutôt qu'une division par zéro", () => {
    const resultat = calculerSectionB(montants({ montantMarcheEstime: 0, coutTotalRealisation: 100 }));
    expect(resultat.margeEstimee).toBe(0);
  });

  it("champs tous vides -> tous les résultats à 0, couverture à 1 (rien à avancer)", () => {
    const resultat = calculerSectionB(montants({}));
    expect(resultat.coutPourRepondre).toBe(0);
    expect(resultat.beneficeEstime).toBe(0);
    expect(resultat.margeEstimee).toBe(0);
    expect(resultat.argentAAvancer).toBe(0);
    expect(resultat.couverture).toBe(1);
    expect(resultat.moisATenir).toBe(0);
  });

  it("argent à avancer ne descend jamais sous 0 (avance + caution négative évitée)", () => {
    const resultat = calculerSectionB(
      montants({ coutTotalRealisation: 1000, montantMarcheEstime: 10_000, avancePourcentage: 1, cautionSoumission: 0 }),
    );
    expect(resultat.argentAAvancer).toBe(0);
  });
});

describe("noteMargeAuto", () => {
  it("marge >= 25% -> 4", () => {
    expect(noteMargeAuto(0.3, 0.15)).toBe(4);
    expect(noteMargeAuto(0.25, 0.15)).toBe(4);
  });
  it("marge >= seuil mais < 25% -> 3", () => {
    expect(noteMargeAuto(0.2, 0.15)).toBe(3);
  });
  it("marge >= 10% mais < seuil -> 2", () => {
    expect(noteMargeAuto(0.12, 0.15)).toBe(2);
  });
  it("marge >= 5% mais < 10% -> 1", () => {
    expect(noteMargeAuto(0.07, 0.15)).toBe(1);
  });
  it("marge < 5% -> 0", () => {
    expect(noteMargeAuto(0.02, 0.15)).toBe(0);
  });
});

describe("noteTresorerieAuto", () => {
  it("couverture >= 100% -> 4", () => expect(noteTresorerieAuto(1)).toBe(4));
  it("couverture >= 75% mais < 100% -> 3", () => expect(noteTresorerieAuto(0.8)).toBe(3));
  it("couverture >= 50% mais < 75% -> 2", () => expect(noteTresorerieAuto(0.6)).toBe(2));
  it("couverture >= 30% mais < 50% -> 1", () => expect(noteTresorerieAuto(0.35)).toBe(1));
  it("couverture < 30% -> 0", () => expect(noteTresorerieAuto(0.1)).toBe(0));
});

describe("calculerNoteTotale", () => {
  it("additionne les 6 sous-notes", () => {
    expect(
      calculerNoteTotale({
        noteMarge: 3,
        noteTresorerie: 1,
        noteInteretStrategique: 4,
        noteClientPaie: 2,
        noteConcurrence: 1,
        noteRisques: 2,
      }),
    ).toBe(13);
  });
});

describe("calculerDecision", () => {
  const base = { nombreNon: 0, questionsNonRepondues: 0, champsVides: 0, noteTotale: 15, noteMinGo: 14 };

  it("un seul NON l'emporte sur tout le reste -> no_go", () => {
    expect(calculerDecision({ ...base, nombreNon: 1 })).toBe("no_go");
  });
  it("aucun NON mais questions non répondues -> a_completer", () => {
    expect(calculerDecision({ ...base, questionsNonRepondues: 2 })).toBe("a_completer");
  });
  it("aucun NON mais champs vides -> a_completer", () => {
    expect(calculerDecision({ ...base, champsVides: 1 })).toBe("a_completer");
  });
  it("tout rempli, note >= seuil -> go", () => {
    expect(calculerDecision({ ...base, noteTotale: 14 })).toBe("go");
  });
  it("tout rempli, note < seuil -> no_go", () => {
    expect(calculerDecision({ ...base, noteTotale: 13, noteMinGo: 14 })).toBe("no_go");
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent (fichier `go-no-go.ts` pas encore réécrit)**

Run: `npx vitest run lib/appels-offres/go-no-go.test.ts`
Expected: FAIL — `calculerSectionB`/`noteMargeAuto`/etc. non définis (l'ancien fichier n'exporte que `calculerVerdictGoNoGo`).

- [ ] **Step 3: Réécrire `lib/appels-offres/go-no-go.ts`**

```ts
export interface MontantsGoNoGo {
  montantMarcheEstime: number | null;
  coutTotalRealisation: number | null;
  prixDao: number | null;
  cautionSoumission: number | null;
  fraisPreparation: number | null;
  avancePourcentage: number | null;
  delaiPaiementJours: number | null;
  argentDisponibleBanque: number | null;
}

export interface ResultatsSectionB {
  coutPourRepondre: number;
  beneficeEstime: number;
  margeEstimee: number;
  avanceRecue: number;
  argentAAvancer: number;
  couverture: number;
  moisATenir: number;
}

export function calculerSectionB(montants: MontantsGoNoGo): ResultatsSectionB {
  const montantMarche = montants.montantMarcheEstime ?? 0;
  const coutRealisation = montants.coutTotalRealisation ?? 0;
  const prixDao = montants.prixDao ?? 0;
  const caution = montants.cautionSoumission ?? 0;
  const fraisPreparation = montants.fraisPreparation ?? 0;
  const avancePourcentage = montants.avancePourcentage ?? 0;
  const delaiPaiementJours = montants.delaiPaiementJours ?? 0;
  const argentDisponible = montants.argentDisponibleBanque ?? 0;

  const coutPourRepondre = prixDao + caution + fraisPreparation;
  const beneficeEstime = montantMarche - coutRealisation;
  const margeEstimee = montantMarche === 0 ? 0 : beneficeEstime / montantMarche;
  const avanceRecue = montantMarche * avancePourcentage;
  const argentAAvancer = Math.max(0, coutRealisation - avanceRecue + caution);
  const couverture = argentAAvancer === 0 ? 1 : argentDisponible / argentAAvancer;
  const moisATenir = delaiPaiementJours / 30;

  return { coutPourRepondre, beneficeEstime, margeEstimee, avanceRecue, argentAAvancer, couverture, moisATenir };
}

export function noteMargeAuto(margeEstimee: number, margeMinVisee: number): number {
  if (margeEstimee >= 0.25) return 4;
  if (margeEstimee >= margeMinVisee) return 3;
  if (margeEstimee >= 0.1) return 2;
  if (margeEstimee >= 0.05) return 1;
  return 0;
}

export function noteTresorerieAuto(couverture: number): number {
  if (couverture >= 1) return 4;
  if (couverture >= 0.75) return 3;
  if (couverture >= 0.5) return 2;
  if (couverture >= 0.3) return 1;
  return 0;
}

export function calculerNoteTotale(notes: {
  noteMarge: number;
  noteTresorerie: number;
  noteInteretStrategique: number;
  noteClientPaie: number;
  noteConcurrence: number;
  noteRisques: number;
}): number {
  return (
    notes.noteMarge +
    notes.noteTresorerie +
    notes.noteInteretStrategique +
    notes.noteClientPaie +
    notes.noteConcurrence +
    notes.noteRisques
  );
}

export type DecisionGoNoGo = "go" | "no_go" | "a_completer";

export function calculerDecision(params: {
  nombreNon: number;
  questionsNonRepondues: number;
  champsVides: number;
  noteTotale: number;
  noteMinGo: number;
}): DecisionGoNoGo {
  if (params.nombreNon > 0) return "no_go";
  if (params.questionsNonRepondues > 0 || params.champsVides > 0) return "a_completer";
  return params.noteTotale >= params.noteMinGo ? "go" : "no_go";
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/go-no-go.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/go-no-go.ts lib/appels-offres/go-no-go.test.ts
git commit -m "feat(go-no-go): calculs purs section B/C et décision (remplace calculerVerdictGoNoGo)"
```

---

### Task 6: Suggestions documentaires (TDD)

**Files:**
- Create: `lib/appels-offres/go-no-go-suggestions.ts`
- Create: `lib/appels-offres/go-no-go-suggestions.test.ts`

**Interfaces:**
- Consumes: `Document` (`lib/documents/types.ts`).
- Produces: `suggererReponseAgrement`, `suggererReponseAttestations` — utilisés par la Tâche 11 (page détail AO).

- [ ] **Step 1: Écrire les tests**

```ts
import { describe, expect, it } from "vitest";
import { suggererReponseAgrement, suggererReponseAttestations } from "./go-no-go-suggestions";
import type { Document } from "@/lib/documents/types";

function document(partiel: Partial<Document>): Document {
  return {
    id: "doc-1",
    entreprise_id: "entreprise-1",
    type: "piece_administrative",
    nom: "Test",
    fichier_path: "x",
    fichier_nom_original: "x.pdf",
    mime_type: "application/pdf",
    taille_octets: 100,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partiel,
  };
}

describe("suggererReponseAgrement", () => {
  it("aucun document de type agrement -> non", () => {
    expect(suggererReponseAgrement([document({ type: "piece_administrative" })])).toBe("non");
  });

  it("un agrément sans date d'expiration -> oui", () => {
    expect(suggererReponseAgrement([document({ type: "agrement", date_expiration: null })])).toBe("oui");
  });

  it("un agrément expiré -> non", () => {
    expect(
      suggererReponseAgrement([document({ type: "agrement", date_expiration: "2020-01-01" })]),
    ).toBe("non");
  });

  it("un agrément expiré et un valide -> oui (au moins un valide suffit)", () => {
    expect(
      suggererReponseAgrement([
        document({ type: "agrement", date_expiration: "2020-01-01" }),
        document({ type: "agrement", date_expiration: "2099-01-01" }),
      ]),
    ).toBe("oui");
  });
});

describe("suggererReponseAttestations", () => {
  it("aucune pièce administrative -> non", () => {
    expect(suggererReponseAttestations([document({ type: "agrement" })])).toBe("non");
  });

  it("toutes les pièces administratives valides -> oui", () => {
    expect(
      suggererReponseAttestations([
        document({ type: "piece_administrative", date_expiration: "2099-01-01" }),
        document({ type: "piece_administrative", date_expiration: null }),
      ]),
    ).toBe("oui");
  });

  it("au moins une pièce administrative expirée -> non (toutes doivent être à jour)", () => {
    expect(
      suggererReponseAttestations([
        document({ type: "piece_administrative", date_expiration: "2099-01-01" }),
        document({ type: "piece_administrative", date_expiration: "2020-01-01" }),
      ]),
    ).toBe("non");
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/appels-offres/go-no-go-suggestions.test.ts`
Expected: FAIL — fichier `go-no-go-suggestions.ts` inexistant.

- [ ] **Step 3: Écrire `lib/appels-offres/go-no-go-suggestions.ts`**

```ts
import type { Document } from "@/lib/documents/types";

export type SuggestionAdministrative = "oui" | "non";

function documentValide(document: Document): boolean {
  if (!document.date_expiration) return true;
  return new Date(document.date_expiration) >= new Date();
}

export function suggererReponseAgrement(documents: Document[]): SuggestionAdministrative {
  const agrements = documents.filter((d) => d.type === "agrement");
  if (agrements.length === 0) return "non";
  // "some" et pas "every" : un seul agrément valide suffit à répondre OUI à
  // "avons-nous l'agrément exigé" — contrairement aux attestations
  // ci-dessous où TOUTES les pièces demandées doivent être à jour.
  return agrements.some(documentValide) ? "oui" : "non";
}

export function suggererReponseAttestations(documents: Document[]): SuggestionAdministrative {
  const pieces = documents.filter((d) => d.type === "piece_administrative");
  if (pieces.length === 0) return "non";
  return pieces.every(documentValide) ? "oui" : "non";
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/appels-offres/go-no-go-suggestions.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/go-no-go-suggestions.ts lib/appels-offres/go-no-go-suggestions.test.ts
git commit -m "feat(go-no-go): suggestions administratif depuis la bibliotheque documentaire"
```

---

### Task 7: Queries

**Files:**
- Modify: `lib/appels-offres/queries.ts`
- Modify: `lib/utilisateur/queries.ts`

**Interfaces:**
- Consumes: tables Tâche 1, types Tâche 3.
- Produces: `obtenirOuCreerGoNoGo(appelOffresId, montantCautionDefaut)`, `listerTypesMarcheGoNoGo(entrepriseId)`, `listerQuestionsGoNoGo(entrepriseId)`, `listerReponsesGoNoGo(goNoGoId)` ; `obtenirParametresGoNoGo(entrepriseId)` — signatures utilisées telles quelles par la Tâche 11.

- [ ] **Step 1: Supprimer `obtenirEvaluationGoNoGo` dans `lib/appels-offres/queries.ts`**

Retirer la fonction entière (identifiée plus haut, de `export async function obtenirEvaluationGoNoGo` jusqu'à son `}` de fermeture) et l'import `EvaluationGoNoGo` dans l'en-tête du fichier.

- [ ] **Step 2: Ajouter les nouvelles fonctions, au même emplacement**

```ts
// Même raisonnement que obtenirOuCreerDossierReponse : la page de détail a
// besoin de cette ligne pour fonctionner, un échec doit remonter une vraie
// erreur plutôt qu'être avalé (contrairement à l'insertion best-effort de
// traitement.ts).
export async function obtenirOuCreerGoNoGo(
  appelOffresId: string,
  montantCautionDefaut: number | null,
): Promise<GoNoGo> {
  const supabase = await createClient();

  const { data: existant } = await supabase
    .from("go_no_go")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (existant) return existant as GoNoGo;

  const { data: cree, error: erreurInsertion } = await supabase
    .from("go_no_go")
    .insert({ appel_offres_id: appelOffresId, caution_soumission: montantCautionDefaut })
    .select("*")
    .maybeSingle();

  if (!erreurInsertion && cree) return cree as GoNoGo;

  // Course possible avec une autre requête concurrente (deux onglets ouverts
  // sur le même AO) : la contrainte unique sur appel_offres_id a été
  // violée. Non fatal — la ligne existe forcément à ce stade, on la relit.
  const { data: relu, error: erreurRelecture } = await supabase
    .from("go_no_go")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (!relu) {
    throw new Error("Échec de la création de la fiche Go/No-Go.", {
      cause: erreurRelecture ?? erreurInsertion,
    });
  }

  return relu as GoNoGo;
}

export async function listerTypesMarcheGoNoGo(entrepriseId: string): Promise<TypeMarcheGoNoGo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("type_marche_go_no_go")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .eq("actif", true)
    .order("ordre", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TypeMarcheGoNoGo[];
}

export async function listerQuestionsGoNoGo(entrepriseId: string): Promise<QuestionGoNoGo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .eq("actif", true)
    .order("ordre", { ascending: true });

  if (error) throw error;
  return (data ?? []) as QuestionGoNoGo[];
}

export async function listerReponsesGoNoGo(goNoGoId: string): Promise<ReponseGoNoGo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reponse_go_no_go")
    .select("*")
    .eq("go_no_go_id", goNoGoId);

  if (error) throw error;
  return (data ?? []) as ReponseGoNoGo[];
}
```

Ajouter l'import `GoNoGo, TypeMarcheGoNoGo, QuestionGoNoGo, ReponseGoNoGo` dans l'en-tête du fichier (remplace `EvaluationGoNoGo` retiré au Step 1).

- [ ] **Step 3: Ajouter `obtenirParametresGoNoGo` dans `lib/utilisateur/queries.ts`, à côté de `obtenirTauxFraisStructureDefaut`**

```ts
export async function obtenirParametresGoNoGo(
  entrepriseId: string,
): Promise<{ noteMinGo: number; margeMinVisee: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entreprise")
    .select("note_min_go_defaut, marge_min_visee_defaut")
    .eq("id", entrepriseId)
    .maybeSingle();

  if (error) throw error;
  return {
    noteMinGo: data?.note_min_go_defaut ?? 14,
    margeMinVisee: data?.marge_min_visee_defaut ?? 0.15,
  };
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: plus d'erreur sur `queries.ts` (restent `actions.ts`, `go-no-go.tsx`, `appel-offres-detail.tsx`, `page.tsx` — Tâches 8, 10, 11).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/queries.ts lib/utilisateur/queries.ts
git commit -m "feat(go-no-go): queries get-or-create et listing (types/questions/reponses/parametres)"
```

---

### Task 8: Server actions

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: schémas Tâche 4, types Tâche 3.
- Produces: `mettreAJourGoNoGo`, `mettreAJourReponseGoNoGo`, `creerTypeMarcheGoNoGo`, `modifierTypeMarcheGoNoGo`, `desactiverTypeMarcheGoNoGo`, `creerQuestionGoNoGo`, `modifierQuestionGoNoGo`, `desactiverQuestionGoNoGo`, `modifierParametresGoNoGo` — noms utilisés tels quels par les Tâches 10, 12, 13.

- [ ] **Step 1: Supprimer `mettreAJourEvaluationGoNoGo`**

Retirer la fonction entière identifiée plus haut (`export async function mettreAJourEvaluationGoNoGo` ... jusqu'à son `}` fermant) et les imports devenus inutiles (`mettreAJourEvaluationGoNoGoSchema`, `CritereGoNoGo`).

- [ ] **Step 2: Ajouter `mettreAJourGoNoGo` et `mettreAJourReponseGoNoGo`, au même emplacement**

```ts
export async function mettreAJourGoNoGo(
  appelOffresId: string,
  input: {
    typeMarcheId: string | null;
    montantMarcheEstime: string | null;
    coutTotalRealisation: string | null;
    prixDao: string | null;
    cautionSoumission: string | null;
    fraisPreparation: string | null;
    avancePourcentage: string | null;
    delaiPaiementJours: string | null;
    argentDisponibleBanque: string | null;
    noteInteretStrategique: string | null;
    noteClientPaie: string | null;
    noteConcurrence: string | null;
    noteRisques: string | null;
    commentaireGlobal: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = mettreAJourGoNoGoSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("go_no_go")
    .update({
      type_marche_id: parsed.data.typeMarcheId,
      montant_marche_estime: parsed.data.montantMarcheEstime,
      cout_total_realisation: parsed.data.coutTotalRealisation,
      prix_dao: parsed.data.prixDao,
      caution_soumission: parsed.data.cautionSoumission,
      frais_preparation: parsed.data.fraisPreparation,
      avance_pourcentage: parsed.data.avancePourcentage,
      delai_paiement_jours: parsed.data.delaiPaiementJours,
      argent_disponible_banque: parsed.data.argentDisponibleBanque,
      note_interet_strategique: parsed.data.noteInteretStrategique,
      note_client_paie: parsed.data.noteClientPaie,
      note_concurrence: parsed.data.noteConcurrence,
      note_risques: parsed.data.noteRisques,
      commentaire_global: parsed.data.commentaireGlobal,
      modifie_par: utilisateur.id,
      modifie_le: new Date().toISOString(),
    })
    .eq("appel_offres_id", appelOffresId)
    .select("id");

  if (error) return { erreur: "Échec de l'enregistrement. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Fiche Go/No-Go introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function mettreAJourReponseGoNoGo(
  goNoGoId: string,
  appelOffresId: string,
  input: { questionId: string; texteQuestionSnapshot: string; reponse: ReponseGoNoGoValeur; commentaire: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = mettreAJourReponseGoNoGoSchema.safeParse({
    questionId: input.questionId,
    reponse: input.reponse,
    commentaire: input.commentaire,
  });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reponse_go_no_go").upsert(
    {
      go_no_go_id: goNoGoId,
      question_id: parsed.data.questionId,
      texte_question_snapshot: input.texteQuestionSnapshot,
      reponse: parsed.data.reponse,
      commentaire: parsed.data.commentaire,
      modifie_le: new Date().toISOString(),
    },
    { onConflict: "go_no_go_id,question_id" },
  );

  if (error) return { erreur: "Échec de l'enregistrement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

Ajouter les imports `mettreAJourGoNoGoSchema, mettreAJourReponseGoNoGoSchema, typeMarcheGoNoGoSchema, questionGoNoGoSchema, parametresGoNoGoSchema` et `ReponseGoNoGoValeur` dans l'en-tête (remplace `mettreAJourEvaluationGoNoGoSchema`/`CritereGoNoGo` retirés).

- [ ] **Step 3: Ajouter les actions de paramétrage, en fin de fichier**

```ts
export async function creerTypeMarcheGoNoGo(
  input: { nom: string },
): Promise<{ erreur: string } | { succes: true; id: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = typeMarcheGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("type_marche_go_no_go")
    .insert({ entreprise_id: utilisateur.entreprise_id, nom: parsed.data.nom })
    .select("id")
    .single();

  if (error || !data) return { erreur: "Échec de la création. Réessayez." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const, id: data.id as string };
}

export async function modifierTypeMarcheGoNoGo(
  id: string,
  input: { nom: string },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = typeMarcheGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("type_marche_go_no_go")
    .update({ nom: parsed.data.nom })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Type de marché introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function desactiverTypeMarcheGoNoGo(
  id: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("type_marche_go_no_go")
    .update({ actif: false })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la désactivation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Type de marché introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function creerQuestionGoNoGo(
  input: { categorie: CategorieQuestionGoNoGo; typeMarcheId: string | null; texte: string },
): Promise<{ erreur: string } | { succes: true; id: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = questionGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .insert({
      entreprise_id: utilisateur.entreprise_id,
      categorie: parsed.data.categorie,
      type_marche_id: parsed.data.typeMarcheId,
      texte: parsed.data.texte,
    })
    .select("id")
    .single();

  if (error || !data) return { erreur: "Échec de la création. Réessayez." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const, id: data.id as string };
}

export async function modifierQuestionGoNoGo(
  id: string,
  input: { texte: string },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = z.object({ texte: z.string().trim().min(1, "Le texte est requis").max(500, "Texte trop long (500 caractères maximum)") }).safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .update({ texte: parsed.data.texte })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Question introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function desactiverQuestionGoNoGo(
  id: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .update({ actif: false })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la désactivation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Question introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function modifierParametresGoNoGo(
  input: { noteMinGo: string; margeMinVisee: string },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = parametresGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({
      note_min_go_defaut: parsed.data.noteMinGo,
      marge_min_visee_defaut: parsed.data.margeMinVisee,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}
```

Ajouter l'import `CategorieQuestionGoNoGo` et vérifier que `z` (zod) est déjà importé en haut du fichier (c'est le cas — réutilisé par d'autres actions).

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: plus d'erreur sur `actions.ts` (restent `go-no-go.tsx`, `appel-offres-detail.tsx`, `page.tsx` — Tâches 10, 11, 12, 13).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat(go-no-go): server actions de la fiche et du parametrage"
```

---

### Task 9: i18n

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces: namespaces `AppelsOffres.detail.goNoGo.*`, `AppelsOffres.detail.onglets.goNoGo`, `Parametres.goNoGo.*`, `Parametres.goNoGoTypesMarche.*` — clés exactes consommées par les Tâches 10, 11, 12, 13.

- [ ] **Step 1: Remplacer le bloc `AppelsOffres.detail.goNoGo` dans `messages/fr.json`**

Ancien bloc à remplacer (celui vu plus haut, clés `titre`/`criteres`/`critereValeur`/`verdict`/`notePlaceholder`/`boutonEnregistrer`/`envoiEnCours`/`toastEnregistre`) :

```json
"goNoGo": {
  "titre": "Fiche Go/No-Go",
  "selecteurTypeMarche": "Type de marché",
  "typeMarcheNonChoisi": "Choisissez un type de marché pour afficher les questions savoir-faire",
  "sectionA": {
    "titre": "Questions éliminatoires",
    "groupeAdministratif": "Peut-on déposer ?",
    "groupeSavoirFaire": "Savons-nous faire ?",
    "groupeOuvertureMarche": "Le marché est-il vraiment ouvert ?",
    "reponse": {
      "oui": "Oui",
      "non": "Non",
      "a_confirmer": "À confirmer"
    },
    "commentairePlaceholder": "Commentaire (optionnel)",
    "nombreNon": "Nombre de NON",
    "questionsNonRepondues": "Questions non répondues"
  },
  "sectionB": {
    "titre": "Calculs d'argent",
    "montantMarcheEstime": "Montant estimé du marché (notre prix de vente)",
    "coutTotalRealisation": "Coût total pour réaliser le marché",
    "prixDao": "Prix d'achat du DAO",
    "cautionSoumission": "Caution de soumission",
    "fraisPreparation": "Frais de préparation (impression, transport, légalisations)",
    "avancePourcentage": "Avance de démarrage versée par le client (%)",
    "delaiPaiementJours": "Délai de paiement du client (jours)",
    "argentDisponibleBanque": "Argent disponible en banque pour ce marché",
    "cautionSuggeree": "Pré-rempli depuis le montant de caution de l'AO",
    "coutPourRepondre": "Coût pour répondre",
    "beneficeEstime": "Bénéfice estimé",
    "margeEstimee": "Marge estimée",
    "avanceRecue": "Avance reçue du client",
    "argentAAvancer": "Argent à avancer avant d'être payé",
    "couverture": "Couverture (argent dispo ÷ argent à avancer)",
    "moisATenir": "Mois à tenir sans paiement"
  },
  "sectionC": {
    "titre": "Note sur 20",
    "noteMarge": "Marge (calcul automatique)",
    "noteTresorerie": "Trésorerie (calcul automatique)",
    "noteInteretStrategique": "Intérêt stratégique",
    "noteClientPaie": "Le client paie bien",
    "noteConcurrence": "Concurrence",
    "noteRisques": "Risques (pénalités, retenue, site)",
    "noteTotale": "Note totale"
  },
  "decision": {
    "titre": "Décision",
    "achatDao": {
      "go": "ACHETER LE DAO",
      "no_go": "NE PAS ACHETER",
      "a_completer": "À COMPLÉTER"
    },
    "postAchat": {
      "go": "GO — on répond",
      "no_go": "NO GO — on ne répond pas",
      "a_completer": "À COMPLÉTER"
    },
    "boutonMarquerSansSuite": "Marquer sans suite"
  },
  "suggestion": "Suggéré : {valeur}",
  "boutonEnregistrer": "Enregistrer",
  "envoiEnCours": "Enregistrement...",
  "toastEnregistre": "Fiche Go/No-Go enregistrée"
}
```

- [ ] **Step 2: Ajouter `goNoGo` dans `AppelsOffres.detail.onglets`**

```json
"onglets": {
  "vueEnsemble": "Vue d'ensemble",
  "goNoGo": "Go/No-Go",
  "offreTechnique": "Offre technique",
  "offreFinanciere": "Offre financière"
}
```

- [ ] **Step 3: Ajouter les namespaces `Parametres.goNoGo` et `Parametres.goNoGoTypesMarche`, au même niveau que `Parametres.tauxFraisStructure`**

```json
"goNoGo": {
  "titre": "Go/No-Go",
  "description": "Seuils utilisés pour calculer la décision Go/No-Go.",
  "champNoteMinGo": "Note minimale pour dire GO (sur 20)",
  "champMargeMinVisee": "Marge minimale visée (%)",
  "lienParametrage": "Gérer les types de marché et les questions",
  "toastEnregistre": "Paramètres enregistrés"
},
"goNoGoTypesMarche": {
  "titre": "Types de marché Go/No-Go",
  "description": "Chaque type de marché a ses propres questions \"savons-nous faire ?\".",
  "filAriane": "Types de marché",
  "boutonAjouterType": "Ajouter un type de marché",
  "champNom": "Nom",
  "boutonDesactiver": "Désactiver",
  "boutonEnregistrer": "Enregistrer",
  "boutonAnnuler": "Annuler",
  "questionsGenerales": "Questions générales (administratif et ouverture de marché)",
  "questionsSavoirFaire": "Questions savoir-faire — {typeMarche}",
  "boutonAjouterQuestion": "Ajouter une question",
  "champTexteQuestion": "Texte de la question",
  "toastEnregistre": "Enregistré"
}
```

- [ ] **Step 4: Répéter les Steps 1-3 dans `messages/en.json`** (anglais non prioritaire mais clés requises pour ne pas casser le build next-intl — traduction simple, pas besoin d'une relecture soignée) :

```json
"goNoGo": {
  "titre": "Go/No-Go form",
  "selecteurTypeMarche": "Market type",
  "typeMarcheNonChoisi": "Choose a market type to show the know-how questions",
  "sectionA": {
    "titre": "Eliminatory questions",
    "groupeAdministratif": "Can we submit?",
    "groupeSavoirFaire": "Do we know how to do it?",
    "groupeOuvertureMarche": "Is the market really open?",
    "reponse": { "oui": "Yes", "non": "No", "a_confirmer": "To confirm" },
    "commentairePlaceholder": "Comment (optional)",
    "nombreNon": "Number of NO",
    "questionsNonRepondues": "Unanswered questions"
  },
  "sectionB": {
    "titre": "Financial calculations",
    "montantMarcheEstime": "Estimated contract amount (our selling price)",
    "coutTotalRealisation": "Total cost to deliver the contract",
    "prixDao": "Tender document purchase price",
    "cautionSoumission": "Bid bond",
    "fraisPreparation": "Preparation costs (printing, travel, notarization)",
    "avancePourcentage": "Advance payment from the client (%)",
    "delaiPaiementJours": "Client payment term (days)",
    "argentDisponibleBanque": "Cash available in the bank for this contract",
    "cautionSuggeree": "Pre-filled from the AO's bid bond amount",
    "coutPourRepondre": "Cost to respond",
    "beneficeEstime": "Estimated profit",
    "margeEstimee": "Estimated margin",
    "avanceRecue": "Advance received from the client",
    "argentAAvancer": "Cash to advance before being paid",
    "couverture": "Coverage (available cash ÷ cash to advance)",
    "moisATenir": "Months to hold without payment"
  },
  "sectionC": {
    "titre": "Score out of 20",
    "noteMarge": "Margin (automatic)",
    "noteTresorerie": "Cash flow (automatic)",
    "noteInteretStrategique": "Strategic interest",
    "noteClientPaie": "Client pays well",
    "noteConcurrence": "Competition",
    "noteRisques": "Risks (penalties, retention, site)",
    "noteTotale": "Total score"
  },
  "decision": {
    "titre": "Decision",
    "achatDao": { "go": "BUY THE TENDER DOCUMENT", "no_go": "DO NOT BUY", "a_completer": "TO COMPLETE" },
    "postAchat": { "go": "GO — we respond", "no_go": "NO GO — we do not respond", "a_completer": "TO COMPLETE" },
    "boutonMarquerSansSuite": "Mark as dropped"
  },
  "suggestion": "Suggested: {valeur}",
  "boutonEnregistrer": "Save",
  "envoiEnCours": "Saving...",
  "toastEnregistre": "Go/No-Go form saved"
}
```

Et dans `onglets` : `"goNoGo": "Go/No-Go"`. Et pour `Parametres.goNoGo`/`Parametres.goNoGoTypesMarche`, même structure que le fr avec un texte anglais simple équivalent.

- [ ] **Step 5: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf-8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf-8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "feat(go-no-go): traductions fr/en de la fiche et du parametrage"
```

---

### Task 10: Composant fiche Go/No-Go

**Files:**
- Create: `app/(app)/appels-offres/[id]/go-no-go.tsx` (remplace le fichier existant)

**Interfaces:**
- Consumes: `calculerSectionB, noteMargeAuto, noteTresorerieAuto, calculerNoteTotale, calculerDecision` (Tâche 5), `mettreAJourGoNoGo, mettreAJourReponseGoNoGo` (Tâche 8), types `GoNoGo, TypeMarcheGoNoGo, QuestionGoNoGo, ReponseGoNoGo, CategorieQuestionGoNoGo, ReponseGoNoGoValeur, REPONSES_GO_NO_GO` (Tâche 3).
- Produces: composant `GoNoGo` avec props `{ appelOffresId, achatDaoEffectue, goNoGo, typesMarche, questions, reponses, parametres, suggestionAgrement, suggestionAttestations }` — props exactes consommées par la Tâche 11.

- [ ] **Step 1: Écrire le composant**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { mettreAJourGoNoGo, mettreAJourReponseGoNoGo } from "@/lib/appels-offres/actions";
import {
  calculerSectionB,
  noteMargeAuto,
  noteTresorerieAuto,
  calculerNoteTotale,
  calculerDecision,
} from "@/lib/appels-offres/go-no-go";
import {
  REPONSES_GO_NO_GO,
  type GoNoGo as GoNoGoFiche,
  type TypeMarcheGoNoGo,
  type QuestionGoNoGo,
  type ReponseGoNoGo,
  type ReponseGoNoGoValeur,
} from "@/lib/appels-offres/types";
import type { SuggestionAdministrative } from "@/lib/appels-offres/go-no-go-suggestions";

const VARIANT_DECISION = {
  go: "default",
  no_go: "destructive",
  a_completer: "outline",
} as const;

function champNumerique(valeur: number | null): string {
  return valeur === null ? "" : String(valeur);
}

export function GoNoGo({
  appelOffresId,
  achatDaoEffectue,
  goNoGo,
  typesMarche,
  questions,
  reponses,
  parametres,
  suggestionAgrement,
  suggestionAttestations,
}: {
  appelOffresId: string;
  achatDaoEffectue: boolean;
  goNoGo: GoNoGoFiche;
  typesMarche: TypeMarcheGoNoGo[];
  questions: QuestionGoNoGo[];
  reponses: ReponseGoNoGo[];
  parametres: { noteMinGo: number; margeMinVisee: number };
  suggestionAgrement: SuggestionAdministrative;
  suggestionAttestations: SuggestionAdministrative;
}) {
  const t = useTranslations("AppelsOffres.detail.goNoGo");
  const [typeMarcheId, setTypeMarcheId] = useState<string | null>(goNoGo.type_marche_id);
  const [montants, setMontants] = useState({
    montantMarcheEstime: champNumerique(goNoGo.montant_marche_estime),
    coutTotalRealisation: champNumerique(goNoGo.cout_total_realisation),
    prixDao: champNumerique(goNoGo.prix_dao),
    cautionSoumission: champNumerique(goNoGo.caution_soumission),
    fraisPreparation: champNumerique(goNoGo.frais_preparation),
    avancePourcentage: goNoGo.avance_pourcentage === null ? "" : String(goNoGo.avance_pourcentage * 100),
    delaiPaiementJours: champNumerique(goNoGo.delai_paiement_jours),
    argentDisponibleBanque: champNumerique(goNoGo.argent_disponible_banque),
  });
  const [notesManuelles, setNotesManuelles] = useState({
    noteInteretStrategique: champNumerique(goNoGo.note_interet_strategique),
    noteClientPaie: champNumerique(goNoGo.note_client_paie),
    noteConcurrence: champNumerique(goNoGo.note_concurrence),
    noteRisques: champNumerique(goNoGo.note_risques),
  });
  const [commentaireGlobal, setCommentaireGlobal] = useState(goNoGo.commentaire_global ?? "");
  const [reponsesLocales, setReponsesLocales] = useState<Map<string, { reponse: ReponseGoNoGoValeur; commentaire: string }>>(
    new Map(reponses.map((r) => [r.question_id, { reponse: r.reponse, commentaire: r.commentaire ?? "" }])),
  );
  const [envoi, setEnvoi] = useState(false);

  const questionsAdministratif = questions.filter((q) => q.categorie === "administratif");
  const questionsOuvertureMarche = questions.filter((q) => q.categorie === "ouverture_marche");
  const questionsSavoirFaire = questions.filter(
    (q) => q.categorie === "savoir_faire" && q.type_marche_id === typeMarcheId,
  );
  const questionsActives = [...questionsAdministratif, ...questionsSavoirFaire, ...questionsOuvertureMarche];

  const resultatsB = useMemo(
    () =>
      calculerSectionB({
        montantMarcheEstime: montants.montantMarcheEstime ? Number(montants.montantMarcheEstime) : null,
        coutTotalRealisation: montants.coutTotalRealisation ? Number(montants.coutTotalRealisation) : null,
        prixDao: montants.prixDao ? Number(montants.prixDao) : null,
        cautionSoumission: montants.cautionSoumission ? Number(montants.cautionSoumission) : null,
        fraisPreparation: montants.fraisPreparation ? Number(montants.fraisPreparation) : null,
        avancePourcentage: montants.avancePourcentage ? Number(montants.avancePourcentage) / 100 : null,
        delaiPaiementJours: montants.delaiPaiementJours ? Number(montants.delaiPaiementJours) : null,
        argentDisponibleBanque: montants.argentDisponibleBanque ? Number(montants.argentDisponibleBanque) : null,
      }),
    [montants],
  );

  const noteMarge = noteMargeAuto(resultatsB.margeEstimee, parametres.margeMinVisee);
  const noteTresorerie = noteTresorerieAuto(resultatsB.couverture);
  const noteTotale = calculerNoteTotale({
    noteMarge,
    noteTresorerie,
    noteInteretStrategique: Number(notesManuelles.noteInteretStrategique || 0),
    noteClientPaie: Number(notesManuelles.noteClientPaie || 0),
    noteConcurrence: Number(notesManuelles.noteConcurrence || 0),
    noteRisques: Number(notesManuelles.noteRisques || 0),
  });

  const nombreNon = questionsActives.filter((q) => reponsesLocales.get(q.id)?.reponse === "non").length;
  const questionsNonRepondues = questionsActives.filter((q) => {
    const r = reponsesLocales.get(q.id)?.reponse;
    return r === undefined || r === "a_confirmer";
  }).length;
  const champsVidesMontants = Object.values(montants).filter((v) => v.trim().length === 0).length;
  const champsVidesNotes = Object.values(notesManuelles).filter((v) => v.trim().length === 0).length;
  const champsVides = champsVidesMontants + champsVidesNotes + (typeMarcheId === null ? 1 : 0);

  const decision = calculerDecision({
    nombreNon,
    questionsNonRepondues,
    champsVides,
    noteTotale,
    noteMinGo: parametres.noteMinGo,
  });

  async function enregistrerReponse(question: QuestionGoNoGo, reponse: ReponseGoNoGoValeur, commentaire: string) {
    setReponsesLocales((carte) => new Map(carte).set(question.id, { reponse, commentaire }));
    const resultat = await mettreAJourReponseGoNoGo(goNoGo.id, appelOffresId, {
      questionId: question.id,
      texteQuestionSnapshot: question.texte,
      reponse,
      commentaire: commentaire.trim().length > 0 ? commentaire : null,
    });
    if ("erreur" in resultat) toast.error(resultat.erreur);
  }

  async function enregistrer() {
    setEnvoi(true);
    const resultat = await mettreAJourGoNoGo(appelOffresId, {
      typeMarcheId,
      montantMarcheEstime: montants.montantMarcheEstime || null,
      coutTotalRealisation: montants.coutTotalRealisation || null,
      prixDao: montants.prixDao || null,
      cautionSoumission: montants.cautionSoumission || null,
      fraisPreparation: montants.fraisPreparation || null,
      avancePourcentage: montants.avancePourcentage || null,
      delaiPaiementJours: montants.delaiPaiementJours || null,
      argentDisponibleBanque: montants.argentDisponibleBanque || null,
      noteInteretStrategique: notesManuelles.noteInteretStrategique || null,
      noteClientPaie: notesManuelles.noteClientPaie || null,
      noteConcurrence: notesManuelles.noteConcurrence || null,
      noteRisques: notesManuelles.noteRisques || null,
      commentaireGlobal: commentaireGlobal.trim().length > 0 ? commentaireGlobal : null,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  function groupeQuestions(titre: string, liste: QuestionGoNoGo[]) {
    if (liste.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        <h3 className="font-medium">{titre}</h3>
        {liste.map((question) => {
          const etat = reponsesLocales.get(question.id);
          const suggestion =
            question.texte.toLowerCase().includes("agrément") ? suggestionAgrement
            : question.texte.toLowerCase().includes("attestations") ? suggestionAttestations
            : null;
          return (
            <div key={question.id} className="flex flex-col gap-2 border-b pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor={`question-${question.id}`}>{question.texte}</Label>
                {suggestion && !etat && (
                  <Badge variant="outline">{t("suggestion", { valeur: t(`sectionA.reponse.${suggestion}`) })}</Badge>
                )}
              </div>
              <Select
                value={etat?.reponse ?? ""}
                onValueChange={(valeur) =>
                  enregistrerReponse(question, valeur as ReponseGoNoGoValeur, etat?.commentaire ?? "")
                }
              >
                <SelectTrigger id={`question-${question.id}`} className="w-48">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {REPONSES_GO_NO_GO.map((valeur) => (
                    <SelectItem key={valeur} value={valeur}>
                      {t(`sectionA.reponse.${valeur}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={etat?.commentaire ?? ""}
                onChange={(e) => enregistrerReponse(question, etat?.reponse ?? "a_confirmer", e.target.value)}
                placeholder={t("sectionA.commentairePlaceholder")}
                rows={2}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="go-no-go-type-marche">{t("selecteurTypeMarche")}</Label>
        <Select value={typeMarcheId ?? ""} onValueChange={(v) => setTypeMarcheId(v)}>
          <SelectTrigger id="go-no-go-type-marche" className="w-64">
            <SelectValue placeholder={t("typeMarcheNonChoisi")} />
          </SelectTrigger>
          <SelectContent>
            {typesMarche.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h2 className="text-lg font-semibold">{t("sectionA.titre")}</h2>
        {groupeQuestions(t("sectionA.groupeAdministratif"), questionsAdministratif)}
        {typeMarcheId === null ? (
          <p className="text-sm text-muted-foreground">{t("typeMarcheNonChoisi")}</p>
        ) : (
          groupeQuestions(t("sectionA.groupeSavoirFaire"), questionsSavoirFaire)
        )}
        {groupeQuestions(t("sectionA.groupeOuvertureMarche"), questionsOuvertureMarche)}
        <div className="flex gap-6 text-sm">
          <span>{t("sectionA.nombreNon")} : {nombreNon}</span>
          <span>{t("sectionA.questionsNonRepondues")} : {questionsNonRepondues}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h2 className="text-lg font-semibold">{t("sectionB.titre")}</h2>
        {(
          [
            ["montantMarcheEstime", "montantMarcheEstime"],
            ["coutTotalRealisation", "coutTotalRealisation"],
            ["prixDao", "prixDao"],
            ["cautionSoumission", "cautionSoumission"],
            ["fraisPreparation", "fraisPreparation"],
            ["avancePourcentage", "avancePourcentage"],
            ["delaiPaiementJours", "delaiPaiementJours"],
            ["argentDisponibleBanque", "argentDisponibleBanque"],
          ] as const
        ).map(([cle, labelCle]) => (
          <div key={cle} className="flex flex-col gap-2">
            <Label htmlFor={`go-no-go-${cle}`}>{t(`sectionB.${labelCle}`)}</Label>
            <Input
              id={`go-no-go-${cle}`}
              type="number"
              value={montants[cle]}
              onChange={(e) => setMontants((m) => ({ ...m, [cle]: e.target.value }))}
            />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>{t("sectionB.coutPourRepondre")}</span><span>{resultatsB.coutPourRepondre.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.beneficeEstime")}</span><span>{resultatsB.beneficeEstime.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.margeEstimee")}</span><span>{(resultatsB.margeEstimee * 100).toFixed(0)}%</span>
          <span>{t("sectionB.avanceRecue")}</span><span>{resultatsB.avanceRecue.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.argentAAvancer")}</span><span>{resultatsB.argentAAvancer.toLocaleString("fr-FR")}</span>
          <span>{t("sectionB.couverture")}</span><span>{(resultatsB.couverture * 100).toFixed(0)}%</span>
          <span>{t("sectionB.moisATenir")}</span><span>{resultatsB.moisATenir.toFixed(1)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-4 border rounded-lg p-4">
        <h2 className="text-lg font-semibold">{t("sectionC.titre")}</h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span>{t("sectionC.noteMarge")}</span><span>{noteMarge} / 4</span>
          <span>{t("sectionC.noteTresorerie")}</span><span>{noteTresorerie} / 4</span>
        </div>
        {(
          [
            ["noteInteretStrategique", 4],
            ["noteClientPaie", 3],
            ["noteConcurrence", 2],
            ["noteRisques", 3],
          ] as const
        ).map(([cle, max]) => (
          <div key={cle} className="flex flex-col gap-2">
            <Label htmlFor={`go-no-go-${cle}`}>{t(`sectionC.${cle}`)}</Label>
            <Select
              value={notesManuelles[cle]}
              onValueChange={(v) => setNotesManuelles((n) => ({ ...n, [cle]: v }))}
            >
              <SelectTrigger id={`go-no-go-${cle}`} className="w-32">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: max + 1 }, (_, i) => i).map((valeur) => (
                  <SelectItem key={valeur} value={String(valeur)}>
                    {valeur} / {max}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <p className="font-semibold">{t("sectionC.noteTotale")} : {noteTotale} / 20</p>
      </div>

      <div className="flex flex-col gap-3 border rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("decision.titre")}</h2>
          <Badge variant={VARIANT_DECISION[decision]}>
            {t(`decision.${achatDaoEffectue ? "postAchat" : "achatDao"}.${decision}`)}
          </Badge>
        </div>
        <Textarea
          value={commentaireGlobal}
          onChange={(e) => setCommentaireGlobal(e.target.value)}
          placeholder={t("sectionA.commentairePlaceholder")}
          rows={2}
        />
        <Button onClick={enregistrer} disabled={envoi} className="self-start">
          {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
          {envoi ? t("envoiEnCours") : t("boutonEnregistrer")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: plus d'erreur sur `go-no-go.tsx` (reste `appel-offres-detail.tsx`/`page.tsx`, Tâche 11).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/appels-offres/[id]/go-no-go.tsx"
git commit -m "feat(go-no-go): composant de la fiche structuree (remplace le composant 3-criteres)"
```

---

### Task 11: Intégration dans la fiche détail AO

**Files:**
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`

**Interfaces:**
- Consumes: composant `GoNoGo` (Tâche 10), queries Tâche 7, `suggererReponseAgrement, suggererReponseAttestations` (Tâche 6).

- [ ] **Step 1: `page.tsx` — remplacer le fetch de l'ancienne évaluation**

Remplacer dans les imports :
```ts
obtenirEvaluationGoNoGo,
```
par :
```ts
obtenirOuCreerGoNoGo,
listerTypesMarcheGoNoGo,
listerQuestionsGoNoGo,
listerReponsesGoNoGo,
```
(toujours depuis `"@/lib/appels-offres/queries"`).

Ajouter l'import :
```ts
import { obtenirParametresGoNoGo } from "@/lib/utilisateur/queries";
import { suggererReponseAgrement, suggererReponseAttestations } from "@/lib/appels-offres/go-no-go-suggestions";
```

Dans le `Promise.all`, remplacer `obtenirEvaluationGoNoGo(id)` par `obtenirOuCreerGoNoGo(id, resultat.appelOffres.montant_caution)`, et ajouter trois nouvelles entrées :

```ts
const [
  bibliotheque,
  emailsLies,
  suggestions,
  checklistManuelle,
  goNoGo,
  syntheseGoNoGo,
  jalons,
  bpu,
  tauxFraisStructureDefaut,
  groupement,
  nomEntreprise,
  cvTransformeParDocument,
  typesMarcheGoNoGo,
  questionsGoNoGo,
  parametresGoNoGo,
] = await Promise.all([
  listerDocuments(utilisateur.entreprise_id),
  listerEmailsLies(id),
  obtenirSuggestionsEmail(utilisateur.id, {
    titre: resultat.appelOffres.titre,
    acheteur: resultat.appelOffres.acheteur,
    date_limite: resultat.appelOffres.date_limite,
  }),
  listerChecklistManuelle(resultat.dossierReponse.id),
  obtenirOuCreerGoNoGo(id, resultat.appelOffres.montant_caution),
  obtenirSyntheseGoNoGo(id),
  listerJalonsRetroplanning(id),
  listerBpu(id),
  obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
  listerGroupement(id),
  obtenirNomEntreprise(utilisateur.entreprise_id),
  listerCvTransformes(id),
  listerTypesMarcheGoNoGo(utilisateur.entreprise_id),
  listerQuestionsGoNoGo(utilisateur.entreprise_id),
  obtenirParametresGoNoGo(utilisateur.entreprise_id),
]);

const reponsesGoNoGo = await listerReponsesGoNoGo(goNoGo.id);
```

Passer les nouvelles props à `<AppelOffresDetail>` (remplacer `evaluationGoNoGo={evaluationGoNoGo}` par) :

```tsx
goNoGo={goNoGo}
typesMarcheGoNoGo={typesMarcheGoNoGo}
questionsGoNoGo={questionsGoNoGo}
reponsesGoNoGo={reponsesGoNoGo}
parametresGoNoGo={parametresGoNoGo}
suggestionAgrement={suggererReponseAgrement(bibliotheque)}
suggestionAttestations={suggererReponseAttestations(bibliotheque)}
```

- [ ] **Step 2: `appel-offres-detail.tsx` — remplacer les props du composant**

Dans la signature de `AppelOffresDetail`, remplacer :
```ts
evaluationGoNoGo: EvaluationGoNoGo;
```
par :
```ts
goNoGo: GoNoGo;
typesMarcheGoNoGo: TypeMarcheGoNoGo[];
questionsGoNoGo: QuestionGoNoGo[];
reponsesGoNoGo: ReponseGoNoGo[];
parametresGoNoGo: { noteMinGo: number; margeMinVisee: number };
suggestionAgrement: SuggestionAdministrative;
suggestionAttestations: SuggestionAdministrative;
```
(et le même remplacement dans la déstructuration des props en haut de la fonction, et dans l'import de type en haut du fichier : retirer `EvaluationGoNoGo`, ajouter `GoNoGo, TypeMarcheGoNoGo, QuestionGoNoGo, ReponseGoNoGo` depuis `@/lib/appels-offres/types`, et `import type { SuggestionAdministrative } from "@/lib/appels-offres/go-no-go-suggestions";`).

- [ ] **Step 3: Retirer le rendu de l'ancien `GoNoGo` dans l'onglet `vue-ensemble`**

Supprimer cette ligne (actuellement juste après `<QuestionnaireGoNoGo .../>`) :
```tsx
<GoNoGo appelOffresId={appelOffres.id} evaluation={evaluationGoNoGo} />
```
Supprimer aussi `<QuestionnaireGoNoGo appelOffresId={appelOffres.id} syntheseInitiale={syntheseGoNoGo} />` de cet emplacement (déplacée au Step 4 dans le nouvel onglet).

- [ ] **Step 4: Ajouter le nouvel onglet "Go/No-Go", entre `vue-ensemble` et `offre-technique`**

Dans `<TabsList>` :
```tsx
<TabsTrigger value="vue-ensemble">{t("onglets.vueEnsemble")}</TabsTrigger>
<TabsTrigger value="go-no-go">{t("onglets.goNoGo")}</TabsTrigger>
<TabsTrigger value="offre-technique">{t("onglets.offreTechnique")}</TabsTrigger>
<TabsTrigger value="offre-financiere">{t("onglets.offreFinanciere")}</TabsTrigger>
```

Juste après la fermeture de `<TabsContent value="vue-ensemble" ...>` et avant `<TabsContent value="offre-technique" ...>` :

```tsx
<TabsContent
  value="go-no-go"
  className="flex flex-col gap-6 data-[state=inactive]:hidden"
  forceMount
>
  <QuestionnaireGoNoGo appelOffresId={appelOffres.id} syntheseInitiale={syntheseGoNoGo} />
  <GoNoGo
    appelOffresId={appelOffres.id}
    achatDaoEffectue={appelOffres.fichier_dao_path !== null}
    goNoGo={goNoGo}
    typesMarche={typesMarcheGoNoGo}
    questions={questionsGoNoGo}
    reponses={reponsesGoNoGo}
    parametres={parametresGoNoGo}
    suggestionAgrement={suggestionAgrement}
    suggestionAttestations={suggestionAttestations}
  />
</TabsContent>
```

- [ ] **Step 5: Vérifier la compilation puis le build**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

Run: `npm run lint`
Expected: 0 erreur (corriger les éventuels imports inutilisés signalés).

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" "app/(app)/appels-offres/[id]/page.tsx"
git commit -m "feat(go-no-go): nouvel onglet dedie dans la fiche detail AO"
```

---

### Task 12: Carte de paramétrage des seuils

**Files:**
- Create: `app/(app)/parametres/go-no-go-card.tsx`
- Modify: `app/(app)/parametres/page.tsx`

**Interfaces:**
- Consumes: `modifierParametresGoNoGo` (Tâche 8), `obtenirParametresGoNoGo` (Tâche 7).

- [ ] **Step 1: Écrire `go-no-go-card.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { modifierParametresGoNoGo } from "@/lib/appels-offres/actions";

export function GoNoGoCard({
  parametresInitiaux,
}: {
  parametresInitiaux: { noteMinGo: number; margeMinVisee: number };
}) {
  const t = useTranslations("Parametres.goNoGo");
  const [noteMinGo, setNoteMinGo] = useState(String(parametresInitiaux.noteMinGo));
  const [margeMinVisee, setMargeMinVisee] = useState(String(parametresInitiaux.margeMinVisee * 100));

  async function enregistrer() {
    const resultat = await modifierParametresGoNoGo({ noteMinGo, margeMinVisee });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="note-min-go">{t("champNoteMinGo")}</Label>
          <Input
            id="note-min-go"
            type="number"
            value={noteMinGo}
            onChange={(e) => setNoteMinGo(e.target.value)}
            onBlur={enregistrer}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="marge-min-visee">{t("champMargeMinVisee")}</Label>
          <Input
            id="marge-min-visee"
            type="number"
            value={margeMinVisee}
            onChange={(e) => setMargeMinVisee(e.target.value)}
            onBlur={enregistrer}
            className="w-24"
          />
        </div>
        <Button variant="outline" size="sm" asChild className="self-start">
          <Link href="/parametres/go-no-go">{t("lienParametrage")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Intégrer dans `page.tsx`**

Ajouter l'import :
```ts
import { obtenirParametresGoNoGo } from "@/lib/utilisateur/queries";
import { GoNoGoCard } from "./go-no-go-card";
```

Ajouter `obtenirParametresGoNoGo(utilisateur.entreprise_id)` dans le `Promise.all` (nouvelle variable `parametresGoNoGo`), puis, juste après `{estAdmin && <ProfilEntrepriseCard entreprise={entreprise} />}` :

```tsx
{estAdmin && <GoNoGoCard parametresInitiaux={parametresGoNoGo} />}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/parametres/go-no-go-card.tsx app/\(app\)/parametres/page.tsx
git commit -m "feat(go-no-go): carte de parametrage des seuils note/marge"
```

---

### Task 13: Page de paramétrage des types de marché et questions

**Files:**
- Create: `app/(app)/parametres/go-no-go/page.tsx` (server component)
- Create: `app/(app)/parametres/go-no-go/client.tsx` (client component)
- Create: `app/(app)/parametres/go-no-go/types-marche-table.tsx`
- Create: `app/(app)/parametres/go-no-go/questions-table.tsx`

**Interfaces:**
- Consumes: `listerTypesMarcheGoNoGo, listerQuestionsGoNoGo` (Tâche 7), `creerTypeMarcheGoNoGo, modifierTypeMarcheGoNoGo, desactiverTypeMarcheGoNoGo, creerQuestionGoNoGo, modifierQuestionGoNoGo, desactiverQuestionGoNoGo` (Tâche 8).

- [ ] **Step 1: Écrire `types-marche-table.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  creerTypeMarcheGoNoGo,
  modifierTypeMarcheGoNoGo,
  desactiverTypeMarcheGoNoGo,
} from "@/lib/appels-offres/actions";
import type { TypeMarcheGoNoGo } from "@/lib/appels-offres/types";

export function TypesMarcheTable({
  typesInitiaux,
  typeSelectionneId,
  onSelectionChange,
}: {
  typesInitiaux: TypeMarcheGoNoGo[];
  typeSelectionneId: string | null;
  onSelectionChange: (id: string) => void;
}) {
  const t = useTranslations("Parametres.goNoGoTypesMarche");
  const [types, setTypes] = useState(typesInitiaux);
  const [nomsEdition, setNomsEdition] = useState<Record<string, string>>({});
  const [nouveauNom, setNouveauNom] = useState("");

  async function ajouter() {
    if (nouveauNom.trim().length === 0) return;
    const resultat = await creerTypeMarcheGoNoGo({ nom: nouveauNom });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTypes((liste) => [
      ...liste,
      { id: resultat.id, entreprise_id: "", nom: nouveauNom, actif: true, ordre: liste.length, created_at: new Date().toISOString() },
    ]);
    setNouveauNom("");
    toast.success(t("toastEnregistre"));
  }

  async function renommer(id: string) {
    const nom = nomsEdition[id];
    if (!nom || nom.trim().length === 0) return;
    const resultat = await modifierTypeMarcheGoNoGo(id, { nom });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTypes((liste) => liste.map((type) => (type.id === id ? { ...type, nom } : type)));
    toast.success(t("toastEnregistre"));
  }

  async function desactiver(id: string) {
    const resultat = await desactiverTypeMarcheGoNoGo(id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setTypes((liste) => liste.filter((type) => type.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {types.map((type) => (
        <div key={type.id} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectionChange(type.id)}
            className={`flex-1 text-left px-2 py-1 rounded ${typeSelectionneId === type.id ? "bg-muted font-medium" : ""}`}
          >
            {type.nom}
          </button>
          <Input
            className="w-48"
            placeholder={t("champNom")}
            value={nomsEdition[type.id] ?? ""}
            onChange={(e) => setNomsEdition((m) => ({ ...m, [type.id]: e.target.value }))}
          />
          <Button variant="outline" size="sm" onClick={() => renommer(type.id)}>
            {t("boutonEnregistrer")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => desactiver(type.id)}>
            {t("boutonDesactiver")}
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input
          className="w-48"
          placeholder={t("champNom")}
          value={nouveauNom}
          onChange={(e) => setNouveauNom(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={ajouter}>
          {t("boutonAjouterType")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Écrire `questions-table.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  creerQuestionGoNoGo,
  modifierQuestionGoNoGo,
  desactiverQuestionGoNoGo,
} from "@/lib/appels-offres/actions";
import type { CategorieQuestionGoNoGo, QuestionGoNoGo } from "@/lib/appels-offres/types";

export function QuestionsTable({
  questionsInitiales,
  categorie,
  typeMarcheId,
}: {
  questionsInitiales: QuestionGoNoGo[];
  categorie: CategorieQuestionGoNoGo;
  typeMarcheId: string | null;
}) {
  const t = useTranslations("Parametres.goNoGoTypesMarche");
  const [questions, setQuestions] = useState(questionsInitiales);
  const [textesEdition, setTextesEdition] = useState<Record<string, string>>({});
  const [nouveauTexte, setNouveauTexte] = useState("");

  async function ajouter() {
    if (nouveauTexte.trim().length === 0) return;
    const resultat = await creerQuestionGoNoGo({ categorie, typeMarcheId, texte: nouveauTexte });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setQuestions((liste) => [
      ...liste,
      {
        id: resultat.id,
        entreprise_id: "",
        type_marche_id: typeMarcheId,
        categorie,
        texte: nouveauTexte,
        ordre: liste.length,
        actif: true,
        created_at: new Date().toISOString(),
      },
    ]);
    setNouveauTexte("");
    toast.success(t("toastEnregistre"));
  }

  async function modifier(id: string) {
    const texte = textesEdition[id];
    if (!texte || texte.trim().length === 0) return;
    const resultat = await modifierQuestionGoNoGo(id, { texte });
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setQuestions((liste) => liste.map((q) => (q.id === id ? { ...q, texte } : q)));
    toast.success(t("toastEnregistre"));
  }

  async function desactiver(id: string) {
    const resultat = await desactiverQuestionGoNoGo(id);
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setQuestions((liste) => liste.filter((q) => q.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      {questions
        .filter((q) => q.categorie === categorie && q.type_marche_id === typeMarcheId)
        .map((question) => (
          <div key={question.id} className="flex items-center gap-2">
            <Input
              className="flex-1"
              defaultValue={question.texte}
              placeholder={t("champTexteQuestion")}
              onChange={(e) => setTextesEdition((m) => ({ ...m, [question.id]: e.target.value }))}
            />
            <Button variant="outline" size="sm" onClick={() => modifier(question.id)}>
              {t("boutonEnregistrer")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => desactiver(question.id)}>
              {t("boutonDesactiver")}
            </Button>
          </div>
        ))}
      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder={t("champTexteQuestion")}
          value={nouveauTexte}
          onChange={(e) => setNouveauTexte(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={ajouter}>
          {t("boutonAjouterQuestion")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Écrire `client.tsx` (composant client : state de sélection + tables)**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TypesMarcheTable } from "./types-marche-table";
import { QuestionsTable } from "./questions-table";
import type { TypeMarcheGoNoGo, QuestionGoNoGo } from "@/lib/appels-offres/types";

// Page client : la sélection du type de marché affiché pilote l'affichage
// des questions savoir-faire associées sans aller-retour serveur, cohérent
// avec un écran de paramétrage à faible fréquence de rechargement complet.
export function ParametresGoNoGoClient({
  typesInitiaux,
  questionsInitiales,
}: {
  typesInitiaux: TypeMarcheGoNoGo[];
  questionsInitiales: QuestionGoNoGo[];
}) {
  const t = useTranslations("Parametres.goNoGoTypesMarche");
  const [typeSelectionneId, setTypeSelectionneId] = useState<string | null>(
    typesInitiaux[0]?.id ?? null,
  );

  const typeSelectionne = typesInitiaux.find((type) => type.id === typeSelectionneId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <TypesMarcheTable
        typesInitiaux={typesInitiaux}
        typeSelectionneId={typeSelectionneId}
        onSelectionChange={setTypeSelectionneId}
      />

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">{t("questionsGenerales")}</h2>
        <QuestionsTable questionsInitiales={questionsInitiales} categorie="administratif" typeMarcheId={null} />
        <QuestionsTable questionsInitiales={questionsInitiales} categorie="ouverture_marche" typeMarcheId={null} />
      </div>

      {typeSelectionne && (
        <div className="flex flex-col gap-2">
          <h2 className="font-semibold">{t("questionsSavoirFaire", { typeMarche: typeSelectionne.nom })}</h2>
          <QuestionsTable
            questionsInitiales={questionsInitiales}
            categorie="savoir_faire"
            typeMarcheId={typeSelectionne.id}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Écrire `page.tsx` (server component : auth, garde admin, data fetching)**

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerTypesMarcheGoNoGo, listerQuestionsGoNoGo } from "@/lib/appels-offres/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { ParametresGoNoGoClient } from "./client";

export default async function ParametresGoNoGoPage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");
  if (utilisateur.role !== "admin") redirect("/parametres");

  const [typesMarche, questions] = await Promise.all([
    listerTypesMarcheGoNoGo(utilisateur.entreprise_id),
    listerQuestionsGoNoGo(utilisateur.entreprise_id),
  ]);

  const t = await getTranslations("Parametres.goNoGoTypesMarche");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane
        items={[{ label: "Paramètres", href: "/parametres" }, { label: t("filAriane") }]}
      />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ParametresGoNoGoClient typesInitiaux={typesMarche} questionsInitiales={questions} />
    </div>
  );
}
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

Run: `npm run lint`
Expected: 0 erreur.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/parametres/go-no-go/
git commit -m "feat(go-no-go): page de parametrage des types de marche et questions"
```

---

### Task 14: Vérification finale et nettoyage

**Files:**
- Modify (vérification uniquement, pas de nouveau contenu attendu) : tout le dépôt.

**Interfaces:** aucune — tâche de clôture.

- [ ] **Step 1: Chercher les références résiduelles à l'ancienne évaluation**

Run: `grep -rn "EvaluationGoNoGo\|CritereGoNoGo\|CRITERES_GO_NO_GO\|calculerVerdictGoNoGo\|mettreAJourEvaluationGoNoGo\|obtenirEvaluationGoNoGo" --include="*.ts" --include="*.tsx" .`
Expected: aucune occurrence (en dehors, le cas échéant, de `supabase/migrations/20260915140000_evaluation_go_no_go.sql`, qui reste tel quel — cf. Global Constraints).

Si des occurrences subsistent, les retirer (imports morts, props non utilisées).

- [ ] **Step 2: Lancer toute la suite de tests**

Run: `npm run test`
Expected: PASS, aucun test en échec, aucun test de l'ancienne évaluation restant.

- [ ] **Step 3: Lint complet**

Run: `npm run lint`
Expected: 0 erreur, 0 warning nouveau.

- [ ] **Step 4: Typecheck complet**

Run: `npx tsc --noEmit`
Expected: 0 erreur.

- [ ] **Step 5: Vérification manuelle navigateur (parcours complet, dev server lancé manuellement — ne pas lancer `next dev` depuis un worktree qui sera ensuite mergé, cf. mémoire "vieux serveur dev dans worktree abandonné")**

- Ouvrir un AO existant sans DAO (ou en importer un depuis `/veille`) → onglet "Go/No-Go" → vérifier que le libellé de décision est bien "ACHETER LE DAO" / "NE PAS ACHETER" / "À COMPLÉTER".
- Choisir un type de marché → vérifier que les 4 questions savoir-faire correspondantes s'affichent, et seulement celles-là.
- Répondre NON à une question administrative → vérifier que la décision bascule immédiatement en NO GO même avec une note/20 élevée.
- Remplir la section B avec les valeurs de l'exemple xls (montant 45 000 000, coût 36 000 000, prix DAO 100 000, caution 900 000, frais 150 000, avance 15 %, délai 120 jours, trésorerie 12 000 000) → vérifier marge 20 %, couverture ≈ 40 %, note marge 3/4, note trésorerie 1/4.
- Uploader un DAO sur cet AO → vérifier que la caution se pré-remplit depuis `appel_offres.montant_caution` et que le libellé de décision bascule vers "GO — on répond" / "NO GO — on ne répond pas".
- Aller dans `/parametres` (compte admin) → carte "Go/No-Go" → modifier la note minimale → vérifier que la décision de la fiche change en conséquence après rechargement.
- Aller dans `/parametres/go-no-go` → ajouter un type de marché, ajouter une question savoir-faire dessus → revenir sur la fiche d'un AO → vérifier qu'elle apparaît dans le sélecteur et dans la liste des questions.
- Se connecter avec un compte non-admin → vérifier que `/parametres/go-no-go` redirige vers `/parametres`.

- [ ] **Step 6: Commit final si des ajustements ont été faits aux steps précédents**

```bash
git add -A
git commit -m "fix(go-no-go): nettoyage final et corrections post-verification"
```

(Ne committer que s'il y a effectivement eu des changements à ce stade — sinon cette tâche se termine sans commit.)

---

## Self-Review

- **Couverture de la spec** : modèle de données (Tâches 1-2, avec la simplification actée en tête de plan), calculs/décision (Tâche 5), auto-suggestion (Tâche 6), queries/actions (Tâches 7-8), UI fiche + réorg onglets (Tâches 10-11), écran de paramétrage (Tâches 12-13), i18n (Tâche 9), nettoyage/suppression ancien code (Tâches 1 Step note, 14). Hors scope confirmé (export/logo, dashboard, migration de données) non traité — conforme à la spec.
- **Placeholders** : aucun "TBD"/"à compléter plus tard" — chaque étape contient le code réel. Les textes des questions savoir-faire Ingénierie/Environnement/Énergie/Agro-industrie (Tâche 2) sont rédigés en toutes lettres, pas laissés en suspens.
- **Cohérence des types** : `GoNoGo`, `TypeMarcheGoNoGo`, `QuestionGoNoGo`, `ReponseGoNoGo`, `ReponseGoNoGoValeur`, `CategorieQuestionGoNoGo` utilisés avec les mêmes noms de la Tâche 3 jusqu'à la Tâche 13. Fonctions de calcul (`calculerSectionB`, `noteMargeAuto`, `noteTresorerieAuto`, `calculerNoteTotale`, `calculerDecision`) : mêmes signatures entre Tâche 5 (définition/tests) et Tâche 10 (composant).
