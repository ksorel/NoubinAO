# Page d'accueil / Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give NoubinAO a central home page (`/accueil`) showing KPI cards, a
pipeline-repartition chart, and two short actionable lists, reachable from a
new first sidebar entry and from the logo.

**Architecture:** One new pure aggregation module (`lib/accueil/kpi.ts`)
computes all KPIs/lists/chart data from data already fetched elsewhere
(`listerAppelsOffres`, `listerDocuments`, `listerNotifications`) — zero new
SQL. A server component page renders KPI cards and the two lists directly;
only the bar chart is a client component (recharts needs the browser).

**Tech Stack:** Next.js App Router (server component page), recharts +
shadcn `Chart` wrapper (new dependency), next-intl, existing
`calculerStatutEcheance`/`calculerStatutExpiration` modules, native
`Intl.RelativeTimeFormat` for relative dates (no new date library).

## Global Constraints

- Seuil échéance/expiration : réutiliser `calculerStatutEcheance`
  (`lib/appels-offres/echeance.ts`) et `calculerStatutExpiration`
  (`lib/documents/expiration.ts`) tels quels — seuil "rouge" à <30 jours.
  Aucun nouveau seuil.
- `aoEnCours` / `aoEcheanceProche` excluent les AO dont `statut_pipeline`
  ∈ {`gagne`, `perdu`, `sans_suite`}. Le graphique de répartition, lui,
  inclut TOUS les statuts (AO fermés compris).
- Zéro nouvelle requête SQL/Supabase : tout calcul dérive des listes déjà
  chargées par les fetches existants.
- `formaterMontant`/montants : non concerné, cette page n'affiche aucun
  montant.
- Copie i18n : `fr.json` complet et soigné, `en.json` à jour en parallèle
  (cohérent avec le reste du projet — pas de clé fr sans équivalent en).
- Français par défaut, TypeScript strict, pas de `any`.

---

### Task 1: Module d'agrégation `lib/accueil/kpi.ts`

**Files:**
- Create: `lib/accueil/kpi.ts`
- Test: `lib/accueil/kpi.test.ts`

**Interfaces:**
- Consumes: `AppelOffres`, `StatutPipelineAo`, `STATUTS_PIPELINE_AO` from
  `@/lib/appels-offres/types`; `Document` from `@/lib/documents/types`;
  `calculerStatutEcheance` from `@/lib/appels-offres/echeance`;
  `calculerStatutExpiration` from `@/lib/documents/expiration`.
- Produces (consumed by Task 4):
  - `STATUTS_PIPELINE_FERMES: readonly StatutPipelineAo[]`
  - `interface KpiAccueil { aoEnCours: number; aoEcheanceProche: number; documentsExpirant: number; notificationsNonLues: number; }`
  - `interface RepartitionStatut { statut: StatutPipelineAo; nombre: number; }`
  - `interface AoEcheanceProche { id: string; titre: string | null; fichierDaoNomOriginal: string | null; dateLimite: string; }`
  - `interface DocumentExpirant { id: string; nom: string; dateExpiration: string; }`
  - `calculerKpiAccueil(appelsOffres: AppelOffres[], documents: Document[], notificationsNonLues: number, maintenant?: Date): KpiAccueil`
  - `calculerRepartitionPipeline(appelsOffres: AppelOffres[]): RepartitionStatut[]`
  - `listerAoEcheanceProche(appelsOffres: AppelOffres[], maintenant?: Date, limite?: number): AoEcheanceProche[]`
  - `listerDocumentsExpirant(documents: Document[], maintenant?: Date, limite?: number): DocumentExpirant[]`
  - Consumed (also by Task 2): `calculerRepartitionPipeline`'s return order
    follows `STATUTS_PIPELINE_AO` enum order, only statuses present in the
    data appear (no zero-count entries).

- [ ] **Step 1: Write the failing tests**

Create `lib/accueil/kpi.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  calculerKpiAccueil,
  calculerRepartitionPipeline,
  listerAoEcheanceProche,
  listerDocumentsExpirant,
} from "./kpi";
import type { AppelOffres } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";

function creerAppelOffres(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "btp",
    date_limite: null,
    montant_caution: null,
    contact_retrait: null,
    statut_pipeline: "identifie",
    statut_traitement: "termine",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    modele_cv_path: null,
    modele_cv_nom_original: null,
    modele_cv_markdown: null,
    dao_markdown: null,
    sommaire_attendu: ["Offre technique", "Offre financière"],
    assigne_a: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "piece_administrative",
    nom: "RCCM K-Nowledge",
    fichier_path: "ent-1/documents/rccm.pdf",
    fichier_nom_original: "rccm.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: false,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

const AUJOURDHUI = new Date("2026-09-30T00:00:00Z");

describe("calculerKpiAccueil", () => {
  it("retourne des zéros sans AO/document", () => {
    const kpi = calculerKpiAccueil([], [], 0, AUJOURDHUI);
    expect(kpi).toEqual({
      aoEnCours: 0,
      aoEcheanceProche: 0,
      documentsExpirant: 0,
      notificationsNonLues: 0,
    });
  });

  it("exclut gagne/perdu/sans_suite du compte aoEnCours", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", statut_pipeline: "identifie" }),
      creerAppelOffres({ id: "ao-2", statut_pipeline: "gagne" }),
      creerAppelOffres({ id: "ao-3", statut_pipeline: "perdu" }),
      creerAppelOffres({ id: "ao-4", statut_pipeline: "sans_suite" }),
      creerAppelOffres({ id: "ao-5", statut_pipeline: "en_preparation" }),
    ];
    const kpi = calculerKpiAccueil(appelsOffres, [], 0, AUJOURDHUI);
    expect(kpi.aoEnCours).toBe(2);
  });

  it("compte aoEcheanceProche seulement parmi les AO en cours, rouge ou dépassée", () => {
    const appelsOffres = [
      // en cours, dépassée (< aujourd'hui)
      creerAppelOffres({ id: "ao-1", statut_pipeline: "identifie", date_limite: "2026-09-01" }),
      // en cours, rouge (< 30 jours)
      creerAppelOffres({ id: "ao-2", statut_pipeline: "en_preparation", date_limite: "2026-10-10" }),
      // en cours, orange (> 30 jours) — ne compte pas
      creerAppelOffres({ id: "ao-3", statut_pipeline: "soumis", date_limite: "2026-12-01" }),
      // gagné avec échéance dépassée — fermé, ne compte pas malgré la date
      creerAppelOffres({ id: "ao-4", statut_pipeline: "gagne", date_limite: "2026-09-01" }),
      // en cours, pas de date limite — ne compte pas
      creerAppelOffres({ id: "ao-5", statut_pipeline: "identifie", date_limite: null }),
    ];
    const kpi = calculerKpiAccueil(appelsOffres, [], 0, AUJOURDHUI);
    expect(kpi.aoEcheanceProche).toBe(2);
  });

  it("compte documentsExpirant seulement en statut rouge", () => {
    const documents = [
      creerDocument({ id: "doc-1", date_expiration: "2026-10-10" }), // rouge
      creerDocument({ id: "doc-2", date_expiration: "2026-12-25" }), // orange
      creerDocument({ id: "doc-3", date_expiration: null }), // pas de date, exclu
    ];
    const kpi = calculerKpiAccueil([], documents, 0, AUJOURDHUI);
    expect(kpi.documentsExpirant).toBe(1);
  });

  it("passe notificationsNonLues tel quel", () => {
    const kpi = calculerKpiAccueil([], [], 7, AUJOURDHUI);
    expect(kpi.notificationsNonLues).toBe(7);
  });
});

describe("calculerRepartitionPipeline", () => {
  it("retourne une liste vide sans AO", () => {
    expect(calculerRepartitionPipeline([])).toEqual([]);
  });

  it("regroupe tous les AO (y compris fermés) par statut, ordre de l'enum", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", statut_pipeline: "soumis" }),
      creerAppelOffres({ id: "ao-2", statut_pipeline: "identifie" }),
      creerAppelOffres({ id: "ao-3", statut_pipeline: "identifie" }),
      creerAppelOffres({ id: "ao-4", statut_pipeline: "gagne" }),
    ];
    expect(calculerRepartitionPipeline(appelsOffres)).toEqual([
      { statut: "identifie", nombre: 2 },
      { statut: "soumis", nombre: 1 },
      { statut: "gagne", nombre: 1 },
    ]);
  });

  it("n'inclut pas de statut absent des données", () => {
    const appelsOffres = [creerAppelOffres({ id: "ao-1", statut_pipeline: "identifie" })];
    const repartition = calculerRepartitionPipeline(appelsOffres);
    expect(repartition).toHaveLength(1);
    expect(repartition.find((r) => r.statut === "en_preparation")).toBeUndefined();
  });
});

describe("listerAoEcheanceProche", () => {
  it("retourne une liste vide sans AO éligible", () => {
    expect(listerAoEcheanceProche([], AUJOURDHUI)).toEqual([]);
  });

  it("trie par date limite croissante (le plus urgent d'abord)", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", titre: "B", date_limite: "2026-10-15" }),
      creerAppelOffres({ id: "ao-2", titre: "A", date_limite: "2026-09-25" }),
    ];
    const resultat = listerAoEcheanceProche(appelsOffres, AUJOURDHUI);
    expect(resultat.map((r) => r.id)).toEqual(["ao-2", "ao-1"]);
  });

  it("tronque à la limite fournie", () => {
    const appelsOffres = Array.from({ length: 8 }, (_, i) =>
      creerAppelOffres({ id: `ao-${i}`, date_limite: "2026-10-10" }),
    );
    expect(listerAoEcheanceProche(appelsOffres, AUJOURDHUI, 5)).toHaveLength(5);
  });

  it("exclut les AO fermés et ceux hors seuil rouge/dépassée", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", statut_pipeline: "gagne", date_limite: "2026-10-01" }),
      creerAppelOffres({ id: "ao-2", statut_pipeline: "identifie", date_limite: "2026-12-25" }),
    ];
    expect(listerAoEcheanceProche(appelsOffres, AUJOURDHUI)).toEqual([]);
  });

  it("inclut fichierDaoNomOriginal pour le fallback d'affichage", () => {
    const appelsOffres = [
      creerAppelOffres({
        id: "ao-1",
        titre: null,
        fichier_dao_nom_original: "dao-lot-3.pdf",
        date_limite: "2026-10-01",
      }),
    ];
    expect(listerAoEcheanceProche(appelsOffres, AUJOURDHUI)).toEqual([
      { id: "ao-1", titre: null, fichierDaoNomOriginal: "dao-lot-3.pdf", dateLimite: "2026-10-01" },
    ]);
  });
});

describe("listerDocumentsExpirant", () => {
  it("retourne une liste vide sans document éligible", () => {
    expect(listerDocumentsExpirant([], AUJOURDHUI)).toEqual([]);
  });

  it("trie par date d'expiration croissante", () => {
    const documents = [
      creerDocument({ id: "doc-1", nom: "B", date_expiration: "2026-10-15" }),
      creerDocument({ id: "doc-2", nom: "A", date_expiration: "2026-09-25" }),
    ];
    const resultat = listerDocumentsExpirant(documents, AUJOURDHUI);
    expect(resultat.map((r) => r.id)).toEqual(["doc-2", "doc-1"]);
  });

  it("tronque à la limite fournie", () => {
    const documents = Array.from({ length: 8 }, (_, i) =>
      creerDocument({ id: `doc-${i}`, date_expiration: "2026-10-10" }),
    );
    expect(listerDocumentsExpirant(documents, AUJOURDHUI, 5)).toHaveLength(5);
  });

  it("exclut les documents sans date d'expiration ou hors seuil rouge", () => {
    const documents = [
      creerDocument({ id: "doc-1", date_expiration: null }),
      creerDocument({ id: "doc-2", date_expiration: "2026-12-25" }),
    ];
    expect(listerDocumentsExpirant(documents, AUJOURDHUI)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/accueil/kpi.test.ts`
Expected: FAIL with "Cannot find module './kpi'" (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/accueil/kpi.ts`:

```typescript
import { STATUTS_PIPELINE_AO } from "@/lib/appels-offres/types";
import type { AppelOffres, StatutPipelineAo } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";
import { calculerStatutEcheance } from "@/lib/appels-offres/echeance";
import { calculerStatutExpiration } from "@/lib/documents/expiration";

export const STATUTS_PIPELINE_FERMES: readonly StatutPipelineAo[] = [
  "gagne",
  "perdu",
  "sans_suite",
];

export interface KpiAccueil {
  aoEnCours: number;
  aoEcheanceProche: number;
  documentsExpirant: number;
  notificationsNonLues: number;
}

export interface RepartitionStatut {
  statut: StatutPipelineAo;
  nombre: number;
}

export interface AoEcheanceProche {
  id: string;
  titre: string | null;
  fichierDaoNomOriginal: string | null;
  dateLimite: string;
}

export interface DocumentExpirant {
  id: string;
  nom: string;
  dateExpiration: string;
}

function estAoEnCours(ao: AppelOffres): boolean {
  return !STATUTS_PIPELINE_FERMES.includes(ao.statut_pipeline);
}

function estEcheanceProche(ao: AppelOffres, maintenant: Date): boolean {
  const statut = calculerStatutEcheance(ao.date_limite, maintenant);
  return statut === "rouge" || statut === "depassee";
}

export function calculerKpiAccueil(
  appelsOffres: AppelOffres[],
  documents: Document[],
  notificationsNonLues: number,
  maintenant: Date = new Date(),
): KpiAccueil {
  const aoEnCours = appelsOffres.filter(estAoEnCours);
  const aoEcheanceProche = aoEnCours.filter((ao) => estEcheanceProche(ao, maintenant)).length;
  const documentsExpirant = documents.filter(
    (doc) => calculerStatutExpiration(doc.date_expiration, maintenant) === "rouge",
  ).length;

  return {
    aoEnCours: aoEnCours.length,
    aoEcheanceProche,
    documentsExpirant,
    notificationsNonLues,
  };
}

export function calculerRepartitionPipeline(appelsOffres: AppelOffres[]): RepartitionStatut[] {
  const compteurs = new Map<StatutPipelineAo, number>();
  for (const ao of appelsOffres) {
    compteurs.set(ao.statut_pipeline, (compteurs.get(ao.statut_pipeline) ?? 0) + 1);
  }
  return STATUTS_PIPELINE_AO.filter((statut) => compteurs.has(statut)).map((statut) => ({
    statut,
    nombre: compteurs.get(statut) as number,
  }));
}

export function listerAoEcheanceProche(
  appelsOffres: AppelOffres[],
  maintenant: Date = new Date(),
  limite = 5,
): AoEcheanceProche[] {
  return appelsOffres
    .filter(estAoEnCours)
    .filter((ao) => estEcheanceProche(ao, maintenant))
    .sort((a, b) => ((a.date_limite as string) < (b.date_limite as string) ? -1 : 1))
    .slice(0, limite)
    .map((ao) => ({
      id: ao.id,
      titre: ao.titre,
      fichierDaoNomOriginal: ao.fichier_dao_nom_original,
      dateLimite: ao.date_limite as string,
    }));
}

export function listerDocumentsExpirant(
  documents: Document[],
  maintenant: Date = new Date(),
  limite = 5,
): DocumentExpirant[] {
  return documents
    .filter((doc) => calculerStatutExpiration(doc.date_expiration, maintenant) === "rouge")
    .sort((a, b) => ((a.date_expiration as string) < (b.date_expiration as string) ? -1 : 1))
    .slice(0, limite)
    .map((doc) => ({
      id: doc.id,
      nom: doc.nom,
      dateExpiration: doc.date_expiration as string,
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/accueil/kpi.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/accueil/kpi.ts lib/accueil/kpi.test.ts
git commit -m "feat(accueil): module d'agrégation des KPI dashboard"
```

---

### Task 2: Graphique de répartition pipeline (recharts + shadcn Chart)

**Files:**
- Modify: `package.json` (nouvelle dépendance `recharts`, via `npx shadcn@latest add chart`)
- Create: `components/ui/chart.tsx` (généré par la commande shadcn ci-dessous)
- Create: `components/accueil/repartition-pipeline-chart.tsx`

**Interfaces:**
- Consumes: `RepartitionStatut`, `StatutPipelineAo` from `@/lib/accueil/kpi`
  and `@/lib/appels-offres/types` (Task 1).
- Produces (consumed by Task 4): `RepartitionPipelineChart({ repartition }: { repartition: RepartitionStatut[] }): JSX.Element` — default export not used, named export.

- [ ] **Step 1: Install the shadcn Chart component**

Run: `npx shadcn@latest add chart -y`

This adds the `recharts` dependency to `package.json` and creates
`components/ui/chart.tsx` (the shadcn `ChartContainer`/`ChartTooltip`
wrapper around recharts). No test for this generated file — it is
third-party scaffold, consistent with how `popover.tsx` and other shadcn
components were added in this project without their own tests.

- [ ] **Step 2: Verify the install**

Run: `grep -n "\"recharts\"" package.json`
Expected: a line showing the `recharts` dependency version.

Run: `ls components/ui/chart.tsx`
Expected: file exists.

- [ ] **Step 3: Write the chart component**

Create `components/accueil/repartition-pipeline-chart.tsx`:

```typescript
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { useTranslations } from "next-intl";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { StatutPipelineAo } from "@/lib/appels-offres/types";
import type { RepartitionStatut } from "@/lib/accueil/kpi";

const CLES_BADGE: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
  sans_suite: "badge.sansSuite",
};

// Même mapping couleur que obtenirCouleurStatutPipeline
// (lib/appels-offres/statut-pipeline.ts) : en_attente et sans_suite
// partagent la couleur "identifie", aucune variable --status-* dédiée
// n'existe pour ces deux statuts.
const COULEURS_STATUT: Record<StatutPipelineAo, string> = {
  identifie: "hsl(var(--status-identifie))",
  en_preparation: "hsl(var(--status-preparation))",
  soumis: "hsl(var(--status-soumis))",
  en_attente: "hsl(var(--status-identifie))",
  gagne: "hsl(var(--status-gagne))",
  perdu: "hsl(var(--status-perdu))",
  sans_suite: "hsl(var(--status-identifie))",
};

export function RepartitionPipelineChart({
  repartition,
}: {
  repartition: RepartitionStatut[];
}) {
  const t = useTranslations("Pipeline");
  const tAccueil = useTranslations("Accueil");

  const donnees = repartition.map((entree) => ({
    statut: entree.statut,
    libelle: t(CLES_BADGE[entree.statut]),
    nombre: entree.nombre,
    fill: COULEURS_STATUT[entree.statut],
  }));

  const config: ChartConfig = Object.fromEntries(
    repartition.map((entree) => [
      entree.statut,
      { label: t(CLES_BADGE[entree.statut]), color: COULEURS_STATUT[entree.statut] },
    ]),
  );

  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={donnees} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="libelle"
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="nombre" radius={4} name={tAccueil("graphiqueSerieNom")} />
      </BarChart>
    </ChartContainer>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (the `Accueil` i18n namespace and
`ui/chart.tsx` file both already exist at this point — namespace created
in Task 3, but `tAccueil("graphiqueSerieNom")` only needs the key to exist
at runtime, not at type-check time, since next-intl types aren't strict
per-key in this project — confirm by checking there is no new `tsc` error
referencing this file specifically).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json components/ui/chart.tsx components/accueil/repartition-pipeline-chart.tsx
git commit -m "feat(accueil): graphique de répartition pipeline (recharts)"
```

---

### Task 3: i18n et navigation (sidebar + logo)

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: none from other tasks.
- Produces (consumed by Task 2 and Task 4): i18n namespace `Accueil` with
  keys `page.filAriane`, `page.titre`, `page.description`,
  `kpiAoEnCours`, `kpiAoEcheanceProche`, `kpiDocumentsExpirant`,
  `kpiNotificationsNonLues`, `graphiqueTitre`, `graphiqueSerieNom`,
  `aucunAo`, `listeEcheanceTitre`, `aucunAoEcheanceProche`,
  `listeDocumentsTitre`, `aucunDocumentExpirant`, `echeanceLabel`,
  `error.message`, `error.reessayer`. Also `Sidebar.accueil` key.

- [ ] **Step 1: Add the `Sidebar.accueil` key**

In `messages/fr.json`, modify the `Sidebar` block (starts at line 82):

```json
  "Sidebar": {
    "accueil": "Accueil",
    "bibliotheque": "Bibliothèque",
    "appelsOffres": "Appels d'offres",
    "veille": "Veille",
    "pipeline": "Pipeline",
    "reglages": "Réglages"
  },
```

In `messages/en.json`, modify the same block:

```json
  "Sidebar": {
    "accueil": "Home",
    "bibliotheque": "Library",
    "appelsOffres": "Tenders",
    "veille": "Watch",
    "pipeline": "Pipeline",
    "reglages": "Settings"
  },
```

- [ ] **Step 2: Add the `Accueil` namespace**

In `messages/fr.json`, insert a new top-level block immediately after the
`Sidebar` block (after its closing `},` and before `"Bibliotheque": {`):

```json
  "Accueil": {
    "page": {
      "filAriane": "Accueil",
      "titre": "Tableau de bord",
      "description": "Vue d'ensemble de vos appels d'offres, documents et notifications."
    },
    "kpiAoEnCours": "AO en cours",
    "kpiAoEcheanceProche": "Échéance proche",
    "kpiDocumentsExpirant": "Documents expirant",
    "kpiNotificationsNonLues": "Notifications non lues",
    "graphiqueTitre": "Répartition par statut",
    "graphiqueSerieNom": "Nombre d'AO",
    "aucunAo": "Aucun appel d'offres pour le moment.",
    "listeEcheanceTitre": "AO à échéance proche",
    "aucunAoEcheanceProche": "Aucun AO à échéance proche pour l'instant.",
    "listeDocumentsTitre": "Documents expirant bientôt",
    "aucunDocumentExpirant": "Aucun document expirant pour l'instant.",
    "echeanceLabel": "Échéance : {relatif}",
    "error": {
      "message": "Impossible de charger le tableau de bord.",
      "reessayer": "Réessayer"
    }
  },
```

In `messages/en.json`, insert the matching block in the same position:

```json
  "Accueil": {
    "page": {
      "filAriane": "Home",
      "titre": "Dashboard",
      "description": "Overview of your tenders, documents and notifications."
    },
    "kpiAoEnCours": "Tenders in progress",
    "kpiAoEcheanceProche": "Upcoming deadline",
    "kpiDocumentsExpirant": "Expiring documents",
    "kpiNotificationsNonLues": "Unread notifications",
    "graphiqueTitre": "Breakdown by status",
    "graphiqueSerieNom": "Number of tenders",
    "aucunAo": "No tender yet.",
    "listeEcheanceTitre": "Tenders with an upcoming deadline",
    "aucunAoEcheanceProche": "No tender with an upcoming deadline right now.",
    "listeDocumentsTitre": "Documents expiring soon",
    "aucunDocumentExpirant": "No document expiring right now.",
    "echeanceLabel": "Deadline: {relatif}",
    "error": {
      "message": "Could not load the dashboard.",
      "reessayer": "Try again"
    }
  },
```

- [ ] **Step 3: Verify the JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('valid')"`
Expected: prints `valid` with no error.

- [ ] **Step 4: Update the sidebar**

Modify `components/app-sidebar.tsx`. Change the import line (line 2):

```typescript
import { Home, Library, FileSearch, Radar, Kanban, Settings } from "lucide-react";
```

Change the logo link (line 39):

```typescript
        <Link href="/accueil" className="flex items-center gap-2 p-2">
```

Add a new `SidebarMenuItem` as the first item inside `<SidebarMenu>`, right
after the opening tag (before the existing "Bibliothèque" item at line 49):

```typescript
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("accueil")}>
              <Link href="/accueil">
                <Home />
                <span>{t("accueil")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
```

- [ ] **Step 5: Commit**

```bash
git add messages/fr.json messages/en.json components/app-sidebar.tsx
git commit -m "feat(accueil): navigation vers la nouvelle page d'accueil"
```

---

### Task 4: Page `/accueil`

**Files:**
- Create: `app/(app)/accueil/page.tsx`
- Create: `app/(app)/accueil/loading.tsx`
- Create: `app/(app)/accueil/error.tsx`

**Interfaces:**
- Consumes: `calculerKpiAccueil`, `calculerRepartitionPipeline`,
  `listerAoEcheanceProche`, `listerDocumentsExpirant` and their types from
  `@/lib/accueil/kpi` (Task 1); `RepartitionPipelineChart` from
  `@/components/accueil/repartition-pipeline-chart` (Task 2); i18n
  namespace `Accueil` (Task 3); `obtenirUtilisateurCourant` from
  `@/lib/utilisateur/queries`; `listerAppelsOffres` from
  `@/lib/appels-offres/queries`; `listerDocuments` from
  `@/lib/documents/queries`; `listerNotifications` from
  `@/lib/notifications/actions`; `getUserLocale` from `@/i18n/locale`;
  `AnnoncerFilAriane` from `@/components/annoncer-fil-ariane`; `Card`,
  `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`;
  `Skeleton` from `@/components/ui/skeleton`.
- Produces: nothing consumed by other tasks — this is the integration
  point.

- [ ] **Step 1: Write the page**

Create `app/(app)/accueil/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerAppelsOffres } from "@/lib/appels-offres/queries";
import { listerDocuments } from "@/lib/documents/queries";
import { listerNotifications } from "@/lib/notifications/actions";
import { getUserLocale } from "@/i18n/locale";
import {
  calculerKpiAccueil,
  calculerRepartitionPipeline,
  listerAoEcheanceProche,
  listerDocumentsExpirant,
} from "@/lib/accueil/kpi";
import { RepartitionPipelineChart } from "@/components/accueil/repartition-pipeline-chart";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function formaterEcheanceRelative(dateIso: string, locale: string): string {
  const jours = Math.ceil(
    (new Date(dateIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
  const formateur = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  return formateur.format(jours, "day");
}

export default async function AccueilPage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const [appelsOffres, documents, { nonLues }, locale] = await Promise.all([
    listerAppelsOffres(utilisateur.entreprise_id),
    listerDocuments(utilisateur.entreprise_id),
    listerNotifications(),
    getUserLocale(),
  ]);

  const kpi = calculerKpiAccueil(appelsOffres, documents, nonLues);
  const repartition = calculerRepartitionPipeline(appelsOffres);
  const aoEcheanceProche = listerAoEcheanceProche(appelsOffres);
  const documentsExpirant = listerDocumentsExpirant(documents);

  const t = await getTranslations("Accueil");

  const cartes = [
    { libelle: t("kpiAoEnCours"), valeur: kpi.aoEnCours, href: "/pipeline" },
    { libelle: t("kpiAoEcheanceProche"), valeur: kpi.aoEcheanceProche, href: "/pipeline" },
    { libelle: t("kpiDocumentsExpirant"), valeur: kpi.documentsExpirant, href: "/bibliotheque" },
    { libelle: t("kpiNotificationsNonLues"), valeur: kpi.notificationsNonLues, href: "/veille" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("page.filAriane") }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("page.titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.description")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cartes.map((carte) => (
          <Link key={carte.libelle} href={carte.href}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {carte.libelle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{carte.valeur}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("graphiqueTitre")}</CardTitle>
        </CardHeader>
        <CardContent>
          {repartition.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucunAo")}</p>
          ) : (
            <RepartitionPipelineChart repartition={repartition} />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("listeEcheanceTitre")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {aoEcheanceProche.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucunAoEcheanceProche")}</p>
            ) : (
              aoEcheanceProche.map((ao) => (
                <Link
                  key={ao.id}
                  href={`/appels-offres/${ao.id}`}
                  className="flex flex-col gap-0.5 rounded-md border p-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">
                    {ao.titre ?? ao.fichierDaoNomOriginal}
                  </span>
                  <span className="text-muted-foreground">
                    {t("echeanceLabel", {
                      relatif: formaterEcheanceRelative(ao.dateLimite, locale),
                    })}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("listeDocumentsTitre")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {documentsExpirant.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("aucunDocumentExpirant")}</p>
            ) : (
              documentsExpirant.map((doc) => (
                <Link
                  key={doc.id}
                  href="/bibliotheque"
                  className="flex flex-col gap-0.5 rounded-md border p-2 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{doc.nom}</span>
                  <span className="text-muted-foreground">
                    {t("echeanceLabel", {
                      relatif: formaterEcheanceRelative(doc.dateExpiration, locale),
                    })}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the loading skeleton**

Create `app/(app)/accueil/loading.tsx`:

```typescript
import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementAccueil() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the error boundary**

Create `app/(app)/accueil/error.tsx`:

```typescript
"use client";

import { useTranslations } from "next-intl";

export default function ErreurAccueil({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const t = useTranslations("Accueil.error");

  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-muted-foreground">{t("message")}</p>
      <button
        onClick={reset}
        className="text-sm font-medium text-primary underline underline-offset-4"
      >
        {t("reessayer")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (no test targets `page.tsx` directly — consistent
with the rest of the app, server-component pages aren't unit tested; the
logic they call, `lib/accueil/kpi.ts`, is already covered by Task 1).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/accueil/page.tsx" "app/(app)/accueil/loading.tsx" "app/(app)/accueil/error.tsx"
git commit -m "feat(accueil): page tableau de bord"
```
