# Veille nationale par extraction du BOMP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un admin (`super_admin`) upload le BOMP hebdomadaire (PDF), le système en extrait les avis d'appels d'offres nouveaux dans un catalogue national partagé, et chaque client peut importer un avis dans son propre pipeline en un clic.

**Architecture:** Nouvelle infrastructure QStash en deux temps (découpage puis structuration par avis), réutilisant l'extraction PDF (`pdfjs-dist`) et le patron server action déjà en place pour le traitement DAO (Module 3). Nouvelles tables sans `entreprise_id` (catalogue partagé), RLS lecture-tous/écriture-`super_admin`.

**Tech Stack:** Next.js Server Actions, Supabase (Postgres + RLS + Storage), `@upstash/qstash`, `@anthropic-ai/sdk` (modèle `claude-haiku-4-5-20251001`), `pdfjs-dist`, Zod, Vitest.

## Global Constraints

- Toutes les Server Actions retournent `{ erreur: string } | { succes: true, ... }`, jamais de throw vers le client (patron `lib/appels-offres/actions.ts`).
- Toute requête `.update()`/`.delete()` sur une ligne appartenant potentiellement à une autre entité ajoute `.select("id")` et vérifie `data.length > 0` (défense en profondeur, patron déjà en place).
- Policy RLS `for insert`/`for update`/`for all` déclare TOUJOURS `with check` explicitement — jamais juste `using` (mémoire projet `noubinao_rls_with_check_gotcha` : sans `with check`, la policy réutilise silencieusement `using`, ce qui n'est pas équivalent).
- `secteur` reste `text` libre, jamais un ENUM Postgres (cohérent avec `appel_offres.secteur`).
- Toute route API QStash suit le patron `app/api/dao/traiter/route.ts` : `Receiver` signé, `export const maxDuration = 60`, `createServiceRoleClient()`, erreurs renvoyées en `Response(..., {status: 500})` jamais en throw non catturé.
- Aucun texte utilisateur-facing en dur dans les composants client-facing (`/veille`) — tout passe par `next-intl` (`messages/fr.json` + `messages/en.json`), patron déjà utilisé dans tout le projet. **Exception assumée** : `/admin/veille` reste en français uniquement (outil interne, un seul utilisateur aujourd'hui) — pas de clés `next-intl` pour cet écran.
- Ne PAS exécuter `supabase db push` contre le projet Supabase réel sans confirmation explicite de l'utilisateur — écrire la migration, s'arrêter avant de l'appliquer (mémoire projet `feedback_subagent_infra_actions`).
- Tests : Vitest (`npm run test`), TDD sur toute la logique pure (chunking, mapping import). Pas de test sur les composants UI (cohérent avec le reste du projet).
- Après chaque tâche : `npx tsc --noEmit` doit passer sans erreur avant de committer.

---

## Décisions de conception prises pendant ce plan (au-delà du spec)

Le spec (`docs/superpowers/specs/2026-09-22-veille-bomp-design.md`) laissait deux points à trancher en plan d'implémentation — décidés ici avec justification :

1. **Granularité du fan-out QStash : un job par avis** (pas de lot de 3-5). Le sommaire du BOMP inspecté donne ~40 avis nouveaux par semaine (29 travaux + 6 fournitures + 0 prestations + 5 manifestations) — un volume qui rend le lotissement inutile ; chaque job est un seul appel Claude sur un texte court (quelques centaines de mots), largement sous la limite de 60s Vercel.
2. **`avis_ao_national.type` devient nullable**, renseigné par l'IA à l'étape de structuration plutôt que déduit pendant le découpage. Le sommaire du BOMP donne des compteurs par catégorie mais pas de bornes de page fiables inspectées dans le fichier réel — plutôt que de deviner une heuristique de page non vérifiée, le découpage (étape 1) ne renseigne que `reference` et `texte_brut` ; l'IA (étape 2) déduit `type` du contenu de l'avis lui-même, dans le même appel que `secteur`.
3. **`appel_offres.fichier_dao_path` et `fichier_dao_nom_original` deviennent nullable.** Découvert en auto-relecture de ce plan (pas dans le spec initial) : ces deux colonnes sont `not null` dans le schéma existant (`20260831140310_appel_offres.sql`) — logique tant que tout `appel_offres` naissait forcément d'un upload de DAO, mais un AO importé depuis le catalogue national n'a par définition aucun fichier DAO à ce stade (décision spec : « aucun fichier DAO joint »). Rendre les colonnes nullables est le fix correct (pas de valeur sentinelle bricolée) ; l'impact sur le code existant est limité et traité en Tâche 13 plutôt que laissé de côté — 11 fichiers référencent ces colonnes, mais seuls deux usages posent un vrai risque (bouton de téléchargement toujours affiché, signature de `supprimerAppelOffres` qui type le chemin en `string` non-nullable), les autres ne font que de l'affichage de fallback déjà tolérant à `null`.
4. **Correspondance référence↔bloc ARTICLE 1 par position (zip), pas par proximité textuelle.** Inspection réelle du PDF (`BOMP_1896...pdf`, pages 48-49) : les légendes "N° <réf>\n<TITRE>" de deux avis consécutifs apparaissent groupées ensemble APRÈS le contenu ARTICLE 1-13 des deux avis (artefact de mise en page, colonne latérale extraite après la colonne principale) — pas juste après le bloc ARTICLE 13 de l'avis correspondant. Voir Tâche 3 pour l'algorithme retenu (extraction séparée des légendes et des blocs ARTICLE 1, réassociation par position ordinale, légendes `(suite)` filtrées car elles désignent un avis déjà capturé par un bloc précédent, pas un nouveau).

---

### Task 1: Migration — schéma, RLS, RPC, bucket

**Files:**
- Create: `supabase/migrations/20260923090000_veille_bomp.sql`

**Interfaces:**
- Produces (tables/colonnes utilisées par toutes les tâches suivantes) :
  - `utilisateur.super_admin boolean`
  - `bomp_numero(id, numero, date_publication, fichier_path, statut, nombre_avis_extraits, erreur_message, cree_par, cree_le)`
  - `avis_ao_national(id, bomp_numero_id, reference, type, autorite_contractante, objet, secteur, montant_caution, date_limite_remise_offres, contact_retrait, nombre_lots, texte_brut, cree_le)`
  - `avis_ao_national_importation(id, avis_id, entreprise_id, appel_offres_id, importe_par, importe_le)`
  - RPC `importer_avis_national(p_avis_id uuid, p_entreprise_id uuid, p_utilisateur_id uuid) returns uuid` (id de l'`appel_offres` créé)
  - Bucket storage `bomp-national`

- [ ] **Step 1: Écrire la migration**

```sql
-- Rôle admin plateforme (un seul compte aujourd'hui, extensible plus tard)
alter table utilisateur add column super_admin boolean not null default false;

-- Un appel_offres importé depuis le catalogue national n'a par définition
-- aucun fichier DAO à ce stade (le BOMP ne contient que l'avis, pas le
-- dossier complet — voir spec) — ces deux colonnes n'étaient jamais
-- nullables tant que tout appel_offres naissait d'un upload de DAO. Impact
-- sur le code existant traité en Tâche 13, pas laissé en incohérence.
alter table appel_offres alter column fichier_dao_path drop not null;
alter table appel_offres alter column fichier_dao_nom_original drop not null;

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
  cree_le timestamptz not null default now()
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
  cree_le timestamptz not null default now()
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

  insert into appel_offres (entreprise_id, titre, acheteur, secteur, date_limite, montant_caution, created_by)
  values (
    p_entreprise_id,
    v_avis.objet,
    v_avis.autorite_contractante,
    v_avis.secteur,
    v_avis.date_limite_remise_offres,
    v_avis.montant_caution,
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
```

- [ ] **Step 2: Vérifier que le fichier de migration est syntaxiquement valide**

Run: `cd supabase && npx supabase db lint --db-url "$DATABASE_URL"` si un environnement de vérification local est configuré ; sinon relire manuellement le SQL (pas d'exécution contre la base réelle à ce stade — voir Global Constraints).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260923090000_veille_bomp.sql
git commit -m "feat(veille): migration schéma catalogue national BOMP"
```

---

### Task 2: Types et schéma Zod

**Files:**
- Create: `lib/veille/types.ts`
- Create: `lib/veille/schema.ts`

**Interfaces:**
- Consumes: rien (types de base)
- Produces: `AvisAoNational`, `BompNumero`, `TypeAvisAoNational`, `StatutTraitementBomp` (types TS) ; `AvisStructureSchema` (Zod, utilisé par Task 4) ; `uploaderBompSchema` (Zod, utilisé par Task 9)

- [ ] **Step 1: Écrire `lib/veille/types.ts`**

```ts
export const TYPES_AVIS_AO_NATIONAL = [
  "travaux",
  "fournitures",
  "prestations",
  "manifestation_interet",
] as const;
export type TypeAvisAoNational = (typeof TYPES_AVIS_AO_NATIONAL)[number];

export type StatutTraitementBomp =
  | "en_attente"
  | "extraction_en_cours"
  | "termine"
  | "erreur";

export interface BompNumero {
  id: string;
  numero: string;
  date_publication: string;
  fichier_path: string;
  statut: StatutTraitementBomp;
  nombre_avis_extraits: number;
  erreur_message: string | null;
  cree_par: string;
  cree_le: string;
}

export interface AvisAoNational {
  id: string;
  bomp_numero_id: string;
  reference: string;
  type: TypeAvisAoNational | null;
  autorite_contractante: string | null;
  objet: string | null;
  secteur: string | null;
  montant_caution: number | null;
  date_limite_remise_offres: string | null;
  contact_retrait: string | null;
  nombre_lots: number | null;
  texte_brut: string;
  cree_le: string;
}
```

- [ ] **Step 2: Écrire `lib/veille/schema.ts`**

```ts
import { z } from "zod";
import { TYPES_AVIS_AO_NATIONAL } from "./types";

export const AvisStructureSchema = z.object({
  type: z.enum(TYPES_AVIS_AO_NATIONAL).nullable(),
  autorite_contractante: z.string().nullable(),
  objet: z.string().nullable(),
  secteur: z.string().nullable(),
  montant_caution: z.number().nullable(),
  date_limite_remise_offres: z.string().nullable(),
  contact_retrait: z.string().nullable(),
  nombre_lots: z.number().nullable(),
});
export type AvisStructure = z.infer<typeof AvisStructureSchema>;

export const uploaderBompSchema = z.object({
  numero: z.string().trim().min(1, "Le numéro est requis"),
  datePublication: z.string().trim().min(1, "La date est requise"),
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0, "Le fichier est requis")
    .refine((f) => f.type === "application/pdf", "Le fichier doit être un PDF"),
});
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/veille/types.ts lib/veille/schema.ts
git commit -m "feat(veille): types et schémas Zod"
```

---

### Task 3: Chunking — découpage du texte brut en avis individuels

**Files:**
- Create: `lib/veille/chunking.ts`
- Test: `lib/veille/chunking.test.ts`

**Interfaces:**
- Consumes: rien (fonction pure sur une chaîne de texte)
- Produces: `decouperEnAvis(texteComplet: string): { reference: string; texteBrut: string }[]` — utilisée par Task 6.

Fixture de test basée sur un extrait réel du BOMP inspecté
(`BOMP_1896__du_mardi_22_septembre_2026.pdf`, pages 48-49) — texte
condensé (les paragraphes ARTICLE 9 à 13, identiques mot pour mot d'un
avis à l'autre dans le document réel, sont raccourcis dans la fixture,
mais la structure — bloc ARTICLE 1 par avis, légendes de référence
groupées après deux avis consécutifs, marqueur `(suite)` — est fidèle à
ce qui a été observé dans le fichier réel.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it } from "vitest";
import { decouperEnAvis } from "./chunking";

// Fixture condensée depuis un extrait réel du BOMP n°1896 (pages 48-49) :
// deux légendes de référence groupées après le contenu ARTICLE 1-13 de DEUX
// avis consécutifs (artefact de mise en page réel, pas une simplification
// de test), avec un marqueur (suite) sur la première légende désignant un
// avis déjà entamé sur la page précédente (donc à ignorer, pas un 3e avis).
const EXTRAIT_REEL = `
ARTICLE 1 : AUTORITE CONTRACTANTE
Le présent appel d'offres est lancé par la Mairie de Ouragahio.
ARTICLE 2 : OBJET
Le présent appel d'offres a pour objet les travaux d'extension du réseau
électrique de Kpapekou.
ARTICLE 8 : REMISE DES OFFRES
Les offres seront déposées au plus tard le 23 octobre 2026 à 09 heures.
ARTICLE 13 : LEGISLATION REGISSANT LE MARCHE
Le présent appel d'offres est soumis aux lois en vigueur.
N° T 1363/2026 (suite)
TRAVAUX DE CONSTRUCTION D'UN PREAU DE REUNIONS
N° T 1364/2026
TRAVAUX D'EXTENSION DU RESEAU ELECTRIQUE DE KPAPEKOU
ARTICLE 1 : AUTORITE CONTRACTANTE
Le présent appel d'offres est lancé par la Mairie de Sandégué.
ARTICLE 2 : OBJET
Le présent appel d'offres a pour objet les travaux de construction d'un
bâtiment de 03 salles de classes au Groupe Scolaire Sandégué.
ARTICLE 13 : LEGISLATION REGISSANT LE MARCHE
Le présent appel d'offres est soumis aux lois en vigueur.
N° T 1365/2026
TRAVAUX DE CONSTRUCTION D'UN BATIMENT DE 03 SALLES DE CLASSES
`;

describe("decouperEnAvis", () => {
  it("découpe le texte en un bloc par occurrence de ARTICLE 1", () => {
    const avis = decouperEnAvis(EXTRAIT_REEL);
    expect(avis).toHaveLength(2);
  });

  it("associe la bonne référence à chaque bloc (par position, légendes (suite) ignorées)", () => {
    const avis = decouperEnAvis(EXTRAIT_REEL);
    expect(avis[0].reference).toBe("T 1364/2026");
    expect(avis[1].reference).toBe("T 1365/2026");
  });

  it("le texte brut de chaque bloc contient son propre contenu ARTICLE, pas celui du bloc voisin", () => {
    const avis = decouperEnAvis(EXTRAIT_REEL);
    expect(avis[0].texteBrut).toContain("Ouragahio");
    expect(avis[0].texteBrut).not.toContain("Sandégué");
    expect(avis[1].texteBrut).toContain("Sandégué");
    expect(avis[1].texteBrut).not.toContain("Ouragahio");
  });

  it("génère une référence de repli si le nombre de légendes ne correspond pas au nombre de blocs", () => {
    const texteSansLegende = `
ARTICLE 1 : AUTORITE CONTRACTANTE
Le présent appel d'offres est lancé par la Mairie de Diabo.
ARTICLE 13 : LEGISLATION REGISSANT LE MARCHE
Fin.
`;
    const avis = decouperEnAvis(texteSansLegende);
    expect(avis).toHaveLength(1);
    expect(avis[0].reference).toBe("SANS-REF-1");
  });

  it("retourne un tableau vide si aucun motif ARTICLE 1 n'est trouvé", () => {
    expect(decouperEnAvis("Texte sans structure reconnue.")).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run lib/veille/chunking.test.ts`
Expected: FAIL — `Cannot find module './chunking'`

- [ ] **Step 3: Implémenter `lib/veille/chunking.ts`**

```ts
// Un avis nouveau du BOMP suit toujours un bloc ARTICLE 1 à ARTICLE 13,
// mais la légende "N° <référence>\n<TITRE>" de chaque avis n'apparaît PAS
// juste après son propre bloc ARTICLE 13 — inspection réelle du BOMP
// n°1896 (pages 48-49) : les légendes de deux avis consécutifs sont
// groupées ensemble après le contenu ARTICLE des DEUX avis (artefact de
// mise en page : la légende est une colonne latérale extraite après la
// colonne de corps de texte par pdfjs-dist, pas une erreur de ce parseur
// en particulier). Plutôt que de deviner un lien de proximité fragile,
// les légendes et les blocs ARTICLE 1 sont extraits séparément puis
// réassociés par position ordinale — les deux séquences apparaissent dans
// le même ordre relatif dans le document même si elles sont physiquement
// entrelacées différemment.
const MOTIF_ARTICLE_1 = /ARTICLE\s+1\s*:\s*AUTORIT[EÉ]\s+CONTRACTANTE/gi;
// Une légende "(suite)" désigne un avis déjà entamé sur une page
// précédente (donc déjà capturé par un bloc ARTICLE 1 antérieur) — elle
// ne doit jamais être comptée comme la référence d'un nouveau bloc.
const MOTIF_LEGENDE = /N°\s*([A-Z]+(?:\s[A-Z]+)?\s*\d+\/\d{4})(\s*\(suite\))?\s*\n/g;

export function decouperEnAvis(
  texteComplet: string,
): { reference: string; texteBrut: string }[] {
  const indices = [...texteComplet.matchAll(MOTIF_ARTICLE_1)].map((m) => m.index ?? 0);
  if (indices.length === 0) return [];

  const blocs = indices.map((debut, i) => {
    const fin = i + 1 < indices.length ? indices[i + 1] : texteComplet.length;
    return texteComplet.slice(debut, fin).trim();
  });

  const references = [...texteComplet.matchAll(MOTIF_LEGENDE)]
    .filter((m) => !m[2]) // exclut les légendes "(suite)"
    .map((m) => m[1].trim());

  return blocs.map((texteBrut, i) => ({
    reference: references[i] ?? `SANS-REF-${i + 1}`,
    texteBrut,
  }));
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npx vitest run lib/veille/chunking.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/veille/chunking.ts lib/veille/chunking.test.ts
git commit -m "feat(veille): découpage du BOMP en avis individuels (TDD)"
```

---

### Task 4: Structuration IA d'un avis

**Files:**
- Create: `lib/veille/structurer.ts`
- Test: `lib/veille/structurer.test.ts`

**Interfaces:**
- Consumes: `AvisStructureSchema` (Task 2)
- Produces: `structurerAvis(texteBrut: string): Promise<AvisStructure>` — utilisée par Task 7.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    get messages() {
      return { create: creerMock };
    }
  },
}));

import { structurerAvis } from "./structurer";

describe("structurerAvis", () => {
  it("construit un prompt demandant le type, le secteur et les champs structurés", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            type: null,
            autorite_contractante: null,
            objet: null,
            secteur: null,
            montant_caution: null,
            date_limite_remise_offres: null,
            contact_retrait: null,
            nombre_lots: null,
          }),
        },
      ],
    });

    await structurerAvis("ARTICLE 1 : AUTORITE CONTRACTANTE\nLe présent appel...");

    const promptEnvoye = creerMock.mock.calls[0][0].messages[0].content as string;
    expect(promptEnvoye).toContain("type");
    expect(promptEnvoye).toContain("secteur");
    expect(promptEnvoye).toContain("date_limite_remise_offres");
  });

  it("parse une réponse JSON valide en objet AvisStructure", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            type: "travaux",
            autorite_contractante: "Mairie de Ouragahio",
            objet: "Extension du réseau électrique",
            secteur: "BTP",
            montant_caution: 2300000,
            date_limite_remise_offres: "2026-10-23",
            contact_retrait: "Mairie de Ouragahio, Cel. 07 99 22 87 98",
            nombre_lots: 2,
          }),
        },
      ],
    });

    const resultat = await structurerAvis("ARTICLE 1 : AUTORITE CONTRACTANTE\n...");

    expect(resultat.type).toBe("travaux");
    expect(resultat.autorite_contractante).toBe("Mairie de Ouragahio");
    expect(resultat.montant_caution).toBe(2300000);
  });

  it("lève une erreur explicite si la réponse ne contient aucun JSON exploitable", async () => {
    creerMock.mockResolvedValue({
      content: [{ type: "text", text: "Désolé, je ne peux pas extraire ces informations." }],
    });

    await expect(structurerAvis("texte")).rejects.toThrow("Réponse Claude sans JSON exploitable");
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run lib/veille/structurer.test.ts`
Expected: FAIL — `Cannot find module './structurer'`

- [ ] **Step 3: Implémenter `lib/veille/structurer.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { AvisStructureSchema, type AvisStructure } from "./schema";

const anthropic = new Anthropic({ maxRetries: 4 });

export async function structurerAvis(texteBrut: string): Promise<AvisStructure> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Voici un avis d'appel d'offres extrait du Bulletin Officiel des Marchés Publics de Côte d'Ivoire :

${texteBrut}

Extrait les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact suivant :

{
  "type": "travaux" ou "fournitures" ou "prestations" ou "manifestation_interet" ou null,
  "autorite_contractante": "string ou null (nom de l'autorité contractante, ARTICLE 1)",
  "objet": "string ou null (objet de l'appel d'offres, ARTICLE 2)",
  "secteur": "string ou null (secteur d'activité concerné, déduis-le depuis l'objet — ex. BTP, ingénierie, environnement, énergie-climat, ou tout autre secteur pertinent)",
  "montant_caution": nombre ou null (montant de la garantie de soumission, en chiffres, sans devise),
  "date_limite_remise_offres": "string ou null (date limite de remise des offres, ARTICLE 8, au format ISO 8601 YYYY-MM-DD)",
  "contact_retrait": "string ou null (adresse/contact pour retirer le dossier, ARTICLE 7)",
  "nombre_lots": nombre ou null (nombre de lots de ce marché, ARTICLE 3)
}

Indications :
- Les montants utilisent le point comme séparateur de milliers, pas comme séparateur décimal (ex. "2 300 000" = 2300000).
- Le type se déduit du contenu de l'objet (ex. "TRAVAUX DE..." → travaux, "FOURNITURE ET POSE DE..." → fournitures, "PRESTATIONS DE..." → prestations, "MANIFESTATION D'INTERET" dans le texte → manifestation_interet).

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise null.`,
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");

  if (debut === -1 || fin === -1 || fin < debut) {
    throw new Error("Réponse Claude sans JSON exploitable.");
  }

  const jsonBrut = texteJson.slice(debut, fin + 1);
  return AvisStructureSchema.parse(JSON.parse(jsonBrut));
}
```

- [ ] **Step 4: Lancer le test, vérifier qu'il passe**

Run: `npx vitest run lib/veille/structurer.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/veille/structurer.ts lib/veille/structurer.test.ts
git commit -m "feat(veille): structuration IA d'un avis (TDD)"
```

---

### Task 5: File d'attente QStash

**Files:**
- Create: `lib/veille/file-attente.ts`

**Interfaces:**
- Consumes: rien
- Produces: `construireUrlCallbackDecoupage()`, `construireUrlCallbackStructuration()`, `mettreEnFileDecoupageBomp(bompNumeroId: string)`, `mettreEnFileStructurationAvis(avisId: string)` — utilisées par Tasks 6, 7, 9.

- [ ] **Step 1: Implémenter `lib/veille/file-attente.ts`**

```ts
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

// Même piège que lib/appels-offres/file-attente.ts : APP_URL est le
// domaine stable à utiliser pour tout callback externe QStash, jamais
// VERCEL_URL (protégé par "Vercel Authentication" par déploiement).
function base(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function construireUrlCallbackDecoupage(): string {
  return `${base()}/api/veille/decouper`;
}

export function construireUrlCallbackStructuration(): string {
  return `${base()}/api/veille/structurer`;
}

export async function mettreEnFileDecoupageBomp(bompNumeroId: string): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallbackDecoupage(),
    body: { bompNumeroId },
  });
}

export async function mettreEnFileStructurationAvis(avisId: string): Promise<void> {
  await qstash.publishJSON({
    url: construireUrlCallbackStructuration(),
    body: { avisId },
  });
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/veille/file-attente.ts
git commit -m "feat(veille): file d'attente QStash (découpage + structuration)"
```

---

### Task 6: Endpoint QStash — découpage

**Files:**
- Create: `lib/veille/decoupage.ts`
- Create: `app/api/veille/decouper/route.ts`

**Interfaces:**
- Consumes: `decouperEnAvis` (Task 3), `mettreEnFileStructurationAvis` (Task 5), `extrairePagesPdf` (`lib/appels-offres/normalisation/pdf.ts`, existant)
- Produces: `traiterDecoupageBomp(supabase, bompNumeroId: string): Promise<void>` — appelée par la route, pas testée unitairement (dépend du storage et du réseau — cohérent avec `traiterDao` non testé unitairement, seules ses briques pures le sont).

- [ ] **Step 1: Implémenter `lib/veille/decoupage.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairePagesPdf } from "@/lib/appels-offres/normalisation/pdf";
import { decouperEnAvis } from "./chunking";
import { mettreEnFileStructurationAvis } from "./file-attente";
import type { BompNumero } from "./types";

export async function traiterDecoupageBomp(
  supabase: SupabaseClient,
  bompNumeroId: string,
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("bomp_numero")
    .select("*")
    .eq("id", bompNumeroId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`BOMP introuvable : ${bompNumeroId}`);
  }

  const bompNumero = data as BompNumero;

  try {
    await supabase
      .from("bomp_numero")
      .update({ statut: "extraction_en_cours" })
      .eq("id", bompNumeroId);

    const { data: fichierData, error: erreurTelechargement } = await supabase.storage
      .from("bomp-national")
      .download(bompNumero.fichier_path);

    if (erreurTelechargement || !fichierData) {
      throw new Error("Échec du téléchargement du fichier BOMP depuis le stockage.");
    }

    const buffer = Buffer.from(await fichierData.arrayBuffer());
    const pages = await extrairePagesPdf(buffer);
    const texteComplet = pages.map((p) => p.texte).join("\n");

    const avis = decouperEnAvis(texteComplet);

    if (avis.length === 0) {
      throw new Error(
        "Aucun avis reconnu dans ce BOMP — motif ARTICLE 1 introuvable (mise en page différente ?).",
      );
    }

    const { data: lignesInserees, error: erreurInsertion } = await supabase
      .from("avis_ao_national")
      .insert(
        avis.map((a) => ({
          bomp_numero_id: bompNumeroId,
          reference: a.reference,
          texte_brut: a.texteBrut,
        })),
      )
      .select("id");

    if (erreurInsertion || !lignesInserees) {
      throw new Error(`Échec de l'insertion des avis : ${erreurInsertion?.message}`);
    }

    await supabase
      .from("bomp_numero")
      .update({ nombre_avis_extraits: lignesInserees.length })
      .eq("id", bompNumeroId);

    for (const ligne of lignesInserees) {
      await mettreEnFileStructurationAvis(ligne.id);
    }
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase
      .from("bomp_numero")
      .update({ statut: "erreur", erreur_message: message })
      .eq("id", bompNumeroId);
    throw erreur;
  }
}
```

- [ ] **Step 2: Implémenter `app/api/veille/decouper/route.ts`**

```ts
import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { traiterDecoupageBomp } from "@/lib/veille/decoupage";
import { construireUrlCallbackDecoupage } from "@/lib/veille/file-attente";

// Un BOMP fait 200+ pages : extraction pdfjs-dist + découpage + insertion
// de ~40 lignes peut dépasser quelques secondes — même plafond que le
// traitement DAO (60s, maximum autorisé sur le plan Vercel Hobby).
export const maxDuration = 60;

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request): Promise<Response> {
  const corpsBrut = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return new Response("Signature manquante", { status: 401 });
  }

  let signatureValide: boolean;
  try {
    signatureValide = await receiver.verify({
      signature,
      body: corpsBrut,
      url: construireUrlCallbackDecoupage(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  let bompNumeroId: string;
  try {
    ({ bompNumeroId } = JSON.parse(corpsBrut) as { bompNumeroId: string });
  } catch {
    return new Response("Corps de requête invalide", { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    await traiterDecoupageBomp(supabase, bompNumeroId);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return new Response(`Échec du découpage : ${message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/veille/decoupage.ts app/api/veille/decouper/route.ts
git commit -m "feat(veille): endpoint QStash de découpage du BOMP"
```

---

### Task 7: Endpoint QStash — structuration

**Files:**
- Create: `lib/veille/structuration-avis.ts`
- Create: `app/api/veille/structurer/route.ts`

**Interfaces:**
- Consumes: `structurerAvis` (Task 4)
- Produces: `traiterStructurationAvis(supabase, avisId: string): Promise<void>`

- [ ] **Step 1: Implémenter `lib/veille/structuration-avis.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { structurerAvis } from "./structurer";
import type { AvisAoNational } from "./types";

export async function traiterStructurationAvis(
  supabase: SupabaseClient,
  avisId: string,
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("avis_ao_national")
    .select("*")
    .eq("id", avisId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`Avis introuvable : ${avisId}`);
  }

  const avis = data as AvisAoNational;

  const structure = await structurerAvis(avis.texte_brut);

  const { error: erreurMiseAJour } = await supabase
    .from("avis_ao_national")
    .update({
      type: structure.type,
      autorite_contractante: structure.autorite_contractante,
      objet: structure.objet,
      secteur: structure.secteur,
      montant_caution: structure.montant_caution,
      date_limite_remise_offres: structure.date_limite_remise_offres,
      contact_retrait: structure.contact_retrait,
      nombre_lots: structure.nombre_lots,
    })
    .eq("id", avisId);

  if (erreurMiseAJour) {
    throw new Error(`Échec de la mise à jour de l'avis : ${erreurMiseAJour.message}`);
  }

  // Dernier avis structuré de ce BOMP : fait passer bomp_numero au statut
  // "termine". Pas d'orchestrateur séparé — chaque job de structuration
  // vérifie lui-même s'il était le dernier restant (type is null = pas
  // encore structuré, y compris ce job juste avant sa propre mise à jour
  // ci-dessus donc on requête APRÈS avoir écrit).
  const { count } = await supabase
    .from("avis_ao_national")
    .select("id", { count: "exact", head: true })
    .eq("bomp_numero_id", avis.bomp_numero_id)
    .is("type", null);

  if (count === 0) {
    await supabase
      .from("bomp_numero")
      .update({ statut: "termine" })
      .eq("id", avis.bomp_numero_id);
  }
}
```

- [ ] **Step 2: Implémenter `app/api/veille/structurer/route.ts`**

```ts
import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { traiterStructurationAvis } from "@/lib/veille/structuration-avis";
import { construireUrlCallbackStructuration } from "@/lib/veille/file-attente";

export const maxDuration = 60;

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request): Promise<Response> {
  const corpsBrut = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return new Response("Signature manquante", { status: 401 });
  }

  let signatureValide: boolean;
  try {
    signatureValide = await receiver.verify({
      signature,
      body: corpsBrut,
      url: construireUrlCallbackStructuration(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  let avisId: string;
  try {
    ({ avisId } = JSON.parse(corpsBrut) as { avisId: string });
  } catch {
    return new Response("Corps de requête invalide", { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    await traiterStructurationAvis(supabase, avisId);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return new Response(`Échec de la structuration : ${message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/veille/structuration-avis.ts app/api/veille/structurer/route.ts
git commit -m "feat(veille): endpoint QStash de structuration d'un avis"
```

---

### Task 8: Requêtes de lecture

**Files:**
- Create: `lib/veille/queries.ts`

**Interfaces:**
- Consumes: rien
- Produces: `obtenirUtilisateurEstSuperAdmin(): Promise<boolean>`, `listerAvisNational(): Promise<AvisAoNational[]>`, `listerImportationsEntreprise(entrepriseId: string): Promise<Set<string>>` (ids d'avis déjà importés), `listerBompNumeros(): Promise<BompNumero[]>` — utilisées par Tasks 9, 11, 12.

- [ ] **Step 1: Implémenter `lib/veille/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import type { AvisAoNational, BompNumero } from "./types";

export async function obtenirUtilisateurEstSuperAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;
  if (!userId) return false;

  const { data } = await supabase
    .from("utilisateur")
    .select("super_admin")
    .eq("id", userId)
    .maybeSingle();

  return data?.super_admin ?? false;
}

export async function listerAvisNational(): Promise<AvisAoNational[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("avis_ao_national")
    .select("*")
    .order("date_limite_remise_offres", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as AvisAoNational[];
}

export async function listerImportationsEntreprise(entrepriseId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("avis_ao_national_importation")
    .select("avis_id")
    .eq("entreprise_id", entrepriseId);

  if (error) throw error;
  return new Set((data ?? []).map((ligne) => ligne.avis_id as string));
}

export async function listerBompNumeros(): Promise<BompNumero[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bomp_numero")
    .select("*")
    .order("date_publication", { ascending: false });

  if (error) throw error;
  return (data ?? []) as BompNumero[];
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/veille/queries.ts
git commit -m "feat(veille): requêtes de lecture (avis, importations, bomp_numero)"
```

---

### Task 9: Server Actions — upload admin et import client

**Files:**
- Create: `lib/veille/actions.ts`

**Interfaces:**
- Consumes: `uploaderBompSchema` (Task 2), `mettreEnFileDecoupageBomp` (Task 5), `obtenirUtilisateurEstSuperAdmin` (Task 8), `obtenirUtilisateurCourant` (`lib/utilisateur/queries.ts`, existant)
- Produces: `uploaderBomp(formData: FormData): Promise<{erreur: string} | {succes: true}>`, `importerAvis(avisId: string): Promise<{erreur: string} | {succes: true; appelOffresId: string}>` — utilisées par Tasks 11, 12.

- [ ] **Step 1: Implémenter `lib/veille/actions.ts`**

```ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { obtenirUtilisateurEstSuperAdmin } from "./queries";
import { uploaderBompSchema } from "./schema";
import { mettreEnFileDecoupageBomp } from "./file-attente";

export async function uploaderBomp(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) return { erreur: "Non autorisé." };

  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = uploaderBompSchema.safeParse({
    numero: formData.get("numero"),
    datePublication: formData.get("datePublication"),
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { numero, datePublication, fichier } = parsed.data;
  const bompNumeroId = randomUUID();
  const nomNettoye = fichier.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cheminStockage = `${bompNumeroId}-${nomNettoye}`;

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("bomp-national")
    .upload(cheminStockage, fichier, { contentType: "application/pdf" });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("bomp_numero").insert({
    id: bompNumeroId,
    numero,
    date_publication: datePublication,
    fichier_path: cheminStockage,
    cree_par: utilisateur.id,
  });

  if (erreurInsertion) {
    await supabase.storage.from("bomp-national").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du BOMP. Réessayez." };
  }

  try {
    await mettreEnFileDecoupageBomp(bompNumeroId);
  } catch {
    await supabase.from("bomp_numero").delete().eq("id", bompNumeroId);
    await supabase.storage.from("bomp-national").remove([cheminStockage]);
    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/admin/veille");
  return { succes: true as const };
}

export async function importerAvis(
  avisId: string,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("importer_avis_national", {
    p_avis_id: avisId,
    p_entreprise_id: utilisateur.entreprise_id,
    p_utilisateur_id: utilisateur.id,
  });

  // Code Postgres 23505 = violation de contrainte unique
  // (avis_id, entreprise_id) : déjà importé (double-clic, autre onglet).
  if (error?.code === "23505") {
    return { erreur: "Cet avis a déjà été importé." };
  }

  if (error || !data) {
    return { erreur: "Échec de l'import. Réessayez." };
  }

  revalidatePath("/veille");
  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId: data as string };
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/veille/actions.ts
git commit -m "feat(veille): server actions upload admin et import client"
```

---

### Task 10: Sidebar et traductions

**Files:**
- Modify: `components/app-sidebar.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: rien
- Produces: clés `Sidebar.veille`, namespace `Veille.*` — utilisées par Task 11.

- [ ] **Step 1: Ajouter les clés dans `messages/fr.json`**

Ajouter `"veille": "Veille"` dans le bloc `"Sidebar"` existant, et un nouveau
bloc `"Veille"` (au même niveau que `"Pipeline"`, `"Parametres"`) :

```json
"Veille": {
  "page": {
    "titre": "Veille des appels d'offres",
    "description": "Nouveaux avis publiés au Bulletin Officiel des Marchés Publics, à importer dans votre pipeline.",
    "filAriane": "Veille"
  },
  "filtres": {
    "tousSecteurs": "Tous secteurs",
    "tousTypes": "Tous types",
    "type": {
      "travaux": "Travaux",
      "fournitures": "Fournitures",
      "prestations": "Prestations",
      "manifestation_interet": "Manifestation d'intérêt"
    },
    "rechercherPlaceholder": "Rechercher..."
  },
  "table": {
    "aucunAvis": "Aucun avis pour l'instant.",
    "aucunResultat": "Aucun avis ne correspond à ce filtre.",
    "colonneReference": "Référence",
    "colonneObjet": "Objet",
    "colonneAcheteur": "Acheteur",
    "colonneSecteur": "Secteur",
    "colonneDateLimite": "Date limite",
    "colonneActions": "Actions",
    "boutonImporter": "Importer dans mon pipeline",
    "dejaImporte": "Déjà importé",
    "toastImporte": "Appel d'offres importé",
    "erreurImport": "Échec de l'import. Réessayez."
  },
  "error": {
    "message": "Impossible de charger la veille.",
    "reessayer": "Réessayer"
  }
}
```

- [ ] **Step 2: Ajouter les clés équivalentes dans `messages/en.json`**

```json
"Veille": {
  "page": {
    "titre": "Tender watch",
    "description": "New notices published in the Official Bulletin of Public Procurement, ready to import into your pipeline.",
    "filAriane": "Watch"
  },
  "filtres": {
    "tousSecteurs": "All sectors",
    "tousTypes": "All types",
    "type": {
      "travaux": "Works",
      "fournitures": "Supplies",
      "prestations": "Services",
      "manifestation_interet": "Expression of interest"
    },
    "rechercherPlaceholder": "Search..."
  },
  "table": {
    "aucunAvis": "No notices yet.",
    "aucunResultat": "No notice matches this filter.",
    "colonneReference": "Reference",
    "colonneObjet": "Subject",
    "colonneAcheteur": "Buyer",
    "colonneSecteur": "Sector",
    "colonneDateLimite": "Deadline",
    "colonneActions": "Actions",
    "boutonImporter": "Import into my pipeline",
    "dejaImporte": "Already imported",
    "toastImporte": "Tender imported",
    "erreurImport": "Import failed. Please try again."
  },
  "error": {
    "message": "Unable to load the tender watch.",
    "reessayer": "Try again"
  }
}
```

Et `"veille": "Watch"` dans le bloc `"Sidebar"` de `en.json`.

- [ ] **Step 3: Valider le JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('OK')"`
Expected: `OK`

- [ ] **Step 4: Ajouter l'entrée sidebar dans `components/app-sidebar.tsx`**

Importer `Radar` depuis `lucide-react` (en plus de `Library, FileSearch, Kanban, Settings` déjà importés), ajouter un `SidebarMenuItem` entre "Appels d'offres" et "Pipeline" :

```tsx
<SidebarMenuItem>
  <SidebarMenuButton asChild tooltip={t("veille")}>
    <Link href="/veille">
      <Radar />
      <span>{t("veille")}</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

- [ ] **Step 5: Vérifier la compilation et le lint**

Run: `npx tsc --noEmit && npx eslint components/app-sidebar.tsx`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add components/app-sidebar.tsx messages/fr.json messages/en.json
git commit -m "feat(veille): entrée sidebar et traductions FR/EN"
```

---

### Task 11: Écran client `/veille`

**Files:**
- Create: `app/(app)/veille/page.tsx`
- Create: `app/(app)/veille/veille-table.tsx`

**Interfaces:**
- Consumes: `listerAvisNational`, `listerImportationsEntreprise` (Task 8), `importerAvis` (Task 9), `obtenirUtilisateurCourant` (existant)

- [ ] **Step 1: Implémenter `app/(app)/veille/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerAvisNational, listerImportationsEntreprise } from "@/lib/veille/queries";
import { VeilleTable } from "./veille-table";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function VeillePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const [avis, importations] = await Promise.all([
    listerAvisNational(),
    listerImportationsEntreprise(utilisateur.entreprise_id),
  ]);
  const t = await getTranslations("Veille.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <VeilleTable avis={avis} avisImportesIds={[...importations]} />
    </div>
  );
}
```

- [ ] **Step 2: Implémenter `app/(app)/veille/veille-table.tsx`**

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { importerAvis } from "@/lib/veille/actions";
import type { AvisAoNational, TypeAvisAoNational } from "@/lib/veille/types";

export function VeilleTable({
  avis,
  avisImportesIds,
}: {
  avis: AvisAoNational[];
  avisImportesIds: string[];
}) {
  const t = useTranslations("Veille");
  const [secteur, setSecteur] = useState<string>("tous");
  const [type, setType] = useState<TypeAvisAoNational | "tous">("tous");
  const [recherche, setRecherche] = useState("");
  const [importes, setImportes] = useState(new Set(avisImportesIds));
  const [isPending, startTransition] = useTransition();
  const [avisEnCours, setAvisEnCours] = useState<string | null>(null);

  const secteurs = useMemo(
    () => [...new Set(avis.map((a) => a.secteur).filter((s): s is string => !!s))],
    [avis],
  );

  const avisFiltres = useMemo(() => {
    return avis.filter((a) => {
      const correspondSecteur = secteur === "tous" || a.secteur === secteur;
      const correspondType = type === "tous" || a.type === type;
      const correspondRecherche = (a.objet ?? "")
        .toLowerCase()
        .includes(recherche.toLowerCase());
      return correspondSecteur && correspondType && correspondRecherche;
    });
  }, [avis, secteur, type, recherche]);

  function importer(avisId: string) {
    setAvisEnCours(avisId);
    startTransition(async () => {
      const resultat = await importerAvis(avisId);
      setAvisEnCours(null);
      if ("erreur" in resultat) {
        toast.error(t("table.erreurImport"));
      } else {
        setImportes((prev) => new Set(prev).add(avisId));
        toast.success(t("table.toastImporte"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <select
          value={secteur}
          onChange={(e) => setSecteur(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="tous">{t("filtres.tousSecteurs")}</option>
          {secteurs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TypeAvisAoNational | "tous")}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="tous">{t("filtres.tousTypes")}</option>
          <option value="travaux">{t("filtres.type.travaux")}</option>
          <option value="fournitures">{t("filtres.type.fournitures")}</option>
          <option value="prestations">{t("filtres.type.prestations")}</option>
          <option value="manifestation_interet">
            {t("filtres.type.manifestation_interet")}
          </option>
        </select>
        <Input
          placeholder={t("filtres.rechercherPlaceholder")}
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          className="w-full sm:w-64"
        />
      </div>

      {avis.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("table.aucunAvis")}</p>
      ) : avisFiltres.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("table.aucunResultat")}</p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneReference")}</TableHead>
              <TableHead>{t("table.colonneObjet")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneSecteur")}</TableHead>
              <TableHead>{t("table.colonneDateLimite")}</TableHead>
              <TableHead className="text-right">{t("table.colonneActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {avisFiltres.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.reference}</TableCell>
                <TableCell>{a.objet}</TableCell>
                <TableCell>{a.autorite_contractante}</TableCell>
                <TableCell>{a.secteur}</TableCell>
                <TableCell>
                  {a.date_limite_remise_offres
                    ? new Date(a.date_limite_remise_offres).toLocaleDateString("fr-FR")
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={importes.has(a.id) || (isPending && avisEnCours === a.id)}
                    onClick={() => importer(a.id)}
                  >
                    {importes.has(a.id) ? t("table.dejaImporte") : t("table.boutonImporter")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Vérifier la compilation et le lint**

Run: `npx tsc --noEmit && npx eslint "app/(app)/veille/page.tsx" "app/(app)/veille/veille-table.tsx"`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/veille/page.tsx" "app/(app)/veille/veille-table.tsx"
git commit -m "feat(veille): écran client /veille (liste, filtres, import)"
```

---

### Task 12: Écran admin `/admin/veille`

**Files:**
- Create: `app/admin/veille/page.tsx`
- Create: `app/admin/veille/upload-bomp-form.tsx`

**Interfaces:**
- Consumes: `obtenirUtilisateurEstSuperAdmin`, `listerBompNumeros` (Task 8), `uploaderBomp` (Task 9)

- [ ] **Step 1: Implémenter `app/admin/veille/page.tsx`**

Garde `super_admin` au même patron que `app/onboarding/page.tsx` (redirection,
pas d'écran d'erreur générique). Hors du groupe de route `(app)` — pas de
sidebar/thème/langue, écran interne minimal, en français uniquement (voir
Global Constraints).

```tsx
import { redirect } from "next/navigation";
import { obtenirUtilisateurEstSuperAdmin, listerBompNumeros } from "@/lib/veille/queries";
import { UploadBompForm } from "./upload-bomp-form";

export const instant = false;

export default async function AdminVeillePage() {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) redirect("/bibliotheque");

  const bompNumeros = await listerBompNumeros();

  return (
    <div className="min-h-screen p-8 flex flex-col gap-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Veille — Administration</h1>
      <UploadBompForm />
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Éditions déjà traitées</h2>
        {bompNumeros.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune édition pour l'instant.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Numéro</th>
                <th className="py-2">Date</th>
                <th className="py-2">Statut</th>
                <th className="py-2">Avis extraits</th>
              </tr>
            </thead>
            <tbody>
              {bompNumeros.map((b) => (
                <tr key={b.id} className="border-b">
                  <td className="py-2">{b.numero}</td>
                  <td className="py-2">
                    {new Date(b.date_publication).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="py-2">{b.statut}</td>
                  <td className="py-2">{b.nombre_avis_extraits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implémenter `app/admin/veille/upload-bomp-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { uploaderBomp } from "@/lib/veille/actions";

export function UploadBompForm() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    setErreur(null);
    const resultat = await uploaderBomp(formData);
    setEnvoi(false);
    if (resultat?.erreur) {
      setErreur(resultat.erreur);
    }
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-4 border rounded-lg p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="numero">Numéro du BOMP</Label>
        <Input id="numero" name="numero" placeholder="Ex. 1896" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="datePublication">Date de publication</Label>
        <Input id="datePublication" name="datePublication" type="date" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fichier">Fichier PDF</Label>
        <Input id="fichier" name="fichier" type="file" accept="application/pdf" required />
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={envoi}>
        {envoi ? "Envoi..." : "Téléverser le BOMP"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Vérifier la compilation et le lint**

Run: `npx tsc --noEmit && npx eslint app/admin/veille/page.tsx app/admin/veille/upload-bomp-form.tsx`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier le build de production complet**

Run: `npm run build`
Expected: build réussi, toutes les routes listées sans erreur (piège
"Cache Components" déjà rencontré sur ce projet — toute page qui lit un
cookie via `obtenirUtilisateurCourant`/`obtenirUtilisateurEstSuperAdmin`
sans `export const instant = false` casse le build, pas seulement un
avertissement dev).

- [ ] **Step 5: Commit**

```bash
git add app/admin/veille/page.tsx app/admin/veille/upload-bomp-form.tsx
git commit -m "feat(veille): écran admin /admin/veille (liste + upload)"
```

---

### Task 13: Garde-fous sur le code existant impacté par `fichier_dao_path` nullable

**Files:**
- Modify: `lib/appels-offres/types.ts`
- Modify: `lib/appels-offres/actions.ts`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`

**Interfaces:**
- Consumes: rien de nouveau — corrige des usages existants pour tolérer `null`.

- [ ] **Step 1: Mettre à jour le type `AppelOffres`**

Dans `lib/appels-offres/types.ts`, changer :

```ts
fichier_dao_path: string;
fichier_dao_nom_original: string;
```

en :

```ts
fichier_dao_path: string | null;
fichier_dao_nom_original: string | null;
```

- [ ] **Step 2: Guarder `supprimerAppelOffres` contre un chemin `null`**

Dans `lib/appels-offres/actions.ts`, changer la signature et le corps de
`supprimerAppelOffres` :

```ts
export async function supprimerAppelOffres(
  appelOffresId: string,
  cheminStockage: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error: erreurSuppression } = await supabase
    .from("appel_offres")
    .delete()
    .eq("id", appelOffresId);

  if (erreurSuppression) {
    return { erreur: "Échec de la suppression. Réessayez." };
  }

  if (cheminStockage) {
    await supabase.storage.from("documents").remove([cheminStockage]);
  }

  revalidatePath("/appels-offres");
  return { succes: true as const };
}
```

(seul changement : le type du paramètre `cheminStockage` et le `if
(cheminStockage)` avant l'appel à `storage.remove` — le reste est
identique au code actuel.)

- [ ] **Step 3: Masquer le bouton de téléchargement quand il n'y a pas de fichier**

Dans `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, repérer le
bouton qui appelle `telecharger()` (fonction définie autour de la ligne
120, voir citation ci-dessus) et l'entourer d'une condition sur
`appelOffres.fichier_dao_path` :

```tsx
{appelOffres.fichier_dao_path && (
  <Button onClick={telecharger} disabled={telechargement}>
    {/* contenu du bouton existant, inchangé */}
  </Button>
)}
```

Le sous-agent qui exécute cette tâche doit lire le fichier avant
modification (il ne fait pas partie de ce plan avec un extrait complet —
seul l'appel `genererUrlTelechargementDao(appelOffres.fichier_dao_path)`
ligne 122 a été localisé pendant la relecture) : repérer le JSX exact du
bouton correspondant et l'envelopper sans changer son contenu interne.

- [ ] **Step 4: Vérifier la compilation complète du projet**

Run: `npx tsc --noEmit`
Expected: aucune erreur — si le compilateur signale d'autres usages de
`fichier_dao_path`/`fichier_dao_nom_original` non couverts par les steps
1-3 (parmi les 11 fichiers identifiés en relecture de plan :
`lib/appels-offres/traitement.test.ts`, `lib/appels-offres/polling.test.ts`,
`lib/appels-offres/export/plan.test.ts`, `app/(app)/pipeline/pipeline-table.tsx`,
`lib/appels-offres/export/plan.ts`, `lib/appels-offres/traitement.ts`,
`app/(app)/appels-offres/appel-offres-table.tsx`,
`app/(app)/appels-offres/[id]/page.tsx`), corriger au même patron
(vérification `null` avant usage, jamais de valeur sentinelle) plutôt que
de forcer le type avec `!`.

- [ ] **Step 5: Lancer la suite de tests complète**

Run: `npm run test`
Expected: tous les tests passent, y compris ceux des fichiers listés à
l'étape précédente qui référencent ces colonnes dans leurs fixtures.

- [ ] **Step 6: Build de production complet**

Run: `npm run build`
Expected: build réussi.

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/types.ts lib/appels-offres/actions.ts "app/(app)/appels-offres/[id]/appel-offres-detail.tsx"
git commit -m "fix: tolère fichier_dao_path/nom_original null (AO importés du catalogue national)"
```

---

## Après l'implémentation (hors plan, actions manuelles de Sorel)

1. Appliquer la migration au projet Supabase réel : `supabase db push` (action infra, à exécuter par Sorel lui-même — voir Global Constraints).
2. Activer `super_admin = true` sur son propre compte `utilisateur` (via Supabase Studio, aucune UI ne le permet — c'est volontaire, pas un oubli).
3. Tester l'upload avec le vrai fichier `BOMP_1896__du_mardi_22_septembre_2026.pdf` déjà sur son poste, vérifier visuellement le résultat de l'extraction sur `/veille` avant tout usage réel avec le client pilote.
