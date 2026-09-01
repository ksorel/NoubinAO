# Revue et édition des exigences DAO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire la page de détail `/appels-offres/[id]` : affichage et correction manuelle des champs extraits d'un AO (titre/acheteur/secteur/date limite/montant caution), affichage en lecture seule des exigences (pièces requises + critères d'évaluation), téléchargement du fichier source — dernier sous-projet du Module 3.

**Architecture:** Une page Server Component charge l'AO et ses exigences ; un composant client (`AppelOffresDetail`) affiche le formulaire d'édition (désactivé tant que `statut_traitement ≠ 'termine'`) et les exigences en lecture seule. Nouvelle politique RLS `update` sur `appel_offres` (jamais ajoutée jusqu'ici, reportée deux fois) — pas sur `exigence_ao`, qui reste en lecture seule.

**Tech Stack:** Next.js (Server + Client Components), Supabase (Postgres, RLS), next-intl, shadcn/ui (Input, Label, Button, Badge), TypeScript, Vitest.

## Global Constraints

- Édition limitée aux champs de `appel_offres` (`titre`, `acheteur`, `secteur`, `date_limite`, `montant_caution`) — **aucune** édition d'`exigence_ao` dans ce sous-projet.
- **Aucune politique RLS `update` sur `exigence_ao`** — non nécessaire, exigences en lecture seule ici.
- La politique RLS `update` sur `appel_offres` doit avoir `using` **et** `with check` (même condition d'appartenance à l'entreprise), pour empêcher la réassignation d'une ligne à une autre entreprise.
- Page toujours accessible, jamais de redirection selon `statut_traitement` — formulaire désactivé si `≠ 'termine'`, pas de redirection.
- `statut_pipeline` reste hors de portée de cette page (Module 5).
- Un champ vidé dans le formulaire est enregistré comme `null`, pas rejeté.
- `date_limite` utilise un input `datetime-local` (pas un simple sélecteur de date) pour préserver l'heure limite.

---

### Task 1: Logique pure — conversion `date_limite` en valeur `datetime-local`

**Files:**
- Create: `lib/appels-offres/datetime-local.ts`
- Test: `lib/appels-offres/datetime-local.test.ts`

**Interfaces:**
- Consumes: rien (aucune dépendance sur un autre task de ce plan).
- Produces: `export function versValeurDatetimeLocal(dateIso: string | null): string` — consommé par Task 5 (`AppelOffresDetail`).

Le produit cible exclusivement la Côte d'Ivoire (fuseau GMT, UTC+0) et les
fonctions serverless Vercel tournent en UTC — traiter la valeur ISO comme
équivalente au fuseau local est donc correct pour ce marché, pas une
approximation risquée. Ce choix est documenté dans le commentaire du code.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/appels-offres/datetime-local.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { versValeurDatetimeLocal } from "./datetime-local";

describe("versValeurDatetimeLocal", () => {
  it("retourne une chaîne vide si la date est nulle", () => {
    expect(versValeurDatetimeLocal(null)).toBe("");
  });

  it("convertit une date ISO en valeur datetime-local", () => {
    expect(versValeurDatetimeLocal("2026-11-03T12:00:00.000Z")).toBe("2026-11-03T12:00");
  });

  it("tronque les secondes et millisecondes", () => {
    expect(versValeurDatetimeLocal("2026-11-03T12:30:45.123Z")).toBe("2026-11-03T12:30");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run lib/appels-offres/datetime-local.test.ts`

Expected: FAIL — `./datetime-local` n'existe pas encore.

- [ ] **Step 3: Créer `lib/appels-offres/datetime-local.ts`**

```ts
// La Côte d'Ivoire est en GMT (UTC+0) et les fonctions serverless Vercel
// tournent en UTC — traiter une date ISO comme équivalente à l'heure
// locale est donc correct pour ce marché, sans conversion de fuseau.
export function versValeurDatetimeLocal(dateIso: string | null): string {
  if (!dateIso) return "";
  return new Date(dateIso).toISOString().slice(0, 16);
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run lib/appels-offres/datetime-local.test.ts`

Expected: PASS, 3/3.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/datetime-local.ts lib/appels-offres/datetime-local.test.ts
git commit -m "feat(appels-offres): conversion date_limite vers valeur datetime-local"
```

---

### Task 2: Migration SQL — politique RLS `update` sur `appel_offres`

**Files:**
- Create: `supabase/migrations/<timestamp>_appel_offres_update_policy.sql`

**Interfaces:**
- Consumes: table `appel_offres` existante (`supabase/migrations/20260831140310_appel_offres.sql`).
- Produces: politique RLS `update` permettant à Task 4 (`modifierAppelOffres`) d'écrire sous session utilisateur.

`SUPABASE_ACCESS_TOKEN` est déjà présent dans `.env.local` (configuré lors
d'un sous-projet précédent de ce même module) — ce n'est normalement pas
un point de blocage, mais si `supabase db push` échoue pour une raison
d'authentification malgré tout, rapporter en `BLOCKED` plutôt que de
tenter une configuration non documentée ici.

- [ ] **Step 1: Créer le fichier de migration**

Run: `supabase migration new appel_offres_update_policy`

Expected: un fichier `supabase/migrations/<timestamp>_appel_offres_update_policy.sql` vide est créé.

- [ ] **Step 2: Écrire le contenu de la migration**

Remplacer le contenu du fichier généré par :

```sql
-- Politique RLS update sur appel_offres (Module 3, sous-projet 4B)
-- Reportée aux sous-projets 1 et 3 faute de besoin réel jusqu'ici.

create policy "appel_offres_update_membres" on appel_offres
  for update using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = appel_offres.entreprise_id and u.id = auth.uid()
    )
  );
```

- [ ] **Step 3: Appliquer la migration à la base Supabase distante**

Run: `supabase db push`

Expected: la migration s'applique sans erreur. Si la CLI demande confirmation, accepter.

- [ ] **Step 4: Vérifier que la migration existe réellement en base**

Run: `supabase migration list`

Expected: `<timestamp>_appel_offres_update_policy` apparaît dans la liste avec un statut appliqué (colonne "Remote" cochée).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): ajouter la politique RLS update sur appel_offres"
```

---

### Task 3: Traductions — namespace `AppelsOffres.detail`

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: rien (aucune dépendance sur un autre task de ce plan).
- Produces: clés `AppelsOffres.detail.*` — consommées par Task 5 (`AppelOffresDetail`) et Task 6 (`error.tsx`). Réutilise la clé existante `AppelsOffres.page.filAriane` pour le fil d'Ariane (pas de duplication).

- [ ] **Step 1: Ajouter le sous-objet `detail` dans `messages/fr.json`**

À l'intérieur de l'objet `"AppelsOffres"` existant, après `"error"`, ajouter :

```json
"detail": {
  "boutonTelecharger": "Télécharger le DAO",
  "messageTraitementEnCours": "Le traitement de ce dossier est en cours. Les informations extraites et les exigences apparaîtront ici une fois terminé.",
  "form": {
    "champTitre": "Titre",
    "champAcheteur": "Acheteur",
    "champSecteur": "Secteur",
    "champDateLimite": "Date limite de dépôt",
    "champMontantCaution": "Montant de la caution",
    "boutonEnregistrer": "Enregistrer",
    "envoiEnCours": "Enregistrement...",
    "toastEnregistre": "Modifications enregistrées"
  },
  "exigences": {
    "titreSommaire": "Sommaire attendu de l'offre",
    "titrePiecesRequises": "Pièces requises",
    "aucunePiece": "Aucune pièce requise identifiée.",
    "titreCriteres": "Critères d'évaluation",
    "aucunCritere": "Aucun critère d'évaluation identifié.",
    "source": "Source"
  },
  "error": {
    "message": "Impossible de charger cet appel d'offres.",
    "reessayer": "Réessayer"
  }
}
```

N'oublie pas d'ajouter une virgule après le `}` fermant de l'objet `"error"`
existant (celui de `AppelsOffres.error`, pas le nouveau) pour que `"detail"`
soit un sibling syntaxiquement valide.

- [ ] **Step 2: Ajouter le sous-objet `detail` équivalent dans `messages/en.json`**

```json
"detail": {
  "boutonTelecharger": "Download the tender document",
  "messageTraitementEnCours": "This file is still being processed. Extracted information and requirements will appear here once done.",
  "form": {
    "champTitre": "Title",
    "champAcheteur": "Buyer",
    "champSecteur": "Sector",
    "champDateLimite": "Submission deadline",
    "champMontantCaution": "Bond amount",
    "boutonEnregistrer": "Save",
    "envoiEnCours": "Saving...",
    "toastEnregistre": "Changes saved"
  },
  "exigences": {
    "titreSommaire": "Expected offer summary",
    "titrePiecesRequises": "Required documents",
    "aucunePiece": "No required document identified.",
    "titreCriteres": "Evaluation criteria",
    "aucunCritere": "No evaluation criterion identified.",
    "source": "Source"
  },
  "error": {
    "message": "Could not load this tender.",
    "reessayer": "Retry"
  }
}
```

- [ ] **Step 3: Vérifier que les fichiers JSON sont valides**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf-8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf-8')); console.log('JSON valide')"`

Expected: affiche `JSON valide`, aucune erreur de parsing.

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "feat(appels-offres): traductions de la page de détail"
```

---

### Task 4: Backend — lecture d'un AO, validation et modification

**Files:**
- Modify: `lib/appels-offres/queries.ts`
- Modify: `lib/appels-offres/schema.ts`
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `AppelOffres`, `ExigenceAo` de `./types` (déjà créés au sous-projet 1) ; `obtenirUtilisateurCourant` de `@/lib/utilisateur/queries` (déjà créé) ; politique RLS `update` sur `appel_offres` (Task 2).
- Produces:
  - `queries.ts` : `export async function obtenirAppelOffres(id: string, entrepriseId: string): Promise<{appelOffres: AppelOffres; exigences: ExigenceAo[]} | null>` — consommé par Task 6 (`page.tsx`).
  - `schema.ts` : `export const modifierAppelOffresSchema`, `export type ModifierAppelOffresInput` — consommé par `actions.ts` ci-dessous.
  - `actions.ts` : `export async function modifierAppelOffres(appelOffresId: string, formData: FormData): Promise<{erreur: string} | {succes: true}>` et `export async function genererUrlTelechargementDao(cheminStockage: string): Promise<{erreur: string} | {url: string}>` — tous deux consommés par Task 5 (`AppelOffresDetail`).

Pas de test automatisé pour ce backend — même convention que le reste de
`lib/appels-offres/`/`lib/documents/`. Vérification manuelle au Task 6.

- [ ] **Step 1: Ajouter `obtenirAppelOffres` dans `lib/appels-offres/queries.ts`**

Remplacer le contenu du fichier par :

```ts
import { createClient } from "@/lib/supabase/server";
import type { AppelOffres, ExigenceAo } from "./types";

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

export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
): Promise<{ appelOffres: AppelOffres; exigences: ExigenceAo[] } | null> {
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

  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: (exigences ?? []) as ExigenceAo[],
  };
}
```

- [ ] **Step 2: Ajouter `modifierAppelOffresSchema` dans `lib/appels-offres/schema.ts`**

Ajouter à la fin du fichier existant (après `televerserDaoSchema`) :

```ts
const champOptionnel = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null));

export const modifierAppelOffresSchema = z.object({
  titre: champOptionnel,
  acheteur: champOptionnel,
  secteur: champOptionnel,
  dateLimite: champOptionnel,
  montantCaution: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? Number(v) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Montant invalide",
    }),
});

export type ModifierAppelOffresInput = z.infer<typeof modifierAppelOffresSchema>;
```

- [ ] **Step 3: Ajouter les deux fonctions dans `lib/appels-offres/actions.ts`**

Ajouter les imports suivants en haut du fichier existant, avec les autres imports :

```ts
import { modifierAppelOffresSchema } from "./schema";
```

(le fichier importe déjà `televerserDaoSchema` depuis `./schema` — ajouter
`modifierAppelOffresSchema` à côté, dans le même import ou un import
séparé, peu importe tant que les deux sont importés)

Ajouter à la fin du fichier :

```ts
export async function modifierAppelOffres(
  appelOffresId: string,
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierAppelOffresSchema.safeParse({
    titre: formData.get("titre"),
    acheteur: formData.get("acheteur"),
    secteur: formData.get("secteur"),
    dateLimite: formData.get("dateLimite"),
    montantCaution: formData.get("montantCaution"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { titre, acheteur, secteur, dateLimite, montantCaution } = parsed.data;
  const dateLimiteIso = dateLimite ? `${dateLimite}:00Z` : null;

  const supabase = await createClient();

  const { error } = await supabase
    .from("appel_offres")
    .update({
      titre,
      acheteur,
      secteur,
      date_limite: dateLimiteIso,
      montant_caution: montantCaution,
    })
    .eq("id", appelOffresId);

  if (error) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function genererUrlTelechargementDao(
  cheminStockage: string,
): Promise<{ erreur: string } | { url: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Impossible de générer le lien." };
  return { url: data.signedUrl };
}
```

- [ ] **Step 4: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 5: Vérifier que la suite de tests complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent, aucune régression.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/queries.ts lib/appels-offres/schema.ts lib/appels-offres/actions.ts
git commit -m "feat(appels-offres): lecture, validation et modification d'un AO"
```

---

### Task 5: Composant `AppelOffresDetail`

**Files:**
- Create: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`

**Interfaces:**
- Consumes: `versValeurDatetimeLocal` de `@/lib/appels-offres/datetime-local` (Task 1) ; namespace `AppelsOffres.detail` (Task 3) ; `modifierAppelOffres`, `genererUrlTelechargementDao` de `@/lib/appels-offres/actions` (Task 4) ; `StatutTraitementBadge` de `../statut-traitement-badge` (déjà créé au sous-projet 4A) ; `AppelOffres`, `ExigenceAo` de `@/lib/appels-offres/types` (déjà créés).
- Produces: `export function AppelOffresDetail({ appelOffres, exigences }: { appelOffres: AppelOffres; exigences: ExigenceAo[] }): JSX.Element` — consommé par Task 6 (`page.tsx`).

Pas de test automatisé (composant React interactif, même convention que
`AppelOffresTable`/`TeleverserDaoDialog`).

- [ ] **Step 1: Créer `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { StatutTraitementBadge } from "../statut-traitement-badge";
import {
  modifierAppelOffres,
  genererUrlTelechargementDao,
} from "@/lib/appels-offres/actions";
import { versValeurDatetimeLocal } from "@/lib/appels-offres/datetime-local";
import type { AppelOffres, ExigenceAo } from "@/lib/appels-offres/types";

export function AppelOffresDetail({
  appelOffres,
  exigences,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
}) {
  const t = useTranslations("AppelsOffres.detail");
  const [envoi, setEnvoi] = useState(false);
  const [telechargement, setTelechargement] = useState(false);

  const pret = appelOffres.statut_traitement === "termine";

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await modifierAppelOffres(appelOffres.id, formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success(t("form.toastEnregistre"));
  }

  async function telecharger() {
    setTelechargement(true);
    const resultat = await genererUrlTelechargementDao(appelOffres.fichier_dao_path);
    setTelechargement(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const criteresEvaluation = exigences.filter((e) => e.type_exigence === "critere_evaluation");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <StatutTraitementBadge
          statut={appelOffres.statut_traitement}
          erreurTraitement={appelOffres.erreur_traitement}
        />
        <Button variant="outline" onClick={telecharger} disabled={telechargement}>
          {t("boutonTelecharger")}
        </Button>
      </div>

      {!pret && (
        <p className="text-muted-foreground">
          {appelOffres.statut_traitement === "erreur"
            ? appelOffres.erreur_traitement
            : t("messageTraitementEnCours")}
        </p>
      )}

      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="titre">{t("form.champTitre")}</Label>
          <Input
            id="titre"
            name="titre"
            defaultValue={appelOffres.titre ?? ""}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="acheteur">{t("form.champAcheteur")}</Label>
          <Input
            id="acheteur"
            name="acheteur"
            defaultValue={appelOffres.acheteur ?? ""}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="secteur">{t("form.champSecteur")}</Label>
          <Input
            id="secteur"
            name="secteur"
            defaultValue={appelOffres.secteur ?? ""}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="dateLimite">{t("form.champDateLimite")}</Label>
          <Input
            id="dateLimite"
            name="dateLimite"
            type="datetime-local"
            defaultValue={versValeurDatetimeLocal(appelOffres.date_limite)}
            disabled={!pret}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="montantCaution">{t("form.champMontantCaution")}</Label>
          <Input
            id="montantCaution"
            name="montantCaution"
            type="number"
            defaultValue={appelOffres.montant_caution ?? ""}
            disabled={!pret}
          />
        </div>

        <Button type="submit" disabled={!pret || envoi}>
          {envoi ? t("form.envoiEnCours") : t("form.boutonEnregistrer")}
        </Button>
      </form>

      {pret && (
        <>
          {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{t("exigences.titreSommaire")}</h2>
              <ul className="list-disc pl-5 text-sm">
                {appelOffres.sommaire_attendu.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("exigences.titrePiecesRequises")}</h2>
            {piecesRequises.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("exigences.aucunePiece")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
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
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("exigences.titreCriteres")}</h2>
            {criteresEvaluation.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("exigences.aucunCritere")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {criteresEvaluation.map((exigence) => (
                  <li
                    key={exigence.id}
                    className="flex items-center justify-between border-b pb-2"
                  >
                    <div>
                      <p className="font-medium">{exigence.libelle}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("exigences.source")} : {exigence.source_section}
                      </p>
                    </div>
                    {exigence.ponderation !== null && (
                      <Badge variant="outline">{exigence.ponderation}%</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
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
git add "app/(app)/appels-offres/[id]/appel-offres-detail.tsx"
git commit -m "feat(appels-offres): composant AppelOffresDetail"
```

---

### Task 6: Page `/appels-offres/[id]` (shell : page, chargement, erreur)

**Files:**
- Create: `app/(app)/appels-offres/[id]/page.tsx`
- Create: `app/(app)/appels-offres/[id]/loading.tsx`
- Create: `app/(app)/appels-offres/[id]/error.tsx`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant` de `@/lib/utilisateur/queries` (déjà créé) ; `obtenirAppelOffres` de `@/lib/appels-offres/queries` (Task 4) ; `AppelOffresDetail` (Task 5) ; `AnnoncerFilAriane` de `@/components/annoncer-fil-ariane` (déjà créé) ; namespace `AppelsOffres.page`/`AppelsOffres.detail.error` (namespace `page` déjà créé au sous-projet 4A, `detail.error` créé à la Task 3).
- Produces: route `/appels-offres/[id]` fonctionnelle — dernière pièce du Module 3.

**Note sur les conventions Next.js de ce projet** : ce dépôt utilise une
version modifiée de Next.js (voir l'avertissement en tête de `CLAUDE.md` :
lire `node_modules/next/dist/docs/` avant d'écrire du code si un doute
subsiste sur une convention). Le code ci-dessous suppose la convention
App Router standard récente pour une route dynamique (`params` fourni
comme une `Promise` à `await`) — vérifier cette hypothèse avant de
finaliser si quoi que ce soit dans les docs locales du dépôt suggère une
différence.

- [ ] **Step 1: Créer `app/(app)/appels-offres/[id]/page.tsx`**

```tsx
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { obtenirAppelOffres } from "@/lib/appels-offres/queries";
import { AppelOffresDetail } from "./appel-offres-detail";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";

export default async function AppelOffresDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const resultat = await obtenirAppelOffres(id, utilisateur.entreprise_id);
  if (!resultat) notFound();

  const tPage = await getTranslations("AppelsOffres.page");
  const titre = resultat.appelOffres.titre ?? resultat.appelOffres.fichier_dao_nom_original;

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane
        items={[
          { label: tPage("filAriane"), href: "/appels-offres" },
          { label: titre },
        ]}
      />
      <h1 className="text-2xl font-bold">{titre}</h1>
      <AppelOffresDetail appelOffres={resultat.appelOffres} exigences={resultat.exigences} />
    </div>
  );
}
```

- [ ] **Step 2: Créer `app/(app)/appels-offres/[id]/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementAppelOffresDetail() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
```

- [ ] **Step 3: Créer `app/(app)/appels-offres/[id]/error.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";

export default function ErreurAppelOffresDetail({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const t = useTranslations("AppelsOffres.detail.error");

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

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/appels-offres/[id]/page.tsx" "app/(app)/appels-offres/[id]/loading.tsx" "app/(app)/appels-offres/[id]/error.tsx"
git commit -m "feat(appels-offres): page de détail et d'édition d'un AO"
```

---

### Task 7: Lien depuis la liste vers le détail

**Files:**
- Modify: `app/(app)/appels-offres/appel-offres-table.tsx`

**Interfaces:**
- Consumes: route `/appels-offres/[id]` (Task 6).
- Produces: rien consommé par une tâche suivante — dernière tâche de ce plan.

- [ ] **Step 1: Ajouter l'import de `Link`**

En haut de `app/(app)/appels-offres/appel-offres-table.tsx`, avec les
autres imports :

```ts
import Link from "next/link";
```

- [ ] **Step 2: Rendre le titre cliquable**

Remplacer :

```tsx
                <TableCell>{ao.titre ?? ao.fichier_dao_nom_original}</TableCell>
```

par :

```tsx
                <TableCell>
                  <Link
                    href={`/appels-offres/${ao.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {ao.titre ?? ao.fichier_dao_nom_original}
                  </Link>
                </TableCell>
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Vérifier que la suite de tests complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent, aucune régression.

- [ ] **Step 5: Vérification manuelle**

Lancer `npm run dev`, ouvrir `/appels-offres`, cliquer sur le titre d'un
AO :
- Un AO `termine` affiche le formulaire actif pré-rempli, les exigences
  groupées (pièces/critères) avec leur `source_section`, et un bouton de
  téléchargement fonctionnel.
- Un AO non `termine` affiche le message d'état approprié et un formulaire
  désactivé.
- Modifier un champ sur un AO `termine`, enregistrer, recharger la page :
  la modification persiste.

Documenter le résultat (description ou capture) avant de considérer la
tâche terminée. Si l'environnement d'exécution ne peut pas atteindre le
projet Supabase (comme observé lors du sous-projet 4A) ou authentifier un
utilisateur, rapporter précisément ce qui a pu être vérifié malgré tout
(compilation, code) et ce qui reste bloqué, en `DONE_WITH_CONCERNS` plutôt
que `BLOCKED` pur — le reste du sous-projet reste valide indépendamment.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/appels-offres/appel-offres-table.tsx"
git commit -m "feat(appels-offres): lien vers le détail depuis la liste"
```

---
