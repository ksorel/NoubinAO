# Veille marchés publics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le pipeline de veille BOMP (PDF + IA, déjà en prod)
par un scraping quotidien de `marchespublics.ci/appel_offre` (portail
public DGMP, sans authentification, données déjà structurées), en
réutilisant les tables et écrans `avis_ao_national`/`/veille`/
`/admin/veille` existants.

**Architecture:** Un Route Handler QStash (`/api/veille/marches-publics/sync`,
déclenché par une Schedule QStash quotidienne) fait un `fetch` vers la
page publique, parse la table HTML avec `cheerio`, filtre les avis
encore ouverts, les upsert dans `avis_ao_national` (colonnes existantes,
migration légère pour les rendre compatibles avec une source sans PDF),
purge les avis expirés, puis journalise l'exécution dans une nouvelle
table `veille_execution` affichée sur `/admin/veille`. Le code
BOMP-spécifique (chunking PDF, structuration IA par avis, upload admin)
est supprimé dans ce même plan.

**Tech Stack:** Next.js App Router (Route Handlers + Server Actions),
Supabase (Postgres + RLS), `@upstash/qstash` (Receiver + Schedule),
`cheerio` (nouveau, parsing HTML), Vitest (TDD).

## Global Constraints

- Dédoublonnage par `(reference, objet)` composite — `reference` seule
  n'est **pas** unique dans la source (collision réelle observée : `T
  73/2023` avec deux objets différents).
- Ne charger que les avis dont `date_limite_remise_offres` est
  strictement dans le futur au moment du scraping ; un avis avec date
  limite non parsable est exclu, pas retenu par défaut.
- Purger à chaque exécution les avis déjà en base devenus échus
  (`date_limite_remise_offres < aujourd'hui`), qu'ils viennent de BOMP ou
  du scraping — pas seulement filtrer à l'affichage.
- `secteur`, `montant_caution`, `contact_retrait`, `nombre_lots`
  toujours `null` pour un avis scrapé (absents de la source) — décision
  déjà actée, ne pas les déduire ni les inventer.
- Catalogue partagé (pas de `entreprise_id` sur `avis_ao_national`),
  écriture réservée au rôle service (`createServiceRoleClient`), lecture
  ouverte à tout utilisateur authentifié.
- Ne jamais utiliser `VERCEL_URL` pour construire l'URL de callback
  QStash — toujours `APP_URL` (piège documenté, voir
  `lib/appels-offres/file-attente.ts`).
- Commits conventionnels (`feat:`, `fix:`, `refactor:`, `docs:`), un
  commit par tâche.

---

### Task 1: Vérifier l'accessibilité de marchespublics.ci depuis l'infra Vercel réelle

**Files:**
- Create (temporaire, supprimé en fin de tâche) : `app/api/veille/verification-acces/route.ts`

**Interfaces:**
- Consumes: rien.
- Produces: rien — cette tâche ne produit aucun code durable, seulement
  une décision go/no-go. Si le résultat est négatif, **arrêter le plan
  ici** et revenir à la spec avec l'utilisateur plutôt que de continuer
  aux tâches suivantes.

Le projet a déjà été bloqué par un géo-blocage/anti-bot sur
`sigomap.ci`/`arcop.ci` depuis une IP datacenter non-ivoirienne (mémoire
`noubinao_veille_sigmap_en_pause`). Non reproduit en local pour
`marchespublics.ci` lors de la vérification de la spec, mais **jamais
testé depuis l'infra de prod réelle (Vercel)** — un accès répété
(scraping quotidien en continu) depuis une IP de datacenter est un
profil de requête différent d'un essai isolé.

- [ ] **Step 1: Créer un endpoint de diagnostic temporaire**

```typescript
// app/api/veille/verification-acces/route.ts
export async function GET(): Promise<Response> {
  try {
    const reponse = await fetch("https://marchespublics.ci/appel_offre", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NoubinAO-verification/1.0)" },
    });
    const texte = await reponse.text();
    return Response.json({
      status: reponse.status,
      taille: texte.length,
      contientTable: texte.includes('id="example"'),
    });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return Response.json({ erreur: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Déployer sur une preview Vercel**

```bash
git add app/api/veille/verification-acces/route.ts
git commit -m "chore: endpoint temporaire de vérification accès marchespublics.ci"
git push origin HEAD:verification-acces-marches-publics
```

Attendre que Vercel crée le déploiement preview (dashboard Vercel ou
`vercel ls` si le CLI est authentifié). Récupérer l'URL du preview
(ex. `https://noubinao-git-verification-acces-marches-publics-<org>.vercel.app`).

- [ ] **Step 3: Appeler l'endpoint depuis l'extérieur**

Run: `curl -s "<url-preview>/api/veille/verification-acces"`
Expected: `{"status":200,"taille":<un nombre > 500000>,"contientTable":true}`

**Si `status` n'est pas 200, ou `contientTable` est `false`, ou la
requête time out** : le risque de géo-blocage documenté dans la spec est
réel. Ne pas continuer aux tâches suivantes — revenir vers l'utilisateur
avec ce résultat, la conception doit être reconsidérée (proxy, service de
scraping tiers, ou retour à une piste différente).

- [ ] **Step 4: Nettoyer — supprimer l'endpoint temporaire et la branche**

```bash
git checkout main
git branch -D verification-acces-marches-publics
git push origin --delete verification-acces-marches-publics
```

L'endpoint temporaire n'est jamais mergé sur `main` — la vraie logique
de récupération de la page sera (ré)implémentée proprement en Tâche 3,
avec gestion d'erreur et journalisation dans `veille_execution`, pas ce
diagnostic jetable.

---

### Task 2: Dépendance cheerio + migration SQL

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/20260929120000_veille_marches_publics.sql`

**Interfaces:**
- Consumes: rien.
- Produces: schéma de base mis à jour — `avis_ao_national.bomp_numero_id`
  et `avis_ao_national.texte_brut` deviennent nullable, contrainte unique
  `avis_ao_national_reference_objet_key` sur `(reference, objet)`,
  nouvelle table `veille_execution` avec sa policy de lecture.

- [ ] **Step 1: Installer cheerio**

```bash
npm install cheerio
```

Vérifie que `package.json` gagne une ligne `"cheerio": "^1.2.0"` (ou plus
récent) dans `dependencies`.

- [ ] **Step 2: Vérifier l'absence de doublons (reference, objet) avant migration**

Avant d'ajouter la contrainte unique, vérifier que les 46 avis BOMP déjà
en base n'entrent pas en collision entre eux (la contrainte porte sur
`avis_ao_national` entière, BOMP et futurs avis scrapés confondus).

Run (via un script temporaire ou le SQL Editor Supabase) :
```sql
select reference, objet, count(*)
from avis_ao_national
group by reference, objet
having count(*) > 1;
```
Expected: 0 ligne. Si des doublons existent, les examiner avant de
continuer (ne pas ajouter une contrainte qui échouerait au déploiement).

- [ ] **Step 3: Écrire la migration**

```sql
-- supabase/migrations/20260929120000_veille_marches_publics.sql

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
```

- [ ] **Step 4: Appliquer la migration**

Run: `npx supabase db push`
Expected: `Applying migration 20260929120000_veille_marches_publics.sql...` puis `Finished supabase db push.`

Si la commande échoue avec une erreur d'authentification CLI (« Your
account does not have the necessary privileges »), vérifier que
`SUPABASE_ACCESS_TOKEN` n'est pas défini dans `.env.local` — cette
variable, si présente, écrase silencieusement un `supabase login` frais
(mémoire `noubinao_supabase_access_token_gotcha`).

- [ ] **Step 5: Vérifier le schéma en base**

Run (SQL Editor Supabase ou script service-role) :
```sql
select column_name, is_nullable
from information_schema.columns
where table_name = 'avis_ao_national' and column_name in ('bomp_numero_id', 'texte_brut');
```
Expected: les deux lignes affichent `is_nullable = 'YES'`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json supabase/migrations/20260929120000_veille_marches_publics.sql
git commit -m "feat: migration schéma veille marchés publics + dépendance cheerio"
```

---

### Task 3: Extraction des avis depuis le HTML source (TDD)

**Files:**
- Create: `lib/veille/marches-publics.ts`
- Create: `lib/veille/marches-publics.test.ts`
- Create: `fixtures/veille/marches-publics-extrait.html`

**Interfaces:**
- Consumes: rien (module autonome, aucune dépendance sur Supabase à ce
  stade).
- Produces:
  - `interface AvisScrape { reference: string; type: TypeAvisAoNational | null; objet: string; autoriteContractante: string | null; dateLimite: string | null }`
    (`dateLimite` au format `AAAA-MM-JJ` ou `null` si non parsable).
  - `function extraireAvisDepuisHtml(html: string): AvisScrape[]`
  - Réutilisé en Tâche 4 : `TypeAvisAoNational` importé depuis
    `./types` (déjà existant, inchangé : `"travaux" | "fournitures" |
    "prestations" | "manifestation_interet"`).

- [ ] **Step 1: Créer la fixture HTML réelle**

Extrait réel de la page capturée pendant la vérification de la spec
(pas un exemple inventé) — contient la collision `T 73/2023` (même
référence, objets différents), un `Date de publication` invalide
(`30-11--0001`, présent sur toutes les lignes de cet extrait, cohérent
avec ce qui a été observé), un type `PRESTATION`, deux types `TRAVAUX`,
et une `Autorité Contractante` vide (cellule `<td> </td>`) — tous des cas
réels rencontrés dans la source.

```html
<!-- fixtures/veille/marches-publics-extrait.html -->
<table id="example" class="table table-striped table-bordered" style="width:100%">
    <thead class="header_tb2">
        <tr>
            <th>Numéro AO</th>
            <th>Type de marché</th>
            <th>Objet</th>
            <th>Autorité Contractante</th>
            <th>Date de publication</th>
            <th>Date limite </th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>P 68/2022</td>
            <td>
            PRESTATION                                    </td>
            <td>Sécurité privée des sites de la RTI
RADIODIFFUSION TÉLÉVISION IVOIRIENNE (RTI ) </td>
            <td> </td>
            <td>30-11--0001 </td>
            <td>29-11-2022</td>
        </tr>
        <tr>
            <td>T 73/2023</td>
            <td>
            TRAVAUX                                    </td>
            <td>TRAVAUX DE CONSTRUCTION
DES CLÔTURES AVEC GUERITES
DES ECOLES MATERNELLES ET
PRIMAIRES PUBLIQUES
DE LA COMMUNE </td>
            <td> </td>
            <td>30-11--0001 </td>
            <td>31-03-2023</td>
        </tr>
        <tr>
            <td>T 73/2023</td>
            <td>
            TRAVAUX                                    </td>
            <td>TRAVAUX DE REHABILITATION
D'INFRASTRUCTURES
SCOLAIRES PRIMAIRES
PUBLIQUES
DANS LA COMMUNE </td>
            <td> </td>
            <td>30-11--0001 </td>
            <td>07-04-2023</td>
        </tr>
        <tr>
            <td>F 500/2027</td>
            <td>
            FOURNITURE                                    </td>
            <td>Fourniture de matériel informatique pour un ministère </td>
            <td>Ministère de l'exemple </td>
            <td>30-11--0001 </td>
            <td>15-06-2027</td>
        </tr>
    </tbody>
</table>
```

- [ ] **Step 2: Écrire les tests (échouent, le module n'existe pas encore)**

```typescript
// lib/veille/marches-publics.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraireAvisDepuisHtml } from "./marches-publics";

const HTML_EXTRAIT = readFileSync(
  path.join(process.cwd(), "fixtures", "veille", "marches-publics-extrait.html"),
  "utf-8",
);

describe("extraireAvisDepuisHtml", () => {
  it("extrait une ligne avec tous les champs attendus", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    const premier = avis[0];
    expect(premier.reference).toBe("P 68/2022");
    expect(premier.type).toBe("prestations");
    expect(premier.objet).toContain("Sécurité privée des sites de la RTI");
    expect(premier.autoriteContractante).toBeNull();
    expect(premier.dateLimite).toBe("2022-11-29");
  });

  it("traite une Date de publication invalide sans faire échouer la ligne", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    // Le champ date_publication n'est jamais stocké (voir spec) — ce
    // test vérifie seulement que la ligne entière reste exploitable
    // malgré la valeur "30-11--0001" présente dans la source.
    expect(avis[0].dateLimite).not.toBeNull();
  });

  it("conserve deux lignes distinctes pour une référence dupliquée avec objets différents", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    const lignesT73 = avis.filter((a) => a.reference === "T 73/2023");
    expect(lignesT73).toHaveLength(2);
    expect(lignesT73[0].objet).not.toBe(lignesT73[1].objet);
  });

  it("mappe TRAVAUX/FOURNITURE/PRESTATION vers les valeurs de l'enum existant", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    expect(avis.find((a) => a.reference === "T 73/2023")?.type).toBe("travaux");
    expect(avis.find((a) => a.reference === "F 500/2027")?.type).toBe("fournitures");
  });

  it("renvoie une autorité contractante non vide quand la source la renseigne", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    const fourniture = avis.find((a) => a.reference === "F 500/2027");
    expect(fourniture?.autoriteContractante).toBe("Ministère de l'exemple");
  });

  it("renvoie null pour une date limite au format inattendu", () => {
    const html = HTML_EXTRAIT.replace("29-11-2022", "date inconnue");
    const avis = extraireAvisDepuisHtml(html);
    expect(avis[0].dateLimite).toBeNull();
  });

  it("renvoie null pour un type de marché non reconnu", () => {
    const html = HTML_EXTRAIT.replace("PRESTATION", "AUTRE CHOSE");
    const avis = extraireAvisDepuisHtml(html);
    expect(avis[0].type).toBeNull();
  });
});
```

- [ ] **Step 3: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/veille/marches-publics.test.ts`
Expected: FAIL — `Cannot find module './marches-publics'`

- [ ] **Step 4: Implémenter `extraireAvisDepuisHtml`**

```typescript
// lib/veille/marches-publics.ts
import * as cheerio from "cheerio";
import type { TypeAvisAoNational } from "./types";

export interface AvisScrape {
  reference: string;
  type: TypeAvisAoNational | null;
  objet: string;
  autoriteContractante: string | null;
  dateLimite: string | null;
}

// Mapping volontairement strict (comparaison exacte après trim/upper) —
// aucune valeur "manifestation d'intérêt" observée dans l'échantillon
// inspecté à ce jour ; ce mapping reste ouvert à cette 4e valeur si elle
// apparaît sous un libellé à découvrir en pratique (voir spec).
const MAPPING_TYPE_MARCHE: Record<string, TypeAvisAoNational> = {
  TRAVAUX: "travaux",
  FOURNITURE: "fournitures",
  PRESTATION: "prestations",
};

function mapperTypeMarche(texteSource: string): TypeAvisAoNational | null {
  const cle = texteSource.trim().toUpperCase();
  return MAPPING_TYPE_MARCHE[cle] ?? null;
}

// Format observé dans la source : "JJ-MM-AAAA", parfois avec un espace
// final. Convertit vers le format ISO attendu par une colonne Postgres
// `date`. Toute valeur qui ne correspond pas exactement à ce format
// devient null plutôt que de risquer une date silencieusement fausse.
function parserDateLimite(texteSource: string): string | null {
  const nettoye = texteSource.trim();
  const correspondance = nettoye.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!correspondance) return null;

  const [, jour, mois, annee] = correspondance;
  return `${annee}-${mois}-${jour}`;
}

export function extraireAvisDepuisHtml(html: string): AvisScrape[] {
  const $ = cheerio.load(html);
  const avis: AvisScrape[] = [];

  $("#example tbody tr").each((_, ligne) => {
    const cellules = $(ligne).find("td");
    if (cellules.length < 6) return;

    const reference = $(cellules[0]).text().trim();
    const typeTexte = $(cellules[1]).text().trim();
    const objet = $(cellules[2]).text().trim();
    const autoriteContractanteTexte = $(cellules[3]).text().trim();
    const dateLimiteTexte = $(cellules[5]).text().trim();

    if (!reference || !objet) return;

    avis.push({
      reference,
      type: mapperTypeMarche(typeTexte),
      objet,
      autoriteContractante: autoriteContractanteTexte.length > 0 ? autoriteContractanteTexte : null,
      dateLimite: parserDateLimite(dateLimiteTexte),
    });
  });

  return avis;
}
```

- [ ] **Step 5: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/veille/marches-publics.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/veille/marches-publics.ts lib/veille/marches-publics.test.ts fixtures/veille/marches-publics-extrait.html
git commit -m "feat(veille): extraction des avis depuis le HTML de marchespublics.ci"
```

---

### Task 4: Filtre par date limite et partition nouveaux/existants (TDD)

**Files:**
- Modify: `lib/veille/marches-publics.ts`
- Modify: `lib/veille/marches-publics.test.ts`

**Interfaces:**
- Consumes: `AvisScrape` (Tâche 3).
- Produces:
  - `function filtrerAvisEncoreOuverts(avis: AvisScrape[], aujourdHui: Date): AvisScrape[]`
  - `function cleReferenceObjet(avis: Pick<AvisScrape, "reference" | "objet">): string`
  - `function partitionnerAvis(avis: AvisScrape[], clesExistantes: Set<string>): { nouveaux: AvisScrape[]; existants: AvisScrape[] }`
    — consommé par la Tâche 5 pour distinguer insertions (comptées dans
    `veille_execution.nombre_nouveaux_ao`) et mises à jour.

- [ ] **Step 1: Écrire les tests**

```typescript
// Ajout à lib/veille/marches-publics.test.ts
import { cleReferenceObjet, filtrerAvisEncoreOuverts, partitionnerAvis } from "./marches-publics";

describe("filtrerAvisEncoreOuverts", () => {
  const aujourdHui = new Date("2026-09-29T00:00:00Z");

  it("exclut un avis dont la date limite est déjà passée", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2026-01-01" },
    ];
    expect(filtrerAvisEncoreOuverts(avis, aujourdHui)).toHaveLength(0);
  });

  it("conserve un avis dont la date limite est dans le futur", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2027-01-01" },
    ];
    expect(filtrerAvisEncoreOuverts(avis, aujourdHui)).toHaveLength(1);
  });

  it("exclut un avis sans date limite parsable", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: null },
    ];
    expect(filtrerAvisEncoreOuverts(avis, aujourdHui)).toHaveLength(0);
  });
});

describe("partitionnerAvis", () => {
  it("sépare les avis nouveaux des avis déjà connus par (reference, objet)", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2027-01-01" },
      { reference: "B", type: null, objet: "y", autoriteContractante: null, dateLimite: "2027-01-01" },
    ];
    const clesExistantes = new Set([cleReferenceObjet({ reference: "A", objet: "x" })]);

    const { nouveaux, existants } = partitionnerAvis(avis, clesExistantes);
    expect(nouveaux).toHaveLength(1);
    expect(nouveaux[0].reference).toBe("B");
    expect(existants).toHaveLength(1);
    expect(existants[0].reference).toBe("A");
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/veille/marches-publics.test.ts`
Expected: FAIL — `filtrerAvisEncoreOuverts is not a function` (et les deux autres)

- [ ] **Step 3: Implémenter**

```typescript
// Ajout à lib/veille/marches-publics.ts

export function filtrerAvisEncoreOuverts(avis: AvisScrape[], aujourdHui: Date): AvisScrape[] {
  const aujourdHuiTexte = aujourdHui.toISOString().slice(0, 10);
  return avis.filter((a) => a.dateLimite !== null && a.dateLimite >= aujourdHuiTexte);
}

export function cleReferenceObjet(avis: Pick<AvisScrape, "reference" | "objet">): string {
  return `${avis.reference}::${avis.objet}`;
}

export function partitionnerAvis(
  avis: AvisScrape[],
  clesExistantes: Set<string>,
): { nouveaux: AvisScrape[]; existants: AvisScrape[] } {
  const nouveaux: AvisScrape[] = [];
  const existants: AvisScrape[] = [];

  for (const a of avis) {
    if (clesExistantes.has(cleReferenceObjet(a))) {
      existants.push(a);
    } else {
      nouveaux.push(a);
    }
  }

  return { nouveaux, existants };
}
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/veille/marches-publics.test.ts`
Expected: PASS (11 tests au total)

- [ ] **Step 5: Commit**

```bash
git add lib/veille/marches-publics.ts lib/veille/marches-publics.test.ts
git commit -m "feat(veille): filtre par date limite et partition nouveaux/existants"
```

---

### Task 5: Route Handler de synchronisation + schedule QStash

**Files:**
- Create: `app/api/veille/marches-publics/sync/route.ts`
- Create: `scripts/enregistrer-schedule-veille-marches-publics/run.ts`
- Modify: `package.json`
- Modify: `lib/veille/marches-publics.ts` (ajout `recupererPageAppelOffres`)
- Modify: `lib/veille/queries.ts` (ajout `listerVeilleExecutions`)
- Modify: `lib/veille/types.ts` (ajout `VeilleExecution`)

**Interfaces:**
- Consumes: `extraireAvisDepuisHtml`, `filtrerAvisEncoreOuverts`,
  `partitionnerAvis`, `cleReferenceObjet`, `AvisScrape` (Tâches 3-4) ;
  `createServiceRoleClient` (`@/lib/supabase/service-role`, existant).
- Produces: endpoint `POST /api/veille/marches-publics/sync` (callback
  QStash signé) ; `listerVeilleExecutions(): Promise<VeilleExecution[]>`
  consommé par la Tâche 7 (écran admin).

- [ ] **Step 1: Ajouter `recupererPageAppelOffres`**

```typescript
// Ajout à lib/veille/marches-publics.ts

export async function recupererPageAppelOffres(): Promise<string> {
  const reponse = await fetch("https://marchespublics.ci/appel_offre", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NoubinAO/1.0)" },
  });
  if (!reponse.ok) {
    throw new Error(`Échec de la récupération de la page (statut ${reponse.status})`);
  }
  return reponse.text();
}
```

Pas de test unitaire pour cette fonction (appel réseau réel, même
convention que `recupererPageAppelOffres`-équivalents ailleurs dans le
projet — ex. les intégrations Gmail/Outlook ne sont pas testées
unitairement non plus, seulement par vérification manuelle en Tâche 8).

- [ ] **Step 2: Ajouter le type `VeilleExecution`**

```typescript
// Ajout à lib/veille/types.ts
export type StatutExecutionVeille = "succes" | "erreur";

export interface VeilleExecution {
  id: string;
  execute_le: string;
  statut: StatutExecutionVeille;
  nombre_ao_trouves: number | null;
  nombre_nouveaux_ao: number | null;
  erreur_message: string | null;
}
```

- [ ] **Step 3: Ajouter `listerVeilleExecutions`**

```typescript
// Ajout à lib/veille/queries.ts
import type { AvisAoNational, BompNumero, VeilleExecution } from "./types";

export async function listerVeilleExecutions(): Promise<VeilleExecution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("veille_execution")
    .select("*")
    .order("execute_le", { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as VeilleExecution[];
}
```

(L'import existant `import type { AvisAoNational, BompNumero } from
"./types";` en haut du fichier devient
`import type { AvisAoNational, BompNumero, VeilleExecution } from
"./types";` — `BompNumero` reste utilisé par `listerBompNumeros`
jusqu'à sa suppression en Tâche 6.)

- [ ] **Step 4: Écrire le Route Handler**

```typescript
// app/api/veille/marches-publics/sync/route.ts
import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  cleReferenceObjet,
  extraireAvisDepuisHtml,
  filtrerAvisEncoreOuverts,
  partitionnerAvis,
  recupererPageAppelOffres,
} from "@/lib/veille/marches-publics";

// Même raison que app/api/dao/traiter/route.ts et app/api/email/sync/route.ts.
export const maxDuration = 60;

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

function construireUrlCallback(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/veille/marches-publics/sync`;
}

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
      url: construireUrlCallback(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  const supabase = createServiceRoleClient();

  try {
    const html = await recupererPageAppelOffres();
    const avisExtraits = extraireAvisDepuisHtml(html);
    const avisOuverts = filtrerAvisEncoreOuverts(avisExtraits, new Date());

    const { data: existants, error: erreurExistants } = await supabase
      .from("avis_ao_national")
      .select("reference, objet");
    if (erreurExistants) throw erreurExistants;

    const clesExistantes = new Set(
      (existants ?? []).map((e) => cleReferenceObjet({ reference: e.reference, objet: e.objet ?? "" })),
    );
    const { nouveaux, existants: avisAMettreAJour } = partitionnerAvis(avisOuverts, clesExistantes);

    if (nouveaux.length > 0) {
      const { error: erreurInsertion } = await supabase.from("avis_ao_national").insert(
        nouveaux.map((a) => ({
          reference: a.reference,
          type: a.type,
          objet: a.objet,
          autorite_contractante: a.autoriteContractante,
          date_limite_remise_offres: a.dateLimite,
          bomp_numero_id: null,
          texte_brut: null,
          structure_le: new Date().toISOString(),
        })),
      );
      if (erreurInsertion) throw erreurInsertion;
    }

    // Mise à jour des avis déjà connus : la source peut corriger un champ
    // après coup (autorité contractante renseignée plus tard, par
    // exemple) — un upsert par avis plutôt qu'un insert en lot, puisque
    // chacun cible une ligne différente par sa clé composite.
    for (const a of avisAMettreAJour) {
      const { error: erreurMiseAJour } = await supabase
        .from("avis_ao_national")
        .update({
          type: a.type,
          autorite_contractante: a.autoriteContractante,
          date_limite_remise_offres: a.dateLimite,
        })
        .eq("reference", a.reference)
        .eq("objet", a.objet);
      if (erreurMiseAJour) throw erreurMiseAJour;
    }

    // Purge des avis devenus échus, tous pipelines confondus (BOMP
    // historique inclus) — voir spec, étape 6 du pipeline.
    const aujourdHuiTexte = new Date().toISOString().slice(0, 10);
    const { error: erreurNettoyage } = await supabase
      .from("avis_ao_national")
      .delete()
      .lt("date_limite_remise_offres", aujourdHuiTexte);
    if (erreurNettoyage) throw erreurNettoyage;

    await supabase.from("veille_execution").insert({
      statut: "succes",
      nombre_ao_trouves: avisOuverts.length,
      nombre_nouveaux_ao: nouveaux.length,
    });

    return new Response("OK", { status: 200 });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase.from("veille_execution").insert({
      statut: "erreur",
      erreur_message: message,
    });
    return new Response(`Échec de la synchronisation : ${message}`, { status: 500 });
  }
}
```

- [ ] **Step 5: Écrire le script d'enregistrement de la schedule**

```typescript
// scripts/enregistrer-schedule-veille-marches-publics/run.ts
import { Client } from "@upstash/qstash";

async function main() {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    console.error("APP_URL manquante — impossible de construire la destination.");
    process.exit(1);
  }

  const { scheduleId } = await qstash.schedules.create({
    destination: `${appUrl}/api/veille/marches-publics/sync`,
    cron: "0 3 * * *", // tous les jours à 3h du matin (faible trafic, avant l'ouverture des bureaux)
  });

  console.log(`Schedule créée : ${scheduleId}`);
}

main();
```

- [ ] **Step 6: Ajouter le script npm**

Dans `package.json`, section `"scripts"`, ajouter après
`"email-sync-schedule"` :

```json
"veille-marches-publics-schedule": "tsx --env-file-if-exists=.env.local scripts/enregistrer-schedule-veille-marches-publics/run.ts"
```

- [ ] **Step 7: Vérifier la compilation TypeScript**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add app/api/veille/marches-publics/sync/route.ts scripts/enregistrer-schedule-veille-marches-publics/run.ts package.json lib/veille/marches-publics.ts lib/veille/queries.ts lib/veille/types.ts
git commit -m "feat(veille): endpoint de synchronisation quotidienne + schedule QStash"
```

---

### Task 6: Suppression du code BOMP-spécifique

**Files:**
- Delete: `lib/veille/chunking.ts`, `lib/veille/chunking.test.ts`
- Delete: `lib/veille/decoupage.ts`, `lib/veille/decoupage.test.ts`
- Delete: `lib/veille/structuration-avis.ts`, `lib/veille/structuration-avis.test.ts`
- Delete: `lib/veille/structurer.ts`, `lib/veille/structurer.test.ts`
- Delete: `lib/veille/file-attente.ts`
- Delete: `app/api/veille/decouper/route.ts`, `app/api/veille/structurer/route.ts`
- Delete: `app/admin/veille/upload-bomp-form.tsx`
- Modify: `lib/veille/actions.ts`
- Modify: `lib/veille/schema.ts`
- Modify: `lib/veille/types.ts`
- Modify: `lib/veille/queries.ts`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: `lib/veille/actions.ts` n'exporte plus que `importerAvis` ;
  `lib/veille/queries.ts` n'exporte plus `listerBompNumeros` ni
  `BompNumero` (Tâche 7 dépend de cette suppression pour son écran
  réécrit — ne pas faire Tâche 7 avant celle-ci).

- [ ] **Step 1: Supprimer les fichiers du pipeline BOMP**

```bash
git rm lib/veille/chunking.ts lib/veille/chunking.test.ts
git rm lib/veille/decoupage.ts lib/veille/decoupage.test.ts
git rm lib/veille/structuration-avis.ts lib/veille/structuration-avis.test.ts
git rm lib/veille/structurer.ts lib/veille/structurer.test.ts
git rm lib/veille/file-attente.ts
git rm app/api/veille/decouper/route.ts app/api/veille/structurer/route.ts
git rm app/admin/veille/upload-bomp-form.tsx
```

(Si `app/api/veille/decouper` ou `app/api/veille/structurer` deviennent
des dossiers vides après suppression, Next.js n'en a pas besoin — ils
disparaissent naturellement, rien à faire de plus.)

- [ ] **Step 2: Nettoyer `lib/veille/actions.ts`**

Retirer entièrement `demarrerUploadBomp` et `confirmerUploadBomp` (lignes
20-137 du fichier original — tout sauf `importerAvis`). Retirer aussi
les imports devenus inutiles en tête de fichier :
`import { randomUUID } from "crypto";` (n'était utilisé que par
`confirmerUploadBomp`), `import { demarrerUploadBompSchema,
confirmerUploadBompSchema } from "./schema";`, et
`import { mettreEnFileDecoupageBomp } from "./file-attente";`.

Le fichier final :

```typescript
// lib/veille/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";

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

- [ ] **Step 3: Nettoyer `lib/veille/schema.ts`**

Retirer `AvisStructureSchema`, `TAILLE_MAX_BOMP_OCTETS`,
`demarrerUploadBompSchema`, `confirmerUploadBompSchema`, et l'import
`import { TYPES_AVIS_AO_NATIONAL } from "./types";` (n'était utilisé que
par `AvisStructureSchema`). Le fichier devient vide de contenu utile —
**supprimer le fichier entièrement** plutôt que de le laisser vide :

```bash
git rm lib/veille/schema.ts
```

- [ ] **Step 4: Nettoyer `lib/veille/types.ts`**

Retirer `StatutTraitementBomp` (plus aucun pipeline n'a d'états
intermédiaires par avis). Garder `TYPES_AVIS_AO_NATIONAL`,
`TypeAvisAoNational`, `BompNumero` (toujours référencée tant que la
table `bomp_numero` existe, même si `listerBompNumeros` disparaît — voir
spec, « Ce qui est décommissionné », `bomp_numero` est explicitement
conservée pour son unique ligne historique) et `AvisAoNational`, plus les
ajouts de la Tâche 5 (`StatutExecutionVeille`, `VeilleExecution`).

- [ ] **Step 5: Nettoyer `lib/veille/queries.ts`**

Retirer `listerBompNumeros`. L'import en tête de fichier
`import type { AvisAoNational, BompNumero, VeilleExecution } from
"./types";` (ajouté en Tâche 5) devient
`import type { AvisAoNational, VeilleExecution } from "./types";` —
`BompNumero` n'est plus utilisé nulle part dans ce fichier une fois
`listerBompNumeros` retirée (le type reste exporté depuis `types.ts`,
juste plus importé ici). `obtenirUtilisateurEstSuperAdmin` et
`listerAvisNational`/`listerImportationsEntreprise` restent inchangées ;
`listerVeilleExecutions` (Tâche 5) reste.

- [ ] **Step 6: Vérifier qu'aucune référence morte ne subsiste**

Run: `grep -rn "listerBompNumeros\|StatutTraitementBomp\|demarrerUploadBomp\|confirmerUploadBomp\|AvisStructureSchema\|UploadBompForm" app lib --include="*.ts" --include="*.tsx"`
Expected: aucun résultat (la Tâche 7 réécrit `app/admin/veille/page.tsx`
qui référençait certains de ces noms — si cette commande trouve encore
des résultats à ce stade, c'est attendu tant que la Tâche 7 n'est pas
faite ; sinon investiguer).

- [ ] **Step 7: Vérifier la compilation (échecs attendus dans `app/admin/veille/page.tsx`, corrigés en Tâche 7)**

Run: `npx tsc --noEmit`
Expected: erreurs uniquement dans `app/admin/veille/page.tsx` et
`app/admin/veille/upload-bomp-form.tsx` (import cassé — normal, ce
fichier est réécrit en Tâche 7, ne pas s'en inquiéter ici). Si des
erreurs apparaissent ailleurs, les corriger avant de continuer.

- [ ] **Step 8: Commit**

```bash
git add -A lib/veille app/api/veille app/admin/veille
git commit -m "refactor: retire le pipeline BOMP (PDF + structuration IA)"
```

(`git add -A` sur ces trois répertoires capture aussi bien les
suppressions que les modifications — `app/admin/veille/page.tsx` reste
temporairement en erreur de compilation dans ce commit, corrigé au
commit suivant.)

---

### Task 7: Réécriture de l'écran admin « Veille — Supervision »

**Files:**
- Modify: `app/admin/veille/page.tsx`

**Interfaces:**
- Consumes: `listerVeilleExecutions` (Tâche 5), `obtenirUtilisateurEstSuperAdmin`
  (existant, inchangé).
- Produces: rien de consommé par une tâche ultérieure.

- [ ] **Step 1: Réécrire la page**

```typescript
// app/admin/veille/page.tsx
import { redirect } from "next/navigation";
import { obtenirUtilisateurEstSuperAdmin, listerVeilleExecutions } from "@/lib/veille/queries";

export const instant = false;

export default async function AdminVeillePage() {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) redirect("/bibliotheque");

  const executions = await listerVeilleExecutions();

  return (
    <div className="min-h-screen p-8 flex flex-col gap-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Veille — Administration</h1>
      <p className="text-sm text-muted-foreground">
        Synchronisation quotidienne automatique depuis marchespublics.ci — rien à déposer manuellement.
      </p>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Historique des exécutions</h2>
        {executions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune exécution pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2">Date</th>
                <th className="py-2">Statut</th>
                <th className="py-2">AO trouvés</th>
                <th className="py-2">Nouveaux AO</th>
                <th className="py-2">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-2">
                    {new Date(e.execute_le).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2">{e.statut}</td>
                  <td className="py-2">{e.nombre_ao_trouves ?? "—"}</td>
                  <td className="py-2">{e.nombre_nouveaux_ao ?? "—"}</td>
                  <td className="py-2">{e.erreur_message ?? "—"}</td>
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

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/admin/veille/page.tsx
git commit -m "feat(veille): écran admin affiche l'historique des synchronisations"
```

---

### Task 8: Traductions, déploiement de la schedule et vérification finale

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: rien.
- Produces: rien — dernière tâche du plan.

- [ ] **Step 1: Mettre à jour la description de la page client**

Dans `messages/fr.json`, clé `Veille.page.description` :

```json
"description": "Nouveaux avis publiés sur marchespublics.ci, à importer dans votre pipeline.",
```

Dans `messages/en.json`, clé équivalente :

```json
"description": "New notices published on marchespublics.ci, ready to import into your pipeline.",
```

- [ ] **Step 2: Vérifier la compilation TypeScript complète**

Run: `npx tsc --noEmit`
Expected: aucune erreur dans tout le projet.

- [ ] **Step 3: Lancer la suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests passent, y compris les 11 nouveaux tests de
`lib/veille/marches-publics.test.ts` et l'absence des tests supprimés en
Tâche 6.

- [ ] **Step 4: Déployer et enregistrer la schedule en production**

Une fois ce plan mergé sur `main` et déployé (déploiement automatique
Vercel, voir CLAUDE.md) :

```bash
npm run veille-marches-publics-schedule
```

Expected: `Schedule créée : <id>` (contre `APP_URL` de production —
inutile en local, `localhost` n'étant pas accessible depuis QStash, même
piège que `email-sync-schedule`, voir CLAUDE.md).

- [ ] **Step 5: Vérification manuelle en local**

Démarrer le serveur de dev (`npm run dev`). Naviguer vers `/veille` :
vérifier que les 46 avis BOMP existants (moins ceux déjà expirés)
s'affichent toujours normalement (filtres, recherche, import).

Déclencher manuellement une synchronisation pour vérifier le nouveau
pipeline de bout en bout sans attendre la schedule quotidienne — appeler
`recupererPageAppelOffres` + `extraireAvisDepuisHtml` depuis une session
`node`/`tsx` locale (le Route Handler exige une signature QStash valide,
non reproductible facilement en local ; c'est la logique **derrière**
l'endpoint qu'on vérifie ici, pas l'endpoint lui-même) :

```bash
npx tsx -e "
import { recupererPageAppelOffres, extraireAvisDepuisHtml, filtrerAvisEncoreOuverts } from './lib/veille/marches-publics';
recupererPageAppelOffres().then((html) => {
  const avis = extraireAvisDepuisHtml(html);
  const ouverts = filtrerAvisEncoreOuverts(avis, new Date());
  console.log('Avis extraits:', avis.length, '— encore ouverts:', ouverts.length);
  console.log(ouverts.slice(0, 3));
});
"
```

Expected: un nombre d'avis extraits proche de ~560 (taille de
l'échantillon inspecté pendant la spec), un nombre d'avis « encore
ouverts » nettement plus petit (le filtre par date exclut la majorité),
et les 3 premiers avis affichés ont des champs cohérents (référence,
type, objet, date limite au format `AAAA-MM-JJ`).

Naviguer vers `/admin/veille` (avec un compte `super_admin = true`) :
vérifier que la page se charge sans erreur et affiche « Aucune exécution
pour l'instant » (aucune synchronisation réelle n'a encore écrit dans
`veille_execution` à ce stade, seul le script de vérification manuelle
ci-dessus a tourné, sans toucher la base).

- [ ] **Step 6: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "docs: met à jour la description de l'écran veille pour la nouvelle source"
```
