# Upload et liste de suivi DAO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la première UI du Module 3 : une page `/appels-offres` permettant d'uploader un DAO (réutilise `televerserDao` déjà construit) et de suivre son traitement en temps quasi réel par polling, avec suppression d'un AO.

**Architecture:** Une page Server Component (`page.tsx`) charge la liste initiale côté serveur ; un composant client (`AppelOffresTable`) affiche le tableau, gère le polling (toutes les 4s tant qu'un AO n'est pas stabilisé) et la suppression. Deux fonctions pures nouvelles (mapping de statut, condition d'arrêt du polling) sont testées séparément de l'UI. Backend complété : `lib/appels-offres/queries.ts` (nouveau) et deux nouvelles fonctions dans `lib/appels-offres/actions.ts`.

**Tech Stack:** Next.js (Server Components + Client Components), Supabase, next-intl, shadcn/ui (Table, Dialog, Badge, AlertDialog, Tooltip, Skeleton), TypeScript, Vitest.

## Global Constraints

- Périmètre strictement limité au suivi du `statut_traitement` (technique) — pas de tableau de bord `statut_pipeline` (métier), qui reste pour le Module 5.
- Pas de politique RLS `update` dans ce sous-projet — aucune écriture sous session utilisateur autre qu'upload (`insert`, déjà couvert) et suppression (`delete`, déjà couvert).
- Suivi de progression par polling côté client, pas de Supabase Realtime.
- Suppression d'un AO incluse dans ce sous-projet (miroir de `supprimerDocument`).
- Français complet et soigné en priorité dans les traductions ; anglais fonctionnel mais peut être moins poli.
- Pas de page de détail/revue des exigences extraites, pas d'édition manuelle — sous-projet B séparé.

---

### Task 1: Logique pure — statut de traitement et condition d'arrêt du polling

**Files:**
- Create: `lib/appels-offres/statut-traitement.ts`
- Test: `lib/appels-offres/statut-traitement.test.ts`
- Create: `lib/appels-offres/polling.ts`
- Test: `lib/appels-offres/polling.test.ts`

**Interfaces:**
- Consumes: `StatutTraitementAo`, `AppelOffres` de `./types` (déjà créés au sous-projet 1 du Module 3).
- Produces:
  - `export type CouleurStatutTraitement = "identifie" | "preparation" | "gagne" | "perdu"`, `export type IconeStatutTraitement = "horloge" | "chargement" | "coche" | "alerte"`, `export interface ConfigStatutTraitement { couleur: CouleurStatutTraitement; icone: IconeStatutTraitement; cleLibelle: string }`, `export function obtenirConfigStatutTraitement(statut: StatutTraitementAo): ConfigStatutTraitement` — consommé par Task 4 (`StatutTraitementBadge`).
  - `export function tousLesAoStabilises(appelsOffres: AppelOffres[]): boolean` — consommé par Task 6 (`AppelOffresTable`).

- [ ] **Step 1: Écrire le test de `obtenirConfigStatutTraitement` qui échoue**

Créer `lib/appels-offres/statut-traitement.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { obtenirConfigStatutTraitement } from "./statut-traitement";

describe("obtenirConfigStatutTraitement", () => {
  it("retourne la config pour en_attente", () => {
    expect(obtenirConfigStatutTraitement("en_attente")).toEqual({
      couleur: "identifie",
      icone: "horloge",
      cleLibelle: "badge.enAttente",
    });
  });

  it("retourne la config pour normalisation", () => {
    expect(obtenirConfigStatutTraitement("normalisation")).toEqual({
      couleur: "preparation",
      icone: "chargement",
      cleLibelle: "badge.normalisationEnCours",
    });
  });

  it("retourne la config pour extraction", () => {
    expect(obtenirConfigStatutTraitement("extraction")).toEqual({
      couleur: "preparation",
      icone: "chargement",
      cleLibelle: "badge.extractionEnCours",
    });
  });

  it("retourne la config pour termine", () => {
    expect(obtenirConfigStatutTraitement("termine")).toEqual({
      couleur: "gagne",
      icone: "coche",
      cleLibelle: "badge.termine",
    });
  });

  it("retourne la config pour erreur", () => {
    expect(obtenirConfigStatutTraitement("erreur")).toEqual({
      couleur: "perdu",
      icone: "alerte",
      cleLibelle: "badge.erreur",
    });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/statut-traitement.test.ts`

Expected: FAIL — `./statut-traitement` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/statut-traitement.ts`**

```ts
import type { StatutTraitementAo } from "./types";

export type CouleurStatutTraitement = "identifie" | "preparation" | "gagne" | "perdu";
export type IconeStatutTraitement = "horloge" | "chargement" | "coche" | "alerte";

export interface ConfigStatutTraitement {
  couleur: CouleurStatutTraitement;
  icone: IconeStatutTraitement;
  cleLibelle: string;
}

export function obtenirConfigStatutTraitement(
  statut: StatutTraitementAo,
): ConfigStatutTraitement {
  switch (statut) {
    case "en_attente":
      return { couleur: "identifie", icone: "horloge", cleLibelle: "badge.enAttente" };
    case "normalisation":
      return {
        couleur: "preparation",
        icone: "chargement",
        cleLibelle: "badge.normalisationEnCours",
      };
    case "extraction":
      return {
        couleur: "preparation",
        icone: "chargement",
        cleLibelle: "badge.extractionEnCours",
      };
    case "termine":
      return { couleur: "gagne", icone: "coche", cleLibelle: "badge.termine" };
    case "erreur":
      return { couleur: "perdu", icone: "alerte", cleLibelle: "badge.erreur" };
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/statut-traitement.test.ts`

Expected: PASS, 5/5.

- [ ] **Step 5: Écrire le test de `tousLesAoStabilises` qui échoue**

Créer `lib/appels-offres/polling.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { tousLesAoStabilises } from "./polling";
import type { AppelOffres, StatutTraitementAo } from "./types";

function creerAppelOffres(statutTraitement: StatutTraitementAo): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: null,
    acheteur: null,
    secteur: null,
    date_limite: null,
    montant_caution: null,
    statut_pipeline: "identifie",
    statut_traitement: statutTraitement,
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    dao_markdown: null,
    sommaire_attendu: null,
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00.000Z",
  };
}

describe("tousLesAoStabilises", () => {
  it("retourne true pour une liste vide", () => {
    expect(tousLesAoStabilises([])).toBe(true);
  });

  it("retourne false si au moins un AO est en_attente", () => {
    expect(tousLesAoStabilises([creerAppelOffres("en_attente")])).toBe(false);
  });

  it("retourne false si au moins un AO est en normalisation", () => {
    expect(
      tousLesAoStabilises([creerAppelOffres("normalisation"), creerAppelOffres("termine")]),
    ).toBe(false);
  });

  it("retourne false si au moins un AO est en extraction", () => {
    expect(tousLesAoStabilises([creerAppelOffres("extraction")])).toBe(false);
  });

  it("retourne true si tous les AO sont termine ou erreur", () => {
    expect(
      tousLesAoStabilises([creerAppelOffres("termine"), creerAppelOffres("erreur")]),
    ).toBe(true);
  });
});
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/polling.test.ts`

Expected: FAIL — `./polling` n'existe pas encore.

- [ ] **Step 7: Créer `lib/appels-offres/polling.ts`**

```ts
import type { AppelOffres, StatutTraitementAo } from "./types";

const STATUTS_EN_COURS: StatutTraitementAo[] = ["en_attente", "normalisation", "extraction"];

export function tousLesAoStabilises(appelsOffres: AppelOffres[]): boolean {
  return appelsOffres.every((ao) => !STATUTS_EN_COURS.includes(ao.statut_traitement));
}
```

- [ ] **Step 8: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/polling.test.ts`

Expected: PASS, 5/5.

- [ ] **Step 9: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 10: Commit**

```bash
git add lib/appels-offres/statut-traitement.ts lib/appels-offres/statut-traitement.test.ts lib/appels-offres/polling.ts lib/appels-offres/polling.test.ts
git commit -m "feat(appels-offres): logique pure statut de traitement et polling"
```

---

### Task 2: Traductions et entrée barre latérale

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`
- Modify: `components/app-sidebar.tsx`

**Interfaces:**
- Consumes: rien (aucune dépendance sur un autre task de ce plan).
- Produces: namespace `AppelsOffres` (clés `page.*`, `table.*`, `badge.*`, `dialog.*`, `error.*`) et `Sidebar.appelsOffres` dans les deux fichiers de traduction — consommés par Tasks 4-7. Entrée de navigation `/appels-offres` dans la barre latérale.

- [ ] **Step 1: Ajouter les clés dans `messages/fr.json`**

Dans l'objet `"Sidebar"`, ajouter la clé `"appelsOffres"` :

```json
"Sidebar": {
  "bibliotheque": "Bibliothèque",
  "appelsOffres": "Appels d'offres"
},
```

Après l'objet `"Bibliotheque"` (avant la fermeture de l'objet racine), ajouter le nouvel objet `"AppelsOffres"` :

```json
"AppelsOffres": {
  "page": {
    "titre": "Appels d'offres",
    "filAriane": "Appels d'offres"
  },
  "table": {
    "aucunAppelOffres": "Aucun appel d'offres pour l'instant.",
    "ajouterPremier": "Ajouter votre premier appel d'offres",
    "colonneTitre": "Titre",
    "colonneAcheteur": "Acheteur",
    "colonneStatut": "Statut",
    "colonneAjouteLe": "Ajouté le",
    "colonneActions": "Actions",
    "supprimer": "Supprimer",
    "confirmerSuppressionTitre": "Supprimer cet appel d'offres ?",
    "confirmerSuppressionDescription": "Cette action est irréversible. Le fichier et les exigences extraites seront définitivement supprimés.",
    "annuler": "Annuler",
    "toastSupprime": "Appel d'offres supprimé"
  },
  "badge": {
    "enAttente": "En attente",
    "normalisationEnCours": "Normalisation en cours",
    "extractionEnCours": "Extraction en cours",
    "termine": "Terminé",
    "erreur": "Erreur"
  },
  "dialog": {
    "titreBouton": "Ajouter un appel d'offres",
    "titre": "Ajouter un appel d'offres",
    "confidentialite": "Le fichier est stocké de façon privée, accessible uniquement à votre entreprise.",
    "champFichier": "Fichier (PDF ou DOCX)",
    "envoiEnCours": "Envoi...",
    "boutonTeleverser": "Téléverser",
    "toastAjoute": "Appel d'offres ajouté"
  },
  "error": {
    "message": "Impossible de charger les appels d'offres.",
    "reessayer": "Réessayer"
  }
}
```

- [ ] **Step 2: Ajouter les clés équivalentes dans `messages/en.json`**

Dans l'objet `"Sidebar"` :

```json
"Sidebar": {
  "bibliotheque": "Library",
  "appelsOffres": "Tenders"
},
```

Nouvel objet `"AppelsOffres"` :

```json
"AppelsOffres": {
  "page": {
    "titre": "Tenders",
    "filAriane": "Tenders"
  },
  "table": {
    "aucunAppelOffres": "No tenders yet.",
    "ajouterPremier": "Add your first tender",
    "colonneTitre": "Title",
    "colonneAcheteur": "Buyer",
    "colonneStatut": "Status",
    "colonneAjouteLe": "Added on",
    "colonneActions": "Actions",
    "supprimer": "Delete",
    "confirmerSuppressionTitre": "Delete this tender?",
    "confirmerSuppressionDescription": "This action cannot be undone. The file and extracted requirements will be permanently deleted.",
    "annuler": "Cancel",
    "toastSupprime": "Tender deleted"
  },
  "badge": {
    "enAttente": "Pending",
    "normalisationEnCours": "Normalizing",
    "extractionEnCours": "Extracting",
    "termine": "Done",
    "erreur": "Error"
  },
  "dialog": {
    "titreBouton": "Add a tender",
    "titre": "Add a tender",
    "confidentialite": "The file is stored privately, accessible only to your company.",
    "champFichier": "File (PDF or DOCX)",
    "envoiEnCours": "Uploading...",
    "boutonTeleverser": "Upload",
    "toastAjoute": "Tender added"
  },
  "error": {
    "message": "Could not load tenders.",
    "reessayer": "Retry"
  }
}
```

- [ ] **Step 3: Ajouter l'entrée de navigation dans `components/app-sidebar.tsx`**

Remplacer le contenu du fichier par :

```tsx
import Link from "next/link";
import { Library, FileSearch } from "lucide-react";
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
git commit -m "feat(appels-offres): traductions et entrée barre latérale"
```

---

### Task 3: Backend — liste, suppression et actualisation

**Files:**
- Create: `lib/appels-offres/queries.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant` de `@/lib/utilisateur/queries` (déjà créé) ; `AppelOffres` de `./types` (déjà créé).
- Produces:
  - `queries.ts` : `export async function listerAppelsOffres(entrepriseId: string): Promise<AppelOffres[]>` — consommé par Task 7 (`page.tsx`) et par `obtenirAppelsOffresActualises` ci-dessous.
  - `actions.ts` (complété) : `export async function supprimerAppelOffres(appelOffresId: string, cheminStockage: string): Promise<{erreur: string} | {succes: true}>` et `export async function obtenirAppelsOffresActualises(): Promise<AppelOffres[]>` — tous deux consommés par Task 6 (`AppelOffresTable`). `televerserDao` (existant) gagne un appel `revalidatePath("/appels-offres")` sur succès.

Pas de test automatisé pour ce backend — même convention que `listerDocuments`/`ajouterDocument`/`supprimerDocument`, jamais testés unitairement dans ce projet (dépendances réelles Storage/DB trop lourdes à mocker utilement). Vérification manuelle au Task 7 une fois l'UI branchée.

- [ ] **Step 1: Créer `lib/appels-offres/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import type { AppelOffres } from "./types";

export async function listerAppelsOffres(entrepriseId: string): Promise<AppelOffres[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as AppelOffres[];
}
```

- [ ] **Step 2: Modifier `lib/appels-offres/actions.ts`**

Remplacer le contenu du fichier par :

```ts
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { televerserDaoSchema } from "./schema";
import { construireCheminStockageDao } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres } from "./queries";
import type { AppelOffres } from "./types";

export async function televerserDao(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const appelOffresId = randomUUID();
  const cheminStockage = construireCheminStockageDao(
    utilisateur.entreprise_id,
    appelOffresId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminStockage,
    fichier_dao_nom_original: fichier.name,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    const { error: erreurSuppressionFichier } = await supabase.storage
      .from("documents")
      .remove([cheminStockage]);

    if (erreurSuppressionFichier) {
      console.error(
        "Échec de la suppression du fichier DAO après échec d'insertion appel_offres. " +
          "Fichier orphelin dans le stockage.",
        { cheminStockage, erreur: erreurSuppressionFichier.message },
      );
    }

    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  try {
    await mettreEnFileTraitementDao(appelOffresId, fichier.type);
  } catch {
    const { error: erreurSuppression } = await supabase
      .from("appel_offres")
      .delete()
      .eq("id", appelOffresId);

    if (erreurSuppression) {
      console.error(
        "Échec du rollback appel_offres après échec de mise en file. " +
          "Ligne orpheline à nettoyer manuellement.",
        { appelOffresId, erreur: erreurSuppression.message },
      );
    } else {
      const { error: erreurSuppressionFichier } = await supabase.storage
        .from("documents")
        .remove([cheminStockage]);

      if (erreurSuppressionFichier) {
        console.error(
          "Échec de la suppression du fichier DAO après rollback appel_offres. " +
            "Fichier orphelin dans le stockage.",
          { cheminStockage, erreur: erreurSuppressionFichier.message },
        );
      }
    }

    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId };
}

export async function supprimerAppelOffres(
  appelOffresId: string,
  cheminStockage: string,
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

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function obtenirAppelsOffresActualises(): Promise<AppelOffres[]> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return [];

  return listerAppelsOffres(utilisateur.entreprise_id);
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Vérifier que la suite de tests complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent (aucune régression sur les tests existants de `lib/appels-offres/`).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/queries.ts lib/appels-offres/actions.ts
git commit -m "feat(appels-offres): liste, suppression et actualisation pour le suivi"
```

---

### Task 4: Composant `StatutTraitementBadge`

**Files:**
- Create: `app/(app)/appels-offres/statut-traitement-badge.tsx`

**Interfaces:**
- Consumes: `obtenirConfigStatutTraitement` de `@/lib/appels-offres/statut-traitement` (Task 1) ; `StatutTraitementAo` de `@/lib/appels-offres/types` (déjà créé) ; namespace `AppelsOffres.badge` (Task 2).
- Produces: `export function StatutTraitementBadge({ statut, erreurTraitement }: { statut: StatutTraitementAo; erreurTraitement: string | null }): JSX.Element` — consommé par Task 6 (`AppelOffresTable`).

Pas de test automatisé (composant React de présentation pure, la logique de mapping qu'il utilise est déjà testée à la Task 1 — cohérent avec `ExpirationBadge`, jamais testé directement dans ce projet).

- [ ] **Step 1: Créer `app/(app)/appels-offres/statut-traitement-badge.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Clock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { obtenirConfigStatutTraitement } from "@/lib/appels-offres/statut-traitement";
import type { StatutTraitementAo } from "@/lib/appels-offres/types";

const STYLES = {
  identifie: "bg-[hsl(var(--status-identifie))] text-slate-900 border-transparent",
  preparation: "bg-[hsl(var(--status-preparation))] text-white border-transparent",
  gagne: "bg-[hsl(var(--status-gagne))] text-slate-900 border-transparent",
  perdu: "bg-[hsl(var(--status-perdu))] text-white border-transparent",
} as const;

const ICONES = {
  horloge: Clock,
  chargement: Loader2,
  coche: CheckCircle2,
  alerte: AlertCircle,
} as const;

export function StatutTraitementBadge({
  statut,
  erreurTraitement,
}: {
  statut: StatutTraitementAo;
  erreurTraitement: string | null;
}) {
  const t = useTranslations("AppelsOffres");
  const config = obtenirConfigStatutTraitement(statut);
  const Icone = ICONES[config.icone];

  const badge = (
    <Badge variant="outline" className={`gap-1 ${STYLES[config.couleur]}`}>
      <Icone className={config.icone === "chargement" ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
      {t(config.cleLibelle)}
    </Badge>
  );

  if (statut === "erreur" && erreurTraitement) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{erreurTraitement}</TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/appels-offres/statut-traitement-badge.tsx"
git commit -m "feat(appels-offres): composant StatutTraitementBadge"
```

---

### Task 5: Composant `TeleverserDaoDialog`

**Files:**
- Create: `app/(app)/appels-offres/televerser-dao-dialog.tsx`

**Interfaces:**
- Consumes: `televerserDao` de `@/lib/appels-offres/actions` (Task 3) ; namespace `AppelsOffres.dialog` (Task 2).
- Produces: `export function TeleverserDaoDialog({ libelle }: { libelle: string }): JSX.Element` — consommé par Task 6 (`AppelOffresTable`).

Pas de test automatisé (composant React interactif, miroir direct d'`AjouterDocumentDialog`, jamais testé dans ce projet).

- [ ] **Step 1: Créer `app/(app)/appels-offres/televerser-dao-dialog.tsx`**

```tsx
"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { televerserDao } from "@/lib/appels-offres/actions";

export function TeleverserDaoDialog({ libelle }: { libelle: string }) {
  const t = useTranslations("AppelsOffres.dialog");
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await televerserDao(formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success(t("toastAjoute"));
    setOuvert(false);
    formRef.current?.reset();
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button>{libelle}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("titre")}</DialogTitle>
          <DialogDescription>{t("confidentialite")}</DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fichier">{t("champFichier")}</Label>
            <Input
              id="fichier"
              name="fichier"
              type="file"
              accept=".pdf,.docx"
              required
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={envoi}>
              {envoi ? t("envoiEnCours") : t("boutonTeleverser")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/appels-offres/televerser-dao-dialog.tsx"
git commit -m "feat(appels-offres): composant TeleverserDaoDialog"
```

---

### Task 6: Composant `AppelOffresTable` (tableau, polling, suppression)

**Files:**
- Create: `app/(app)/appels-offres/appel-offres-table.tsx`

**Interfaces:**
- Consumes: `tousLesAoStabilises` de `@/lib/appels-offres/polling` (Task 1) ; `supprimerAppelOffres`, `obtenirAppelsOffresActualises` de `@/lib/appels-offres/actions` (Task 3) ; `StatutTraitementBadge` (Task 4) ; `TeleverserDaoDialog` (Task 5) ; `AppelOffres` de `@/lib/appels-offres/types` (déjà créé) ; namespace `AppelsOffres.table` (Task 2).
- Produces: `export function AppelOffresTable({ appelsOffres }: { appelsOffres: AppelOffres[] }): JSX.Element` — consommé par Task 7 (`page.tsx`).

**Point important sur le polling** : l'effet de polling dépend de la prop `appelsOffres` (les données fraîches venues du serveur via `revalidatePath`, pas de l'état local) — ainsi, chaque fois que le serveur redonne des données fraîches (au montage, ou après un upload/suppression), l'effet réévalue s'il faut (re)lancer un intervalle. Un état local (`useState`) est synchronisé sur la prop via un `useEffect` séparé, pour que les nouvelles données serveur écrasent toujours l'état local — sans cela, un nouvel AO ajouté après l'arrêt d'un polling précédent resterait invisible tant que la page n'est pas rechargée manuellement.

Pas de test automatisé (composant React avec effets, miroir direct de `DocumentTable`, jamais testé dans ce projet).

- [ ] **Step 1: Créer `app/(app)/appels-offres/appel-offres-table.tsx`**

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { StatutTraitementBadge } from "./statut-traitement-badge";
import { TeleverserDaoDialog } from "./televerser-dao-dialog";
import {
  supprimerAppelOffres,
  obtenirAppelsOffresActualises,
} from "@/lib/appels-offres/actions";
import { tousLesAoStabilises } from "@/lib/appels-offres/polling";
import type { AppelOffres } from "@/lib/appels-offres/types";

const INTERVALLE_POLLING_MS = 4000;

export function AppelOffresTable({
  appelsOffres: appelsOffresInitial,
}: {
  appelsOffres: AppelOffres[];
}) {
  const t = useTranslations("AppelsOffres");
  const [appelsOffres, setAppelsOffres] = useState(appelsOffresInitial);
  const [aSupprimer, setASupprimer] = useState<AppelOffres | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAppelsOffres(appelsOffresInitial);
  }, [appelsOffresInitial]);

  useEffect(() => {
    if (tousLesAoStabilises(appelsOffresInitial)) return;

    const intervalId = setInterval(async () => {
      const actualises = await obtenirAppelsOffresActualises();
      setAppelsOffres(actualises);
      if (tousLesAoStabilises(actualises)) {
        clearInterval(intervalId);
      }
    }, INTERVALLE_POLLING_MS);

    return () => clearInterval(intervalId);
  }, [appelsOffresInitial]);

  function confirmerSuppression() {
    if (!aSupprimer) return;
    const cible = aSupprimer;
    startTransition(async () => {
      const resultat = await supprimerAppelOffres(cible.id, cible.fichier_dao_path);
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
      } else {
        toast.success(t("table.toastSupprime"));
        setAppelsOffres((liste) => liste.filter((ao) => ao.id !== cible.id));
      }
      setASupprimer(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <TeleverserDaoDialog libelle={t("dialog.titreBouton")} />
      </div>

      {appelsOffres.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
          <p>{t("table.aucunAppelOffres")}</p>
          <TeleverserDaoDialog libelle={t("table.ajouterPremier")} />
        </div>
      ) : (
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneTitre")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneStatut")}</TableHead>
              <TableHead>{t("table.colonneAjouteLe")}</TableHead>
              <TableHead className="text-right">{t("table.colonneActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appelsOffres.map((ao) => (
              <TableRow key={ao.id}>
                <TableCell>{ao.titre ?? ao.fichier_dao_nom_original}</TableCell>
                <TableCell>{ao.acheteur ?? "—"}</TableCell>
                <TableCell>
                  <StatutTraitementBadge
                    statut={ao.statut_traitement}
                    erreurTraitement={ao.erreur_traitement}
                  />
                </TableCell>
                <TableCell>
                  {new Date(ao.created_at).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setASupprimer(ao)}
                  >
                    {t("table.supprimer")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog
        open={!!aSupprimer}
        onOpenChange={(open) => !open && setASupprimer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("table.confirmerSuppressionTitre")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("table.confirmerSuppressionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("table.annuler")}</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmerSuppression}>
              {t("table.supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/appels-offres/appel-offres-table.tsx"
git commit -m "feat(appels-offres): composant AppelOffresTable avec polling"
```

---

### Task 7: Page `/appels-offres` (shell : page, chargement, erreur)

**Files:**
- Create: `app/(app)/appels-offres/page.tsx`
- Create: `app/(app)/appels-offres/loading.tsx`
- Create: `app/(app)/appels-offres/error.tsx`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant` de `@/lib/utilisateur/queries` (déjà créé) ; `listerAppelsOffres` de `@/lib/appels-offres/queries` (Task 3) ; `AppelOffresTable` (Task 6) ; `AnnoncerFilAriane` de `@/components/annoncer-fil-ariane` (déjà créé) ; namespace `AppelsOffres.page`/`AppelsOffres.error` (Task 2).
- Produces: route `/appels-offres` fonctionnelle — dernière pièce de ce sous-projet, rien consommé par un sous-projet suivant directement (le sous-projet B y ajoutera un lien de navigation vers la page de détail).

- [ ] **Step 1: Créer `app/(app)/appels-offres/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { listerAppelsOffres } from "@/lib/appels-offres/queries";
import { AppelOffresTable } from "./appel-offres-table";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function AppelsOffresPage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const appelsOffres = await listerAppelsOffres(utilisateur.entreprise_id);
  const t = await getTranslations("AppelsOffres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <AppelOffresTable appelsOffres={appelsOffres} />
    </div>
  );
}
```

- [ ] **Step 2: Créer `app/(app)/appels-offres/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementAppelsOffres() {
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

- [ ] **Step 3: Créer `app/(app)/appels-offres/error.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";

export default function ErreurAppelsOffres({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const t = useTranslations("AppelsOffres.error");

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

- [ ] **Step 6: Vérification manuelle**

Lancer `npm run dev`, se connecter, ouvrir `/appels-offres` :
- La page se charge, l'entrée "Appels d'offres" apparaît dans la barre latérale.
- Uploader un DAO (PDF ou DOCX) via le dialog : la ligne apparaît avec le statut "En attente", puis progresse automatiquement (grâce au polling) vers "Normalisation en cours" → "Extraction en cours" → "Terminé", sans rechargement manuel de la page.
- Supprimer un AO : la ligne disparaît, toast de confirmation affiché.

Documenter le résultat de cette vérification manuelle (captures ou description) avant de considérer la tâche terminée — nécessite `ANTHROPIC_API_KEY` avec crédit disponible et `QSTASH_TOKEN`/`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` configurés pour que le traitement en arrière-plan progresse réellement. Si l'un de ces éléments manque, rapporter en `BLOCKED` plutôt que de tenter une configuration non documentée ici — le reste du sous-projet (code, compilation, tests) reste valide indépendamment de cette vérification bout-en-bout.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/appels-offres/page.tsx" "app/(app)/appels-offres/loading.tsx" "app/(app)/appels-offres/error.tsx"
git commit -m "feat(appels-offres): page de liste et suivi des AO"
```

---
