# Tableau de bord pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire `/pipeline`, une page de tableau de bord listant tous les AO avec leur `statut_pipeline` (métier), filtrable par onglets, avec changement de statut en ligne et mise en avant des échéances proches.

**Architecture:** Une page Server Component charge la liste des AO (réutilise `listerAppelsOffres`, aucune nouvelle requête) ; un composant client (`PipelineTable`) gère le filtrage par onglets et affiche un `Select` par ligne pour changer `statut_pipeline` (nouvelle Server Action, aucune nouvelle politique RLS — celle du Module 3 couvre déjà toute la ligne). Pas de polling : `statut_pipeline` ne change jamais en arrière-plan.

**Tech Stack:** Next.js (Server + Client Components), Supabase (Postgres, RLS existante), next-intl, shadcn/ui (Table, Tabs, Select, Badge), TypeScript, Vitest.

## Global Constraints

- Pas d'assignation de responsable dans ce sous-projet — reporté à un futur module de gestion d'équipe.
- Pas de vue kanban / glisser-déposer — liste filtrable par onglets uniquement (mobile-first).
- Nouvelle page dédiée `/pipeline`, `/appels-offres` (Module 3) n'est pas modifié.
- Aucune nouvelle migration SQL — la politique RLS `update` sur `appel_offres` du Module 3 (sous-projet 4B) couvre déjà `statut_pipeline`.
- Aucune notification proactive de rappel d'échéance — badge visuel uniquement.
- `en_attente` n'a pas de token couleur dédié — réutilise `--status-identifie` (gris neutre).

---

### Task 1: Logique pure — mapping couleur de `statut_pipeline`

**Files:**
- Create: `lib/appels-offres/statut-pipeline.ts`
- Test: `lib/appels-offres/statut-pipeline.test.ts`

**Interfaces:**
- Consumes: `StatutPipelineAo` de `./types` (déjà créé au Module 3).
- Produces: `export type CouleurBadge = "identifie" | "preparation" | "soumis" | "gagne" | "perdu"`, `export function obtenirCouleurStatutPipeline(statut: StatutPipelineAo): CouleurBadge` — consommé par Task 5 (`StatutPipelineSelect`).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/appels-offres/statut-pipeline.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { obtenirCouleurStatutPipeline } from "./statut-pipeline";

describe("obtenirCouleurStatutPipeline", () => {
  it("retourne identifie pour identifie", () => {
    expect(obtenirCouleurStatutPipeline("identifie")).toBe("identifie");
  });

  it("retourne preparation pour en_preparation", () => {
    expect(obtenirCouleurStatutPipeline("en_preparation")).toBe("preparation");
  });

  it("retourne soumis pour soumis", () => {
    expect(obtenirCouleurStatutPipeline("soumis")).toBe("soumis");
  });

  it("retourne identifie pour en_attente (pas de token dédié)", () => {
    expect(obtenirCouleurStatutPipeline("en_attente")).toBe("identifie");
  });

  it("retourne gagne pour gagne", () => {
    expect(obtenirCouleurStatutPipeline("gagne")).toBe("gagne");
  });

  it("retourne perdu pour perdu", () => {
    expect(obtenirCouleurStatutPipeline("perdu")).toBe("perdu");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/statut-pipeline.test.ts`

Expected: FAIL — `./statut-pipeline` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/statut-pipeline.ts`**

```ts
import type { StatutPipelineAo } from "./types";

export type CouleurBadge = "identifie" | "preparation" | "soumis" | "gagne" | "perdu";

export function obtenirCouleurStatutPipeline(statut: StatutPipelineAo): CouleurBadge {
  switch (statut) {
    case "identifie":
      return "identifie";
    case "en_preparation":
      return "preparation";
    case "soumis":
      return "soumis";
    case "en_attente":
      return "identifie";
    case "gagne":
      return "gagne";
    case "perdu":
      return "perdu";
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/statut-pipeline.test.ts`

Expected: PASS, 6/6.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/statut-pipeline.ts lib/appels-offres/statut-pipeline.test.ts
git commit -m "feat(pipeline): mapping couleur de statut_pipeline"
```

---

### Task 2: Traductions et entrée barre latérale

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: rien (aucune dépendance sur un autre task de ce plan).
- Produces: namespace `Pipeline` (clés `page.*`, `table.*`, `badge.*`, `error.*`) et `Sidebar.pipeline` — consommés par Tasks 4-7. Entrée de navigation `/pipeline`.

- [ ] **Step 1: Ajouter les clés dans `messages/fr.json`**

Dans l'objet `"Sidebar"`, ajouter la clé `"pipeline"` :

```json
"Sidebar": {
  "bibliotheque": "Bibliothèque",
  "appelsOffres": "Appels d'offres",
  "pipeline": "Pipeline"
},
```

Après l'objet `"AppelsOffres"` (avant la fermeture de l'objet racine), ajouter le nouvel objet `"Pipeline"` :

```json
"Pipeline": {
  "page": {
    "titre": "Pipeline",
    "filAriane": "Pipeline"
  },
  "table": {
    "aucunAppelOffres": "Aucun appel d'offres pour l'instant.",
    "aucunResultat": "Aucun appel d'offres ne correspond à ce filtre.",
    "colonneTitre": "Titre",
    "colonneAcheteur": "Acheteur",
    "colonneStatut": "Statut",
    "colonneEcheance": "Échéance",
    "colonneMontantCaution": "Caution",
    "tabTous": "Tous",
    "toastStatutModifie": "Statut mis à jour"
  },
  "badge": {
    "identifie": "Identifié",
    "enPreparation": "En préparation",
    "soumis": "Soumis",
    "enAttente": "En attente",
    "gagne": "Gagné",
    "perdu": "Perdu",
    "echeanceExpireBientot": "Échéance proche",
    "echeanceASurveiller": "À surveiller",
    "echeanceValide": "Délai confortable"
  },
  "error": {
    "message": "Impossible de charger le pipeline.",
    "reessayer": "Réessayer"
  }
}
```

- [ ] **Step 2: Ajouter les clés équivalentes dans `messages/en.json`**

Dans l'objet `"Sidebar"` :

```json
"Sidebar": {
  "bibliotheque": "Library",
  "appelsOffres": "Tenders",
  "pipeline": "Pipeline"
},
```

Nouvel objet `"Pipeline"` :

```json
"Pipeline": {
  "page": {
    "titre": "Pipeline",
    "filAriane": "Pipeline"
  },
  "table": {
    "aucunAppelOffres": "No tenders yet.",
    "aucunResultat": "No tender matches this filter.",
    "colonneTitre": "Title",
    "colonneAcheteur": "Buyer",
    "colonneStatut": "Status",
    "colonneEcheance": "Deadline",
    "colonneMontantCaution": "Bond",
    "tabTous": "All",
    "toastStatutModifie": "Status updated"
  },
  "badge": {
    "identifie": "Identified",
    "enPreparation": "In preparation",
    "soumis": "Submitted",
    "enAttente": "Pending",
    "gagne": "Won",
    "perdu": "Lost",
    "echeanceExpireBientot": "Deadline approaching",
    "echeanceASurveiller": "To watch",
    "echeanceValide": "Comfortable timeline"
  },
  "error": {
    "message": "Could not load the pipeline.",
    "reessayer": "Retry"
  }
}
```

- [ ] **Step 3: Ajouter l'entrée de navigation dans `components/app-sidebar.tsx`**

Remplacer le contenu du fichier par :

```tsx
import Link from "next/link";
import { Library, FileSearch, Kanban } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

function IconMark() {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="NoubinAO"
      className="h-6 w-6"
    >
      <rect width="100" height="100" rx="22" fill="#1D4ED8" />
      <g transform="rotate(-45 50 50)">
        <polygon points="50,14 56,50 44,50" fill="#F8FAFC" />
        <polygon points="50,86 56,50 44,50" fill="#F59E0B" />
      </g>
      <circle cx="50" cy="50" r="4" fill="#FFFFFF" stroke="#1D4ED8" strokeWidth="1.5" />
    </svg>
  );
}

export async function AppSidebar() {
  const t = await getTranslations("Sidebar");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/bibliotheque"
          className="flex items-center justify-center p-2"
        >
          <IconMark />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("bibliotheque")}>
              <Link href="/bibliotheque">
                <Library />
                <span>{t("bibliotheque")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("appelsOffres")}>
              <Link href="/appels-offres">
                <FileSearch />
                <span>{t("appelsOffres")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("pipeline")}>
              <Link href="/pipeline">
                <Kanban />
                <span>{t("pipeline")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 5: Vérifier que les fichiers JSON sont valides**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf-8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf-8')); console.log('JSON valide')"`

Expected: affiche `JSON valide`, aucune erreur de parsing.

- [ ] **Step 6: Commit**

```bash
git add messages/fr.json messages/en.json components/app-sidebar.tsx
git commit -m "feat(pipeline): traductions et entrée barre latérale"
```

---

### Task 3: Backend — changement de statut pipeline

**Files:**
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `STATUTS_PIPELINE_AO`, `StatutPipelineAo` de `./types` (déjà créés au Module 3) ; `obtenirUtilisateurCourant` de `@/lib/utilisateur/queries` (déjà créé) ; politique RLS `update` sur `appel_offres` (déjà créée au Module 3, sous-projet 4B — couvre toute la ligne, aucune nouvelle migration).
- Produces: `schema.ts` : `export const modifierStatutPipelineSchema`. `actions.ts` : `export async function modifierStatutPipeline(appelOffresId: string, statutPipeline: StatutPipelineAo): Promise<{erreur: string} | {succes: true}>` — consommé par Task 5 (`StatutPipelineSelect`).

Pas de test automatisé — même convention que le reste de `lib/appels-offres/`.

- [ ] **Step 1: Ajouter `modifierStatutPipelineSchema` dans `lib/appels-offres/schema.ts`**

En haut du fichier, ajouter l'import (le fichier importe déjà depuis `zod` et `./normalisation/normaliser`) :

```ts
import { STATUTS_PIPELINE_AO } from "./types";
```

Ajouter à la fin du fichier :

```ts
export const modifierStatutPipelineSchema = z.object({
  statutPipeline: z.enum(STATUTS_PIPELINE_AO),
});
```

- [ ] **Step 2: Ajouter `modifierStatutPipeline` dans `lib/appels-offres/actions.ts`**

Modifier la ligne d'import existante :

```ts
import { televerserDaoSchema, modifierAppelOffresSchema } from "./schema";
```

en :

```ts
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
} from "./schema";
```

Modifier la ligne d'import de types existante :

```ts
import type { AppelOffres } from "./types";
```

en :

```ts
import type { AppelOffres, StatutPipelineAo } from "./types";
```

Ajouter à la fin du fichier :

```ts
export async function modifierStatutPipeline(
  appelOffresId: string,
  statutPipeline: StatutPipelineAo,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierStatutPipelineSchema.safeParse({ statutPipeline });

  if (!parsed.success) {
    return { erreur: "Statut invalide" };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("appel_offres")
    .update({ statut_pipeline: parsed.data.statutPipeline })
    .eq("id", appelOffresId);

  if (error) {
    return { erreur: "Échec de la mise à jour du statut. Réessayez." };
  }

  revalidatePath("/pipeline");
  return { succes: true as const };
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Vérifier que la suite de tests complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent, aucune régression.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/schema.ts lib/appels-offres/actions.ts
git commit -m "feat(pipeline): Server Action modifierStatutPipeline"
```

---

### Task 4: Composant `EcheanceBadge`

**Files:**
- Create: `app/(app)/pipeline/echeance-badge.tsx`

**Interfaces:**
- Consumes: `calculerStatutExpiration` de `@/lib/documents/expiration` (déjà créé au Module 2) ; namespace `Pipeline.badge` (Task 2).
- Produces: `export function EcheanceBadge({ dateLimite }: { dateLimite: string | null }): JSX.Element` — consommé par Task 6 (`PipelineTable`).

Pas de test automatisé (composant de présentation pure, la logique qu'il
utilise — `calculerStatutExpiration` — est déjà testée au Module 2).

- [ ] **Step 1: Créer `app/(app)/pipeline/echeance-badge.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { calculerStatutExpiration } from "@/lib/documents/expiration";

const STYLES = {
  rouge: "bg-destructive text-destructive-foreground border-transparent",
  orange: "bg-[hsl(var(--status-soumis))] text-slate-900 border-transparent",
  vert: "bg-[hsl(var(--status-gagne))] text-slate-900 border-transparent",
} as const;

export function EcheanceBadge({ dateLimite }: { dateLimite: string | null }) {
  const t = useTranslations("Pipeline.badge");
  const statut = calculerStatutExpiration(dateLimite);

  if (!statut) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  const labels = {
    rouge: t("echeanceExpireBientot"),
    orange: t("echeanceASurveiller"),
    vert: t("echeanceValide"),
  } as const;

  return (
    <Badge variant="outline" className={STYLES[statut]}>
      {labels[statut]}
    </Badge>
  );
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/pipeline/echeance-badge.tsx"
git commit -m "feat(pipeline): composant EcheanceBadge"
```

---

### Task 5: Composant `StatutPipelineSelect`

**Files:**
- Create: `app/(app)/pipeline/statut-pipeline-select.tsx`

**Interfaces:**
- Consumes: `modifierStatutPipeline` de `@/lib/appels-offres/actions` (Task 3) ; `obtenirCouleurStatutPipeline` de `@/lib/appels-offres/statut-pipeline` (Task 1) ; `STATUTS_PIPELINE_AO`, `StatutPipelineAo` de `@/lib/appels-offres/types` (déjà créés) ; namespace `Pipeline.badge`/`Pipeline.table` (Task 2).
- Produces: `export function StatutPipelineSelect({ appelOffresId, statutInitial }: { appelOffresId: string; statutInitial: StatutPipelineAo }): JSX.Element` — consommé par Task 6 (`PipelineTable`).

Le déclencheur (`SelectTrigger`) du menu est coloré selon le statut
courant via `obtenirCouleurStatutPipeline` — pas de composant badge séparé
(voir Task 4, qui ne construit que `EcheanceBadge` ; l'affichage coloré du
statut pipeline se fait ici, directement dans l'élément interactif qui
permet de le changer, plutôt qu'en double avec un badge statique inutilisé
ailleurs).

Pas de test automatisé (composant React interactif).

- [ ] **Step 1: Créer `app/(app)/pipeline/statut-pipeline-select.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { modifierStatutPipeline } from "@/lib/appels-offres/actions";
import { obtenirCouleurStatutPipeline } from "@/lib/appels-offres/statut-pipeline";
import { STATUTS_PIPELINE_AO, type StatutPipelineAo } from "@/lib/appels-offres/types";

const STYLES = {
  identifie: "bg-[hsl(var(--status-identifie))] text-slate-900",
  preparation: "bg-[hsl(var(--status-preparation))] text-white",
  soumis: "bg-[hsl(var(--status-soumis))] text-slate-900",
  gagne: "bg-[hsl(var(--status-gagne))] text-slate-900",
  perdu: "bg-[hsl(var(--status-perdu))] text-white",
} as const;

const CLES_LIBELLE: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
};

export function StatutPipelineSelect({
  appelOffresId,
  statutInitial,
}: {
  appelOffresId: string;
  statutInitial: StatutPipelineAo;
}) {
  const t = useTranslations("Pipeline");
  const [statut, setStatut] = useState(statutInitial);
  const [isPending, startTransition] = useTransition();

  function onValueChange(valeur: string) {
    const nouveauStatut = valeur as StatutPipelineAo;
    const precedent = statut;
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat = await modifierStatutPipeline(appelOffresId, nouveauStatut);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
        setStatut(precedent);
      } else {
        toast.success(t("table.toastStatutModifie"));
      }
    });
  }

  const couleur = obtenirCouleurStatutPipeline(statut);

  return (
    <Select value={statut} onValueChange={onValueChange} disabled={isPending}>
      <SelectTrigger className={`w-40 border-transparent ${STYLES[couleur]}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUTS_PIPELINE_AO.map((valeur) => (
          <SelectItem key={valeur} value={valeur}>
            {t(CLES_LIBELLE[valeur])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/pipeline/statut-pipeline-select.tsx"
git commit -m "feat(pipeline): composant StatutPipelineSelect"
```

---

### Task 6: Composant `PipelineTable`

**Files:**
- Create: `app/(app)/pipeline/pipeline-table.tsx`

**Interfaces:**
- Consumes: `StatutPipelineSelect` (Task 5) ; `EcheanceBadge` (Task 4) ; `STATUTS_PIPELINE_AO`, `AppelOffres`, `StatutPipelineAo` de `@/lib/appels-offres/types` (déjà créés) ; namespace `Pipeline.table`/`Pipeline.badge` (Task 2).
- Produces: `export function PipelineTable({ appelsOffres }: { appelsOffres: AppelOffres[] }): JSX.Element` — consommé par Task 7 (`page.tsx`).

Pas de test automatisé (composant React interactif, miroir du filtrage par
onglets déjà utilisé dans `document-table.tsx`).

- [ ] **Step 1: Créer `app/(app)/pipeline/pipeline-table.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatutPipelineSelect } from "./statut-pipeline-select";
import { EcheanceBadge } from "./echeance-badge";
import { STATUTS_PIPELINE_AO } from "@/lib/appels-offres/types";
import type { AppelOffres, StatutPipelineAo } from "@/lib/appels-offres/types";

const CLES_ONGLET: Record<StatutPipelineAo, string> = {
  identifie: "badge.identifie",
  en_preparation: "badge.enPreparation",
  soumis: "badge.soumis",
  en_attente: "badge.enAttente",
  gagne: "badge.gagne",
  perdu: "badge.perdu",
};

export function PipelineTable({ appelsOffres }: { appelsOffres: AppelOffres[] }) {
  const t = useTranslations("Pipeline");
  const [onglet, setOnglet] = useState<StatutPipelineAo | "tous">("tous");

  const onglets: { valeur: StatutPipelineAo | "tous"; libelle: string }[] = [
    { valeur: "tous", libelle: t("table.tabTous") },
    ...STATUTS_PIPELINE_AO.map((statut) => ({
      valeur: statut,
      libelle: t(CLES_ONGLET[statut]),
    })),
  ];

  const appelsOffresFiltres = useMemo(() => {
    if (onglet === "tous") return appelsOffres;
    return appelsOffres.filter((ao) => ao.statut_pipeline === onglet);
  }, [appelsOffres, onglet]);

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={onglet} onValueChange={(v) => setOnglet(v as StatutPipelineAo | "tous")}>
        <TabsList>
          {onglets.map((o) => (
            <TabsTrigger key={o.valeur} value={o.valeur}>
              {o.libelle}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {appelsOffres.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p>{t("table.aucunAppelOffres")}</p>
        </div>
      ) : appelsOffresFiltres.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("table.aucunResultat")}</p>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneTitre")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneStatut")}</TableHead>
              <TableHead>{t("table.colonneEcheance")}</TableHead>
              <TableHead>{t("table.colonneMontantCaution")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appelsOffresFiltres.map((ao) => (
              <TableRow key={ao.id}>
                <TableCell>
                  <Link
                    href={`/appels-offres/${ao.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {ao.titre ?? ao.fichier_dao_nom_original}
                  </Link>
                </TableCell>
                <TableCell>{ao.acheteur ?? "—"}</TableCell>
                <TableCell>
                  <StatutPipelineSelect appelOffresId={ao.id} statutInitial={ao.statut_pipeline} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>
                      {ao.date_limite
                        ? new Date(ao.date_limite).toLocaleDateString("fr-FR")
                        : "—"}
                    </span>
                    <EcheanceBadge dateLimite={ao.date_limite} />
                  </div>
                </TableCell>
                <TableCell>
                  {ao.montant_caution !== null
                    ? `${ao.montant_caution.toLocaleString("fr-FR")} FCFA`
                    : "—"}
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

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/pipeline/pipeline-table.tsx"
git commit -m "feat(pipeline): composant PipelineTable avec filtrage par onglets"
```

---

### Task 7: Page `/pipeline` (shell : page, chargement, erreur)

**Files:**
- Create: `app/(app)/pipeline/page.tsx`
- Create: `app/(app)/pipeline/loading.tsx`
- Create: `app/(app)/pipeline/error.tsx`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant` de `@/lib/utilisateur/queries` (déjà créé) ; `listerAppelsOffres` de `@/lib/appels-offres/queries` (déjà créé au Module 3) ; `PipelineTable` (Task 6) ; `AnnoncerFilAriane` de `@/components/annoncer-fil-ariane` (déjà créé) ; namespace `Pipeline.page`/`Pipeline.error` (Task 2).
- Produces: route `/pipeline` fonctionnelle — dernière pièce de ce sous-projet.

- [ ] **Step 1: Créer `app/(app)/pipeline/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerAppelsOffres } from "@/lib/appels-offres/queries";
import { PipelineTable } from "./pipeline-table";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function PipelinePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const appelsOffres = await listerAppelsOffres(utilisateur.entreprise_id);
  const t = await getTranslations("Pipeline.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <PipelineTable appelsOffres={appelsOffres} />
    </div>
  );
}
```

- [ ] **Step 2: Créer `app/(app)/pipeline/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementPipeline() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Créer `app/(app)/pipeline/error.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";

export default function ErreurPipeline({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const t = useTranslations("Pipeline.error");

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

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 5: Vérifier que la suite de tests complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent, aucune régression.

- [ ] **Step 6: Vérifier que le build de production réussit**

Run: `npm run build`

Expected: build réussi sans erreur — vérification importante étant donné
qu'une régression de build de production (`@napi-rs/canvas`/`pdfjs-dist`
via Turbopack) a déjà été rencontrée et corrigée juste avant ce
sous-projet ; confirmer qu'elle ne réapparaît pas.

- [ ] **Step 7: Vérification manuelle**

Lancer `npm run dev`, ouvrir `/pipeline` :
- La page se charge, l'entrée "Pipeline" apparaît dans la barre latérale.
- Chaque AO affiche son statut pipeline, son échéance (avec badge de
  proximité si `date_limite` est renseignée), son montant de caution.
- Changer le statut d'un AO via le `Select` : mise à jour visible
  immédiatement, toast de confirmation, persistance après rechargement de
  la page.
- Filtrer par onglet : seuls les AO du statut sélectionné s'affichent.

Documenter le résultat avant de considérer la tâche terminée. Si
l'environnement d'exécution ne peut pas atteindre le projet Supabase ou
authentifier un utilisateur (limitation déjà rencontrée lors de
sous-projets précédents), rapporter précisément ce qui a pu être vérifié
malgré tout (compilation, build, code) et ce qui reste bloqué, en
`DONE_WITH_CONCERNS` plutôt que `BLOCKED` pur.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/pipeline/page.tsx" "app/(app)/pipeline/loading.tsx" "app/(app)/pipeline/error.tsx"
git commit -m "feat(pipeline): page de tableau de bord pipeline"
```

---
