# Responsable assigné Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre d'assigner un responsable (membre de l'équipe) à chaque AO depuis le tableau pipeline — dernier point du périmètre Module 5.

**Architecture:** Une colonne `assigne_a` sur `appel_offres`, une requête de lecture de l'équipe, une Server Action, un composant `Select` optimiste mirroré sur `StatutPipelineSelect` déjà en place.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres RLS), TypeScript, shadcn/ui (`Select`), next-intl.

## Global Constraints

- Un seul responsable par AO (pas de multi-assignation).
- Aucune nouvelle policy RLS : `appel_offres_update_membres` (déjà en place) couvre l'écriture de la nouvelle colonne.
- `on delete set null` sur la FK : un utilisateur supprimé ne doit jamais bloquer, l'AO redevient non assigné.
- Spec complet : `docs/superpowers/specs/2026-09-08-responsable-assigne-design.md`.

---

### Task 1: Migration + types + lecture de l'équipe

**Files:**
- Create: `supabase/migrations/20260908100000_appel_offres_assigne_a.sql`
- Modify: `lib/appels-offres/types.ts`
- Modify: `lib/utilisateur/queries.ts`

**Interfaces:**
- Produces: `AppelOffres.assigne_a: string | null` ; `export async function listerUtilisateurs(entrepriseId: string): Promise<{ id: string; nom: string }[]>` — consommés par Task 2 et Task 3.

- [ ] **Step 1: Créer la migration**

```sql
-- Responsable assigné (Module 5) — pas de nouvelle policy RLS requise :
-- appel_offres_update_membres (20260901190618) couvre déjà toute colonne.
alter table appel_offres
  add column assigne_a uuid references utilisateur(id) on delete set null;
```

- [ ] **Step 2: Appliquer la migration**

Run: `npx supabase db push`

Si la worktree n'est pas reliée au projet Supabase, exécuter `supabase link` avec le token de `.env.local` du dépôt principal (jamais committé).

- [ ] **Step 3: Vérifier réellement que la colonne existe**

Run: `npx supabase db query --linked "select column_name, data_type, is_nullable from information_schema.columns where table_name = 'appel_offres' and column_name = 'assigne_a';"`

Expected : 1 ligne, `assigne_a`, `uuid`, `YES`.

- [ ] **Step 4: Ajouter `assigne_a` au type `AppelOffres`**

Dans `lib/appels-offres/types.ts`, remplacer :

```ts
export interface AppelOffres {
  id: string;
  entreprise_id: string;
  titre: string | null;
  acheteur: string | null;
  secteur: string | null;
  date_limite: string | null;
  montant_caution: number | null;
  statut_pipeline: StatutPipelineAo;
  statut_traitement: StatutTraitementAo;
  erreur_traitement: string | null;
  fichier_dao_path: string;
  fichier_dao_nom_original: string;
  dao_markdown: string | null;
  sommaire_attendu: string[] | null;
  created_by: string | null;
  created_at: string;
}
```

Par :

```ts
export interface AppelOffres {
  id: string;
  entreprise_id: string;
  titre: string | null;
  acheteur: string | null;
  secteur: string | null;
  date_limite: string | null;
  montant_caution: number | null;
  statut_pipeline: StatutPipelineAo;
  statut_traitement: StatutTraitementAo;
  erreur_traitement: string | null;
  fichier_dao_path: string;
  fichier_dao_nom_original: string;
  dao_markdown: string | null;
  sommaire_attendu: string[] | null;
  assigne_a: string | null;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 5: Ajouter `listerUtilisateurs` à `lib/utilisateur/queries.ts`**

Le fichier actuel est :

```ts
import { createClient } from "@/lib/supabase/server";

export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;

  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}
```

Ajouter à la fin :

```ts

export async function listerUtilisateurs(
  entrepriseId: string,
): Promise<{ id: string; nom: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateur")
    .select("id, nom")
    .eq("entreprise_id", entrepriseId)
    .order("nom", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 130/130 tests passent (aucun test ne couvre ces changements, rien ne doit casser ailleurs).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260908100000_appel_offres_assigne_a.sql lib/appels-offres/types.ts lib/utilisateur/queries.ts
git commit -m "feat: colonne assigne_a sur appel_offres + lecture de l'équipe"
```

---

### Task 2: Server Action `assignerResponsable`

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Produces: `export async function assignerResponsable(appelOffresId: string, utilisateurId: string | null): Promise<{ erreur: string } | { succes: true }>` — consommée par Task 3.

**Pas de test dédié** (cohérent avec les autres Server Actions du fichier).

- [ ] **Step 1: Ajouter la fonction à la fin de `lib/appels-offres/actions.ts`**

```ts

export async function assignerResponsable(
  appelOffresId: string,
  utilisateurId: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // modifiées — même défense en profondeur que modifierStatutPipeline.
  const { data, error } = await supabase
    .from("appel_offres")
    .update({ assigne_a: utilisateurId })
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de l'assignation. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath("/pipeline");
  return { succes: true as const };
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat: Server Action assignerResponsable"
```

---

### Task 3: UI — colonne Responsable dans le pipeline

**Files:**
- Create: `app/(app)/pipeline/responsable-select.tsx`
- Modify: `app/(app)/pipeline/pipeline-table.tsx`
- Modify: `app/(app)/pipeline/page.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `assignerResponsable` (Task 2), `listerUtilisateurs` (Task 1).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Le bloc `"Pipeline"` se termine actuellement par (lignes 169-201, fin de fichier) :

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
}
```

Remplacer par (ajout de `colonneResponsable` dans `table`, ajout du sous-objet `responsable`) :

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
      "colonneResponsable": "Responsable",
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
    "responsable": {
      "nonAssigne": "Non assigné",
      "toastModifie": "Responsable mis à jour",
      "erreur": "Échec de l'assignation. Réessayez."
    },
    "error": {
      "message": "Impossible de charger le pipeline.",
      "reessayer": "Réessayer"
    }
  }
}
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Le bloc `"Pipeline"` se termine actuellement par (lignes 169-201, fin de fichier) :

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
}
```

Remplacer par :

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
      "colonneResponsable": "Owner",
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
    "responsable": {
      "nonAssigne": "Unassigned",
      "toastModifie": "Owner updated",
      "erreur": "Failed to assign. Please try again."
    },
    "error": {
      "message": "Could not load the pipeline.",
      "reessayer": "Retry"
    }
  }
}
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`

Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/pipeline/responsable-select.tsx`**

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
import { assignerResponsable } from "@/lib/appels-offres/actions";

const VALEUR_NON_ASSIGNE = "__non_assigne__";

export function ResponsableSelect({
  appelOffresId,
  assigneAInitial,
  equipe,
}: {
  appelOffresId: string;
  assigneAInitial: string | null;
  equipe: { id: string; nom: string }[];
}) {
  const t = useTranslations("Pipeline.responsable");
  const [assigneA, setAssigneA] = useState(assigneAInitial ?? VALEUR_NON_ASSIGNE);
  const [isPending, startTransition] = useTransition();

  function onValueChange(valeur: string) {
    const precedent = assigneA;
    setAssigneA(valeur);

    startTransition(async () => {
      const utilisateurId = valeur === VALEUR_NON_ASSIGNE ? null : valeur;
      const resultat = await assignerResponsable(appelOffresId, utilisateurId);
      if ("erreur" in resultat) {
        toast.error(t("erreur"));
        setAssigneA(precedent);
      } else {
        toast.success(t("toastModifie"));
      }
    });
  }

  return (
    <Select value={assigneA} onValueChange={onValueChange} disabled={isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={VALEUR_NON_ASSIGNE}>{t("nonAssigne")}</SelectItem>
        {equipe.map((membre) => (
          <SelectItem key={membre.id} value={membre.id}>
            {membre.nom}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 5: Modifier `app/(app)/pipeline/pipeline-table.tsx`**

Ajouter l'import, avec les autres imports de composants locaux :

```ts
import { ResponsableSelect } from "./responsable-select";
```

Changer la signature de la fonction. La ligne actuelle est :

```tsx
export function PipelineTable({ appelsOffres }: { appelsOffres: AppelOffres[] }) {
```

La remplacer par :

```tsx
export function PipelineTable({
  appelsOffres,
  equipe,
}: {
  appelsOffres: AppelOffres[];
  equipe: { id: string; nom: string }[];
}) {
```

Ajouter l'en-tête de colonne. Le bloc actuel est :

```tsx
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneTitre")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneStatut")}</TableHead>
              <TableHead>{t("table.colonneEcheance")}</TableHead>
              <TableHead>{t("table.colonneMontantCaution")}</TableHead>
            </TableRow>
          </TableHeader>
```

Le remplacer par :

```tsx
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>{t("table.colonneTitre")}</TableHead>
              <TableHead>{t("table.colonneAcheteur")}</TableHead>
              <TableHead>{t("table.colonneStatut")}</TableHead>
              <TableHead>{t("table.colonneResponsable")}</TableHead>
              <TableHead>{t("table.colonneEcheance")}</TableHead>
              <TableHead>{t("table.colonneMontantCaution")}</TableHead>
            </TableRow>
          </TableHeader>
```

Ajouter la cellule correspondante. Le bloc actuel est :

```tsx
                <TableCell>
                  <StatutPipelineSelect appelOffresId={ao.id} statutInitial={ao.statut_pipeline} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
```

Le remplacer par :

```tsx
                <TableCell>
                  <StatutPipelineSelect appelOffresId={ao.id} statutInitial={ao.statut_pipeline} />
                </TableCell>
                <TableCell>
                  <ResponsableSelect
                    appelOffresId={ao.id}
                    assigneAInitial={ao.assigne_a}
                    equipe={equipe}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
```

- [ ] **Step 6: Modifier `app/(app)/pipeline/page.tsx`**

Remplacer le fichier entier par :

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant, listerUtilisateurs } from "@/lib/utilisateur/queries";
import { listerAppelsOffres } from "@/lib/appels-offres/queries";
import { PipelineTable } from "./pipeline-table";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function PipelinePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const appelsOffres = await listerAppelsOffres(utilisateur.entreprise_id);
  const equipe = await listerUtilisateurs(utilisateur.entreprise_id);
  const t = await getTranslations("Pipeline.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <PipelineTable appelsOffres={appelsOffres} equipe={equipe} />
    </div>
  );
}
```

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 8: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 130/130 tests passent.

- [ ] **Step 9: Vérifier le build de production**

Run: `npx next build`

Expected: build réussi, aucune erreur.

- [ ] **Step 10: Commit**

```bash
git add app/\(app\)/pipeline/responsable-select.tsx app/\(app\)/pipeline/pipeline-table.tsx app/\(app\)/pipeline/page.tsx messages/fr.json messages/en.json
git commit -m "feat: colonne responsable assigné dans le pipeline"
```

---

## Self-Review Notes

- **Couverture du spec** : les 5 éléments (colonne `assigne_a`, `listerUtilisateurs`, `assignerResponsable`, `ResponsableSelect`, colonne dans le tableau) sont chacun couverts par une tâche.
- **Cohérence des types** : `{ id: string; nom: string }` a la même forme partout (Task 1, Task 3). `AppelOffres.assigne_a` défini une seule fois, consommé sans redéfinition.
- **Aucun placeholder** : chaque étape contient le code exact ou le texte exact à remplacer.
- **Vérification manuelle** : comme convenu, reportée — ce plan n'inclut pas de vérification `npm run dev`, à faire ensemble plus tard.
