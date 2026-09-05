# Mapping manuel assisté Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'associer chaque exigence de type `piece_requise` d'un AO à un ou plusieurs documents de la bibliothèque, avec des suggestions par type de document et un get-or-create fiable du `dossier_reponse` sous-jacent — Module 4, sous-projet 2 de NoubinAO.

**Architecture:** Extension de `obtenirAppelOffres` (get-or-create de `dossier_reponse` + jointure `exigence_document`→`document`), deux nouvelles Server Actions (associer/dissocier), une fonction pure d'heuristique de type, et un nouveau composant client `DocumentsExigence` intégré dans la page de détail existante — aucune nouvelle route, aucun nouveau composant shadcn (le `Select` déjà utilisé pour `StatutPipelineSelect` suffit).

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres, RLS), TypeScript, Vitest, next-intl, shadcn/ui (`Select`, `Button`, `Badge` déjà installés).

## Global Constraints

- Le get-or-create de `dossier_reponse` doit gérer la course entre deux requêtes concurrentes (contrainte unique `appel_offres_id`) : sur échec d'insertion, relire une fois avant d'abandonner. Contrairement à l'insertion best-effort de `traitement.ts`, un échec ici doit lever une vraie erreur (`throw`), pas être avalé.
- Mapping limité aux exigences `type_exigence === 'piece_requise'` — pas de `critere_evaluation` dans ce sous-projet.
- Aucune recherche vectorielle ni recherche texte sur le contenu des documents — seulement un tri par `type` de document, déterminé par une petite heuristique sur le libellé de l'exigence.
- Les documents expirés restent sélectionnables, jamais exclus — affichés avec `ExpirationBadge` (réutilisé tel quel depuis `app/(app)/bibliotheque/expiration-badge.tsx`).
- Aucun nouveau composant shadcn à installer — utiliser `Select`/`SelectGroup`/`SelectLabel`/`SelectItem` déjà présents dans `components/ui/select.tsx`.
- Toast d'erreur uniquement (pas de toast de succès) sur l'association/dissociation d'un document — le retour visuel immédiat (document qui apparaît/disparaît de la liste) suffit, cohérent avec la volonté de rester peu bruyant pour une action fréquente.
- `dissocierDocumentAExigence` doit vérifier les lignes réellement supprimées via `.select("id")` après `.delete()` (même défense en profondeur que `modifierStatutPipeline`, `lib/appels-offres/actions.ts`).
- Spec complet : `docs/superpowers/specs/2026-09-05-mapping-manuel-assiste-design.md`.

---

### Task 1: Heuristique `deviserTypeDocumentPrefere`

**Files:**
- Create: `lib/appels-offres/suggestion-document.ts`
- Test: `lib/appels-offres/suggestion-document.test.ts`

**Interfaces:**
- Consumes: `TypeDocument` (type déjà exporté par `lib/documents/types.ts`).
- Produces: `export function deviserTypeDocumentPrefere(libelle: string): TypeDocument` — consommée par Task 5 (composant `DocumentsExigence`).

- [ ] **Step 1: Écrire le test (TDD)**

Créer `lib/appels-offres/suggestion-document.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { deviserTypeDocumentPrefere } from "./suggestion-document";

describe("deviserTypeDocumentPrefere", () => {
  it("reconnaît un CV, insensible à la casse", () => {
    expect(deviserTypeDocumentPrefere("CV du chef de chantier")).toBe("cv");
    expect(deviserTypeDocumentPrefere("cv de l'ingénieur")).toBe("cv");
  });

  it("reconnaît une référence de projet", () => {
    expect(deviserTypeDocumentPrefere("Référence de projet similaire")).toBe(
      "reference_projet",
    );
    expect(deviserTypeDocumentPrefere("Projet similaire réalisé")).toBe(
      "reference_projet",
    );
  });

  it("reconnaît un agrément", () => {
    expect(deviserTypeDocumentPrefere("Agrément technique requis")).toBe("agrement");
  });

  it("retombe sur piece_administrative par défaut", () => {
    expect(deviserTypeDocumentPrefere("Extrait RCCM")).toBe("piece_administrative");
    expect(deviserTypeDocumentPrefere("Attestation fiscale")).toBe("piece_administrative");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/suggestion-document.test.ts`

Expected: FAIL — `suggestion-document.ts` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/suggestion-document.ts`**

```ts
import type { TypeDocument } from "@/lib/documents/types";

export function deviserTypeDocumentPrefere(libelle: string): TypeDocument {
  const l = libelle.toLowerCase();
  if (l.includes("cv")) return "cv";
  if (
    l.includes("référence") ||
    l.includes("reference") ||
    l.includes("projet similaire")
  ) {
    return "reference_projet";
  }
  if (l.includes("agrément") || l.includes("agrement")) return "agrement";
  return "piece_administrative";
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/suggestion-document.test.ts`

Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/suggestion-document.ts lib/appels-offres/suggestion-document.test.ts
git commit -m "feat: heuristique de type de document préféré par exigence"
```

---

### Task 2: Get-or-create `dossier_reponse` + jointure `documentsParExigence`

**Files:**
- Modify: `lib/appels-offres/queries.ts`

**Interfaces:**
- Consumes: types `DossierReponse` (déjà exporté par `lib/appels-offres/types.ts` depuis le sous-projet 1), `Document` (`lib/documents/types.ts`), tables `dossier_reponse`/`exigence_document` (déjà créées, sous-projet 1).
- Produces: `obtenirAppelOffres` retourne désormais `{ appelOffres, exigences, dossierReponse, documentsParExigence }` au lieu de `{ appelOffres, exigences }` — consommé par Task 5 (`page.tsx`).

**Ce fichier n'a pas de test dédié** (cohérent avec le spec : la logique de course est simple à relire mais peu fiable à tester sans une vraie base concurrente, comme les lectures Supabase directes ailleurs dans le projet). Vérification : `npx tsc --noEmit`, puis vérification manuelle via `npm run dev` une fois ce sous-projet mergé (à faire par Sorel, comme pour le parcours authentifié du Module 3).

- [ ] **Step 1: Remplacer le contenu de `lib/appels-offres/queries.ts`**

Remplacer le fichier entier par :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppelOffres, DossierReponse, ExigenceAo } from "./types";
import type { Document } from "@/lib/documents/types";

export async function listerAppelsOffres(
  entrepriseId: string,
): Promise<AppelOffres[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as AppelOffres[];
}

// Le get-or-create ci-dessous diffère délibérément de l'insertion
// best-effort de traitement.ts (lib/appels-offres/traitement.ts) : là-bas,
// un échec ne doit jamais faire échouer un traitement par ailleurs réussi.
// Ici, la page de détail a besoin de cette ligne pour fonctionner (afficher
// le mapping, plus tard le statut de relecture) — un échec doit donc
// remonter une vraie erreur.
async function obtenirOuCreerDossierReponse(
  supabase: SupabaseClient,
  appelOffresId: string,
): Promise<DossierReponse> {
  const { data: existant } = await supabase
    .from("dossier_reponse")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (existant) return existant as DossierReponse;

  const { data: cree, error: erreurInsertion } = await supabase
    .from("dossier_reponse")
    .insert({ appel_offres_id: appelOffresId })
    .select("*")
    .maybeSingle();

  if (!erreurInsertion && cree) return cree as DossierReponse;

  // Course possible avec une autre requête concurrente (ex. deux onglets
  // ouverts sur le même AO au même instant, ou l'insertion best-effort de
  // traitement.ts qui vient de s'exécuter entre notre SELECT et notre
  // INSERT) : la contrainte unique sur appel_offres_id a été violée. Non
  // fatal — la ligne existe forcément à ce stade, on la relit.
  const { data: relu } = await supabase
    .from("dossier_reponse")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (!relu) {
    throw new Error("Échec de la création du dossier de réponse.");
  }

  return relu as DossierReponse;
}

export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
): Promise<{
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  dossierReponse: DossierReponse;
  documentsParExigence: Record<string, Document[]>;
} | null> {
  const supabase = await createClient();

  const { data: appelOffres, error: erreurAppelOffres } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurAppelOffres || !appelOffres) return null;

  const { data: exigences, error: erreurExigences } = await supabase
    .from("exigence_ao")
    .select("*")
    .eq("appel_offres_id", id)
    .order("created_at", { ascending: true });

  if (erreurExigences) throw erreurExigences;

  const exigencesTypees = (exigences ?? []) as ExigenceAo[];

  const dossierReponse = await obtenirOuCreerDossierReponse(supabase, id);

  const documentsParExigence: Record<string, Document[]> = {};

  if (exigencesTypees.length > 0) {
    const { data: liens, error: erreurLiens } = await supabase
      .from("exigence_document")
      .select("exigence_ao_id, document(*)")
      .in(
        "exigence_ao_id",
        exigencesTypees.map((e) => e.id),
      );

    if (erreurLiens) throw erreurLiens;

    for (const lien of liens ?? []) {
      const exigenceId = lien.exigence_ao_id as string;
      documentsParExigence[exigenceId] ??= [];
      documentsParExigence[exigenceId].push(lien.document as unknown as Document);
    }
  }

  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: exigencesTypees,
    dossierReponse,
    documentsParExigence,
  };
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur. Si une erreur de type apparaît sur `lien.exigence_ao_id`/`lien.document` (la relation embarquée PostgREST n'est pas typée finement par le client Supabase généré), c'est attendu — le double cast (`as string`, `as unknown as Document`) le couvre déjà ; ne pas ajouter de générique Supabase supplémentaire pour ce sous-projet.

- [ ] **Step 3: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests existants passent toujours (ce fichier n'a pas de test dédié, mais ne doit rien casser ailleurs — vérifier qu'aucun fichier n'importe `obtenirAppelOffres` en mockant l'ancien type de retour à deux champs).

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/queries.ts
git commit -m "feat: get-or-create dossier_reponse et jointure documents par exigence"
```

---

### Task 3: Server Actions `associerDocumentAExigence`/`dissocierDocumentAExigence`

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: table `exigence_document` (sous-projet 1), `obtenirUtilisateurCourant` (déjà importé dans ce fichier).
- Produces: `export async function associerDocumentAExigence(appelOffresId: string, exigenceId: string, documentId: string): Promise<{ erreur: string } | { succes: true }>` et `export async function dissocierDocumentAExigence(appelOffresId: string, exigenceId: string, documentId: string): Promise<{ erreur: string } | { succes: true }>` — consommées par Task 5 (`DocumentsExigence`).

**Pas de test dédié** (cohérent avec l'absence de tests sur les Server Actions existantes de ce fichier, ex. `modifierStatutPipeline`).

- [ ] **Step 1: Ajouter les deux fonctions à la fin de `lib/appels-offres/actions.ts`**

```ts
export async function associerDocumentAExigence(
  appelOffresId: string,
  exigenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("exigence_document").insert({
    exigence_ao_id: exigenceId,
    document_id: documentId,
    created_by: utilisateur.id,
  });

  // Code Postgres 23505 = violation de contrainte unique : l'association
  // existe déjà (ex. double-clic, ou déjà associée dans un autre onglet).
  // Traité comme un succès idempotent, pas une erreur utilisateur.
  if (error && error.code !== "23505") {
    return { erreur: "Échec de l'association. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function dissocierDocumentAExigence(
  appelOffresId: string,
  exigenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // supprimées — même défense en profondeur que modifierStatutPipeline
  // ci-dessus : sans elle, un couple exigence/document qui ne correspond à
  // aucune ligne (ids périmés, déjà dissocié dans un autre onglet)
  // renverrait {succes: true} sans qu'aucune ligne n'ait été supprimée.
  const { data, error } = await supabase
    .from("exigence_document")
    .delete()
    .eq("exigence_ao_id", exigenceId)
    .eq("document_id", documentId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la dissociation. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Association introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat: Server Actions associer/dissocier un document à une exigence"
```

---

### Task 4: Traductions FR/EN

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: rien.
- Produces: namespace `AppelsOffres.detail.exigences.documents` avec 6 clés — consommé par Task 5 (`DocumentsExigence`, via `useTranslations("AppelsOffres.detail.exigences.documents")`).

- [ ] **Step 1: Ajouter le sous-objet `documents` dans `messages/fr.json`**

Dans `messages/fr.json`, la clé `"exigences"` sous `"AppelsOffres"."detail"` est actuellement (lignes 126-133) :

```json
      "exigences": {
        "titreSommaire": "Sommaire attendu de l'offre",
        "titrePiecesRequises": "Pièces requises",
        "aucunePiece": "Aucune pièce requise identifiée.",
        "titreCriteres": "Critères d'évaluation",
        "aucunCritere": "Aucun critère d'évaluation identifié.",
        "source": "Source"
      },
```

La remplacer par (ajout de `"documents"` avant l'accolade fermante) :

```json
      "exigences": {
        "titreSommaire": "Sommaire attendu de l'offre",
        "titrePiecesRequises": "Pièces requises",
        "aucunePiece": "Aucune pièce requise identifiée.",
        "titreCriteres": "Critères d'évaluation",
        "aucunCritere": "Aucun critère d'évaluation identifié.",
        "source": "Source",
        "documents": {
          "aucunDocumentAssocie": "Aucun document associé.",
          "dissocier": "Retirer",
          "placeholderSelect": "Associer un document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Autres documents",
          "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
          "erreurAssociation": "Échec de l'association. Réessayez.",
          "erreurDissociation": "Échec de la dissociation. Réessayez."
        }
      },
```

- [ ] **Step 2: Ajouter le même sous-objet dans `messages/en.json`**

Dans `messages/en.json`, la clé `"exigences"` équivalente (lignes 126-133) est :

```json
      "exigences": {
        "titreSommaire": "Expected offer summary",
        "titrePiecesRequises": "Required documents",
        "aucunePiece": "No required document identified.",
        "titreCriteres": "Evaluation criteria",
        "aucunCritere": "No evaluation criterion identified.",
        "source": "Source"
      },
```

La remplacer par :

```json
      "exigences": {
        "titreSommaire": "Expected offer summary",
        "titrePiecesRequises": "Required documents",
        "aucunePiece": "No required document identified.",
        "titreCriteres": "Evaluation criteria",
        "aucunCritere": "No evaluation criterion identified.",
        "source": "Source",
        "documents": {
          "aucunDocumentAssocie": "No document linked.",
          "dissocier": "Remove",
          "placeholderSelect": "Link a document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Other documents",
          "bibliothequeVide": "No document in the library yet. Add one from the Library.",
          "erreurAssociation": "Failed to link the document. Please try again.",
          "erreurDissociation": "Failed to remove the document. Please try again."
        }
      },
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`

Expected: `OK` imprimé, aucune erreur de parsing.

- [ ] **Step 4: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "feat: traductions FR/EN pour le mapping documents/exigences"
```

---

### Task 5: Composant `DocumentsExigence` + intégration dans la page de détail

**Files:**
- Create: `app/(app)/appels-offres/[id]/documents-exigence.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`

**Interfaces:**
- Consumes: `deviserTypeDocumentPrefere` (Task 1), `associerDocumentAExigence`/`dissocierDocumentAExigence` (Task 3), traductions (Task 4), `documentsParExigence` (Task 2), `ExpirationBadge` (`app/(app)/bibliotheque/expiration-badge.tsx`, existant), `listerDocuments` (`lib/documents/queries.ts`, existant).
- Produces: `AppelOffresDetail` accepte deux nouvelles props (`documentsParExigence`, `bibliotheque`) ; `DocumentsExigence` est un composant terminal, ne produit rien pour d'autres tâches.

- [ ] **Step 1: Créer `app/(app)/appels-offres/[id]/documents-exigence.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExpirationBadge } from "@/app/(app)/bibliotheque/expiration-badge";
import {
  associerDocumentAExigence,
  dissocierDocumentAExigence,
} from "@/lib/appels-offres/actions";
import { deviserTypeDocumentPrefere } from "@/lib/appels-offres/suggestion-document";
import type { Document } from "@/lib/documents/types";

export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.documents");
  const [documentsAssocies, setDocumentsAssocies] = useState(documentsAssociesInitial);
  const [isPending, startTransition] = useTransition();

  const idsAssocies = new Set(documentsAssocies.map((d) => d.id));
  const disponibles = bibliotheque.filter((d) => !idsAssocies.has(d.id));
  const typePrefere = deviserTypeDocumentPrefere(libelleExigence);
  const suggeres = disponibles.filter((d) => d.type === typePrefere);
  const autres = disponibles.filter((d) => d.type !== typePrefere);

  function onSelectionner(documentId: string) {
    const document = bibliotheque.find((d) => d.id === documentId);
    if (!document) return;

    startTransition(async () => {
      const resultat = await associerDocumentAExigence(appelOffresId, exigenceId, documentId);
      if ("erreur" in resultat) {
        toast.error(t("erreurAssociation"));
        return;
      }
      setDocumentsAssocies((liste) => [...liste, document]);
    });
  }

  function onDissocier(documentId: string) {
    const precedent = documentsAssocies;
    setDocumentsAssocies((liste) => liste.filter((d) => d.id !== documentId));

    startTransition(async () => {
      const resultat = await dissocierDocumentAExigence(appelOffresId, exigenceId, documentId);
      if ("erreur" in resultat) {
        toast.error(t("erreurDissociation"));
        setDocumentsAssocies(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {documentsAssocies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunDocumentAssocie")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {documentsAssocies.map((document) => (
            <li key={document.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                {document.nom}
                <ExpirationBadge dateExpiration={document.date_expiration} />
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => onDissocier(document.id)}
              >
                {t("dissocier")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {bibliotheque.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("bibliothequeVide")}</p>
      ) : disponibles.length > 0 ? (
        // La clé change à chaque association/dissociation pour forcer un
        // remontage du Select : il n'est pas contrôlé (aucune valeur ne
        // doit y rester affichée après un choix, le document choisi
        // rejoint la liste ci-dessus), et Radix Select ne fournit pas de
        // méthode impérative pour revenir au placeholder autrement.
        <Select key={documentsAssocies.length} onValueChange={onSelectionner} disabled={isPending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("placeholderSelect")} />
          </SelectTrigger>
          <SelectContent>
            {suggeres.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t("groupeSuggestions")}</SelectLabel>
                {suggeres.map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.nom}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
            {autres.length > 0 && (
              <SelectGroup>
                <SelectLabel>{t("groupeAutres")}</SelectLabel>
                {autres.map((document) => (
                  <SelectItem key={document.id} value={document.id}>
                    {document.nom}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Modifier `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

Ajouter l'import en haut du fichier, avec les autres imports de composants locaux :

```ts
import { DocumentsExigence } from "./documents-exigence";
import type { Document } from "@/lib/documents/types";
```

Changer la signature de la fonction (actuellement `appelOffres`/`exigences` seulement) pour accepter deux props supplémentaires :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
}) {
```

Dans le bloc qui affiche `piecesRequises` (liste des pièces requises), ajouter `<DocumentsExigence />` à l'intérieur de chaque `<li>`, juste après le paragraphe de source. Le bloc actuel est :

```tsx
                {piecesRequises.map((exigence) => (
                  <li key={exigence.id} className="border-b pb-2">
                    <p className="font-medium">{exigence.libelle}</p>
                    {exigence.description && (
                      <p className="text-sm text-muted-foreground">{exigence.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("exigences.source")} : {exigence.source_section}
                    </p>
                  </li>
                ))}
```

Le remplacer par :

```tsx
                {piecesRequises.map((exigence) => (
                  <li key={exigence.id} className="border-b pb-2">
                    <p className="font-medium">{exigence.libelle}</p>
                    {exigence.description && (
                      <p className="text-sm text-muted-foreground">{exigence.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("exigences.source")} : {exigence.source_section}
                    </p>
                    <div className="mt-2">
                      <DocumentsExigence
                        appelOffresId={appelOffres.id}
                        exigenceId={exigence.id}
                        libelleExigence={exigence.libelle}
                        documentsAssocies={documentsParExigence[exigence.id] ?? []}
                        bibliotheque={bibliotheque}
                      />
                    </div>
                  </li>
                ))}
```

- [ ] **Step 3: Modifier `app/(app)/appels-offres/[id]/page.tsx`**

Ajouter l'import de `listerDocuments` :

```ts
import { listerDocuments } from "@/lib/documents/queries";
```

Après la ligne `if (!resultat) notFound();`, ajouter l'appel à `listerDocuments` :

```ts
const bibliotheque = await listerDocuments(utilisateur.entreprise_id);
```

Modifier l'appel à `<AppelOffresDetail>` (actuellement `appelOffres={resultat.appelOffres} exigences={resultat.exigences}`) pour passer les deux nouvelles props :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
      />
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 5: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent (aucun test ne couvre ces composants UI, mais rien ne doit être cassé ailleurs).

- [ ] **Step 6: Vérifier le build de production**

Run: `npx next build`

Expected: build réussi, aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add app/\(app\)/appels-offres/\[id\]/documents-exigence.tsx app/\(app\)/appels-offres/\[id\]/appel-offres-detail.tsx app/\(app\)/appels-offres/\[id\]/page.tsx
git commit -m "feat: UI de mapping document/exigence sur la page de détail AO"
```

---

## Self-Review Notes

- **Couverture du spec** : les 6 décisions validées (get-or-create intégré, suggestions par type avec heuristique, combobox=Select existant, périmètre piece_requise, documents expirés signalés pas exclus, intégration dans la liste existante) sont chacune couvertes par une tâche.
- **Cohérence des types** : `documentsParExigence: Record<string, Document[]>` a le même type dans `queries.ts` (Task 2), `appel-offres-detail.tsx` et `documents-exigence.tsx` (Task 5). `Document` importé du même chemin (`@/lib/documents/types`) partout.
- **Vérification manuelle requise après ce sous-projet** : comme pour le parcours authentifié du Module 3, le get-or-create et le flux d'association/dissociation en conditions réelles (deux onglets ouverts sur le même AO pour la course, bibliothèque vide, document expiré) n'ont pas pu être vérifiés en direct faute d'identifiants dans les sessions agent — à faire par Sorel via `npm run dev` avant de considérer ce sous-projet définitivement clos.
- **Aucun placeholder** : chaque étape contient le code exact à écrire ou le texte exact à remplacer.
