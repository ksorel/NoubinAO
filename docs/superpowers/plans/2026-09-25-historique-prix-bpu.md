# Historique de prix par ligne BPU (suggestion active) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quand une ligne BPU est saisie sans prix, suggérer automatiquement le prix déjà pratiqué pour une désignation proche sur un AO précédent de la même entreprise, avec sa provenance (désignation d'origine, AO, date), sans jamais l'imposer.

**Architecture:** Fonction pure de scoring (`trouverMeilleureSuggestionPrix`, mots-clés + filtre dur sur l'unité) alimentée par une nouvelle Server Action de lecture (`obtenirSuggestionPrixBpu`) qui interroge `ligne_bpu`/`section_bpu`/`appel_offres` en trois requêtes séquentielles, scopée à l'entreprise. `bpu-ligne-row.tsx` appelle cette action au blur du champ désignation et affiche un bandeau sous la ligne avec un bouton « Utiliser ». Aucune migration : toutes les données existent déjà.

**Tech Stack:** Next.js App Router (Server Actions), Supabase Postgres/RLS (lecture seule pour ce sous-projet), next-intl, Vitest, shadcn/ui (`Button`, `TableRow`, `TableCell`).

## Global Constraints

- Spec source : `docs/superpowers/specs/2026-09-25-historique-prix-bpu-design.md`.
- **Unité = filtre dur.** Une ligne historique n'est jamais candidate si son `unite` (trim + lowercase) diffère de celle de la ligne en cours.
- **Score par mots-clés uniquement** (`extraireMotsCles`, `lib/texte/mots-cles.ts`), zéro appel IA. Aucun mot-clé commun → `null`, jamais de tri hasardeux.
- **Une seule suggestion**, la meilleure. Égalité de score → la ligne historique la plus récente (`appel_offres.created_at` le plus grand) l'emporte.
- **Périmètre historique : toute ligne chiffrée (`prix_unitaire` non nul), tout AO différent de l'AO courant, quel que soit le statut pipeline.**
- **Bandeau automatique**, pas de bouton de déclenchement manuel. Apparaît seulement si `prix_unitaire` de la ligne courante est vide au moment du blur désignation.
- **Provenance éphémère** : aucune nouvelle colonne, aucun lien persisté vers la ligne d'origine une fois le prix accepté.
- **Aucune migration SQL** pour ce sous-projet — toutes les tables/colonnes nécessaires existent déjà.
- **Aucun test sur la Server Action ni sur `bpu-ligne-row.tsx`** — seule la fonction pure `trouverMeilleureSuggestionPrix` est testée (TDD), cohérent avec le reste du projet (`bpu.test.ts`, `suggestion-document.test.ts`).
- Montants affichés via `toLocaleString("fr-FR")`, dates via `toLocaleDateString("fr-FR")`, cohérent avec le reste du BPU.
- `enregistrer()` dans `bpu-ligne-row.tsx` prend un paramètre optionnel `prixOverride?: string` — ne jamais enchaîner `setState` puis lire l'état dans le même tick (piège de fermeture déjà rencontré sur ce projet, mémoire `noubinao_functional_state_updates`).

---

### Task 1: Module pur de scoring — `lib/appels-offres/suggestion-prix-bpu.ts`

**Files:**
- Create: `lib/appels-offres/suggestion-prix-bpu.ts`
- Test: `lib/appels-offres/suggestion-prix-bpu.test.ts`

**Interfaces:**
- Consumes: `extraireMotsCles(texte: string): string[]` depuis `@/lib/texte/mots-cles` (existant, inchangé).
- Produces (consommé par Task 2) :
  - `interface LigneBpuHistorique { designation: string; unite: string; prixUnitaire: number; appelOffresId: string; appelOffresTitre: string | null; appelOffresCreatedAt: string; }`
  - `interface SuggestionPrixBpu { prixUnitaire: number; designationOrigine: string; appelOffresTitre: string | null; appelOffresCreatedAt: string; }`
  - `function trouverMeilleureSuggestionPrix(designation: string, lignesHistoriques: LigneBpuHistorique[]): SuggestionPrixBpu | null`

- [ ] **Step 1: Écrire les tests (échouent, le module n'existe pas encore)**

Créer `lib/appels-offres/suggestion-prix-bpu.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { trouverMeilleureSuggestionPrix, type LigneBpuHistorique } from "./suggestion-prix-bpu";

function creerLigne(overrides: Partial<LigneBpuHistorique> = {}): LigneBpuHistorique {
  return {
    designation: "Fourniture et pose de béton armé dosé à 350 kg/m³",
    unite: "m3",
    prixUnitaire: 45000,
    appelOffresId: "ao1",
    appelOffresTitre: "Construction école Yopougon",
    appelOffresCreatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("trouverMeilleureSuggestionPrix", () => {
  it("retourne null quand aucune ligne historique ne partage de mot-clé", () => {
    const lignes = [
      creerLigne({ designation: "Terrassement en pleine masse" }),
    ];
    expect(trouverMeilleureSuggestionPrix("Peinture murale intérieure", lignes)).toBeNull();
  });

  it("retourne null quand la liste historique est vide", () => {
    expect(trouverMeilleureSuggestionPrix("Béton armé", [])).toBeNull();
  });

  it("retourne null quand la désignation recherchée n'a aucun mot-clé exploitable", () => {
    const lignes = [creerLigne()];
    // "de la" : uniquement des mots vides / trop courts, filtrés par extraireMotsCles.
    expect(trouverMeilleureSuggestionPrix("de la", lignes)).toBeNull();
  });

  it("retourne la ligne dont la désignation partage des mots-clés, avec son prix", () => {
    const lignes = [creerLigne({ prixUnitaire: 45000 })];
    const resultat = trouverMeilleureSuggestionPrix("Béton armé dosé à 350 kg/m³", lignes);
    expect(resultat).not.toBeNull();
    expect(resultat?.prixUnitaire).toBe(45000);
    expect(resultat?.designationOrigine).toBe(
      "Fourniture et pose de béton armé dosé à 350 kg/m³",
    );
  });

  it("retient la ligne au score le plus élevé entre plusieurs candidates", () => {
    const lignes = [
      creerLigne({
        designation: "Terrassement en pleine masse",
        prixUnitaire: 3000,
        appelOffresId: "ao1",
      }),
      creerLigne({
        designation: "Fourniture et pose de béton armé dosé à 350 kg/m³",
        prixUnitaire: 45000,
        appelOffresId: "ao2",
      }),
    ];
    const resultat = trouverMeilleureSuggestionPrix("Béton armé dosé à 350 kg/m³", lignes);
    expect(resultat?.prixUnitaire).toBe(45000);
  });

  it("départage un score égal par la ligne la plus récente", () => {
    const ligneAncienne = creerLigne({
      appelOffresId: "ao1",
      prixUnitaire: 40000,
      appelOffresCreatedAt: "2026-01-01T00:00:00Z",
    });
    const ligneRecente = creerLigne({
      appelOffresId: "ao2",
      prixUnitaire: 47000,
      appelOffresCreatedAt: "2026-06-01T00:00:00Z",
    });
    const resultat = trouverMeilleureSuggestionPrix(
      "Béton armé dosé à 350 kg/m³",
      [ligneAncienne, ligneRecente],
    );
    expect(resultat?.prixUnitaire).toBe(47000);
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec attendu**

Run: `npx vitest run lib/appels-offres/suggestion-prix-bpu.test.ts`
Expected: FAIL — `Cannot find module './suggestion-prix-bpu'`

- [ ] **Step 3: Implémenter le module**

Créer `lib/appels-offres/suggestion-prix-bpu.ts` :

```ts
import { extraireMotsCles } from "@/lib/texte/mots-cles";

export interface LigneBpuHistorique {
  designation: string;
  unite: string;
  prixUnitaire: number;
  appelOffresId: string;
  appelOffresTitre: string | null;
  appelOffresCreatedAt: string;
}

export interface SuggestionPrixBpu {
  prixUnitaire: number;
  designationOrigine: string;
  appelOffresTitre: string | null;
  appelOffresCreatedAt: string;
}

// Parmi les lignes BPU historiques (déjà filtrées à la même unité en amont,
// voir obtenirSuggestionPrixBpu dans actions.ts — le filtre unité est un
// filtre dur, pas un critère de score), retient celle dont la désignation
// partage le plus de mots-clés avec la désignation en cours. Aucun
// chevauchement : aucune suggestion, plutôt que proposer un prix sans
// rapport. Égalité de score : la ligne la plus récente l'emporte.
export function trouverMeilleureSuggestionPrix(
  designation: string,
  lignesHistoriques: LigneBpuHistorique[],
): SuggestionPrixBpu | null {
  const motsRecherches = extraireMotsCles(designation);
  if (motsRecherches.length === 0) return null;

  let meilleure: LigneBpuHistorique | null = null;
  let meilleurScore = 0;

  for (const ligne of lignesHistoriques) {
    const motsLigne = new Set(extraireMotsCles(ligne.designation));
    const score = motsRecherches.filter((mot) => motsLigne.has(mot)).length;
    if (score === 0) continue;

    if (
      meilleure === null ||
      score > meilleurScore ||
      (score === meilleurScore && ligne.appelOffresCreatedAt > meilleure.appelOffresCreatedAt)
    ) {
      meilleure = ligne;
      meilleurScore = score;
    }
  }

  if (meilleure === null) return null;
  return {
    prixUnitaire: meilleure.prixUnitaire,
    designationOrigine: meilleure.designation,
    appelOffresTitre: meilleure.appelOffresTitre,
    appelOffresCreatedAt: meilleure.appelOffresCreatedAt,
  };
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/suggestion-prix-bpu.test.ts`
Expected: PASS (6/6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/suggestion-prix-bpu.ts lib/appels-offres/suggestion-prix-bpu.test.ts
git commit -m "feat: module de scoring pour l'historique de prix BPU"
```

---

### Task 2: Server Action `obtenirSuggestionPrixBpu`

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes:
  - `trouverMeilleureSuggestionPrix`, `type LigneBpuHistorique`, `type SuggestionPrixBpu` depuis `./suggestion-prix-bpu` (Task 1).
  - `obtenirUtilisateurCourant(): Promise<{ id: string; entreprise_id: string; nom: string } | null>` depuis `@/lib/utilisateur/queries` (déjà importé dans `actions.ts`).
- Produces (consommé par Task 4) :
  - `async function obtenirSuggestionPrixBpu(appelOffresId: string, designation: string, unite: string): Promise<SuggestionPrixBpu | null>`

- [ ] **Step 1: Ajouter l'import du nouveau module**

Dans `lib/appels-offres/actions.ts`, après le bloc d'imports existant (après la ligne `import { genererJalonsParDefaut } from "./retroplanning";`), ajouter :

```ts
import {
  trouverMeilleureSuggestionPrix,
  type LigneBpuHistorique,
} from "./suggestion-prix-bpu";
```

- [ ] **Step 2: Ajouter la Server Action**

À la fin de `lib/appels-offres/actions.ts`, ajouter :

```ts
// Lecture seule, appelée depuis le client au blur du champ désignation
// (bpu-ligne-row.tsx). Best-effort : toute absence de résultat (aucun
// autre AO, aucune ligne chiffrée, aucun mot-clé commun) retourne null
// sans erreur, le bandeau de suggestion reste simplement absent.
export async function obtenirSuggestionPrixBpu(
  appelOffresId: string,
  designation: string,
  unite: string,
) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return null;

  const uniteNormalisee = unite.trim().toLowerCase();
  if (designation.trim().length === 0 || uniteNormalisee.length === 0) return null;

  const supabase = await createClient();

  const { data: autresAppelsOffres } = await supabase
    .from("appel_offres")
    .select("id, titre, fichier_dao_nom_original, created_at")
    .eq("entreprise_id", utilisateur.entreprise_id)
    .neq("id", appelOffresId);

  if (!autresAppelsOffres || autresAppelsOffres.length === 0) return null;

  const { data: sections } = await supabase
    .from("section_bpu")
    .select("id, appel_offres_id")
    .in(
      "appel_offres_id",
      autresAppelsOffres.map((ao) => ao.id),
    );

  if (!sections || sections.length === 0) return null;

  const { data: lignes } = await supabase
    .from("ligne_bpu")
    .select("designation, unite, prix_unitaire, section_bpu_id")
    .in(
      "section_bpu_id",
      sections.map((s) => s.id),
    )
    .not("prix_unitaire", "is", null);

  if (!lignes || lignes.length === 0) return null;

  const aoParSection = new Map(sections.map((s) => [s.id, s.appel_offres_id]));
  const aoParId = new Map(autresAppelsOffres.map((ao) => [ao.id, ao]));

  const lignesHistoriques: LigneBpuHistorique[] = lignes
    .filter((l) => l.unite.trim().toLowerCase() === uniteNormalisee)
    .map((l) => {
      const idAppelOffres = aoParSection.get(l.section_bpu_id)!;
      const ao = aoParId.get(idAppelOffres)!;
      return {
        designation: l.designation,
        unite: l.unite,
        prixUnitaire: l.prix_unitaire as number,
        appelOffresId: idAppelOffres,
        appelOffresTitre: ao.titre ?? ao.fichier_dao_nom_original,
        appelOffresCreatedAt: ao.created_at,
      };
    });

  return trouverMeilleureSuggestionPrix(designation, lignesHistoriques);
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur de type dans `lib/appels-offres/actions.ts` ni `lib/appels-offres/suggestion-prix-bpu.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat: Server Action obtenirSuggestionPrixBpu"
```

---

### Task 3: Traductions FR/EN

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Produces (consommé par Task 4) : clés `AppelsOffres.detail.bpu.suggestionPrix`, `.suggestionPrixAoSansTitre`, `.suggestionPrixUtiliser`, `.suggestionPrixIgnorer`, lues via `useTranslations("AppelsOffres.detail.bpu")` (namespace déjà utilisé dans `bpu-ligne-row.tsx`).

- [ ] **Step 1: Ajouter les clés dans `messages/fr.json`**

Dans le bloc `"bpu": { ... }` (autour de la ligne 295), juste avant la clé de fermeture `"annuler": "Annuler"`, ajouter :

```json
        "annuler": "Annuler",
        "suggestionPrix": "Prix suggéré : {prix} FCFA ({designationOrigine} — {aoTitre}, {date})",
        "suggestionPrixAoSansTitre": "AO sans titre",
        "suggestionPrixUtiliser": "Utiliser",
        "suggestionPrixIgnorer": "Ignorer"
```

(remplace la ligne `"annuler": "Annuler"` existante, qui n'a plus de virgule de fermeture puisque suivie de nouvelles clés).

- [ ] **Step 2: Ajouter les clés équivalentes dans `messages/en.json`**

Dans le bloc `"bpu": { ... }` (autour de la ligne 295), même emplacement :

```json
        "annuler": "Cancel",
        "suggestionPrix": "Suggested price: {prix} FCFA ({designationOrigine} — {aoTitre}, {date})",
        "suggestionPrixAoSansTitre": "Untitled tender",
        "suggestionPrixUtiliser": "Use",
        "suggestionPrixIgnorer": "Dismiss"
```

- [ ] **Step 3: Vérifier que les deux fichiers JSON restent valides**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "feat: traductions du bandeau de suggestion de prix BPU"
```

---

### Task 4: Interface — bandeau de suggestion dans `bpu-ligne-row.tsx`

**Files:**
- Modify: `app/(app)/appels-offres/[id]/bpu-ligne-row.tsx`

**Interfaces:**
- Consumes:
  - `obtenirSuggestionPrixBpu(appelOffresId: string, designation: string, unite: string): Promise<SuggestionPrixBpu | null>` depuis `@/lib/appels-offres/actions` (Task 2).
  - `type SuggestionPrixBpu` depuis `@/lib/appels-offres/suggestion-prix-bpu` (Task 1).
  - Clés i18n `suggestionPrix`, `suggestionPrixAoSansTitre`, `suggestionPrixUtiliser`, `suggestionPrixIgnorer` (Task 3).

- [ ] **Step 1: Ajouter les imports**

Dans `app/(app)/appels-offres/[id]/bpu-ligne-row.tsx`, le bloc d'imports actuel :

```tsx
import {
  modifierLigneBpu,
  deplacerLigneBpu,
  supprimerLigneBpu,
} from "@/lib/appels-offres/actions";
import { calculerMontantLigne, calculerPyramideCout } from "@/lib/appels-offres/bpu";
import type { LigneBpu } from "@/lib/appels-offres/types";
```

devient :

```tsx
import {
  modifierLigneBpu,
  deplacerLigneBpu,
  supprimerLigneBpu,
  obtenirSuggestionPrixBpu,
} from "@/lib/appels-offres/actions";
import { calculerMontantLigne, calculerPyramideCout } from "@/lib/appels-offres/bpu";
import type { LigneBpu } from "@/lib/appels-offres/types";
import type { SuggestionPrixBpu } from "@/lib/appels-offres/suggestion-prix-bpu";
```

- [ ] **Step 2: Ajouter l'état local de suggestion**

Après la ligne existante `const [deplie, setDeplie] = useState(false);`, ajouter :

```tsx
  const [suggestion, setSuggestion] = useState<SuggestionPrixBpu | null>(null);
```

- [ ] **Step 3: Donner à `enregistrer` un paramètre optionnel `prixOverride`**

La fonction actuelle :

```tsx
  async function enregistrer() {
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: prixUnitaire.trim().length > 0 ? prixUnitaire : null,
      debourseSec: debourseSec.trim().length > 0 ? debourseSec : null,
      tauxFraisStructure: tauxFraisStructure.trim().length > 0 ? tauxFraisStructure : null,
    };
```

devient :

```tsx
  async function enregistrer(prixOverride?: string) {
    const prixEffectif = prixOverride ?? prixUnitaire;
    const input = {
      codeArticle: codeArticle.trim().length > 0 ? codeArticle : null,
      designation,
      unite,
      quantite,
      prixUnitaire: prixEffectif.trim().length > 0 ? prixEffectif : null,
      debourseSec: debourseSec.trim().length > 0 ? debourseSec : null,
      tauxFraisStructure: tauxFraisStructure.trim().length > 0 ? tauxFraisStructure : null,
    };
```

Le reste de la fonction (appel à `modifierLigneBpu`, mise à jour de `onLignesModifiees`) reste inchangé — il lit déjà `input.prixUnitaire`, pas `prixUnitaire` directement.

- [ ] **Step 4: Ajouter le handler dédié au blur de la désignation**

Juste après la fonction `enregistrer` (avant `async function deplacer`), ajouter :

```tsx
  async function surBlurDesignation() {
    await enregistrer();
    if (prixUnitaire.trim().length > 0) {
      setSuggestion(null);
      return;
    }
    const resultat = await obtenirSuggestionPrixBpu(appelOffresId, designation, unite);
    setSuggestion(resultat);
  }
```

- [ ] **Step 5: Brancher le nouveau handler sur le champ désignation, et vider la suggestion quand le prix est modifié manuellement**

Le champ désignation actuel :

```tsx
        <TableCell>
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            onBlur={enregistrer}
            aria-label={t("colonneDesignation")}
          />
        </TableCell>
```

devient :

```tsx
        <TableCell>
          <Input
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            onBlur={surBlurDesignation}
            aria-label={t("colonneDesignation")}
          />
        </TableCell>
```

Le champ prix unitaire actuel :

```tsx
        <TableCell>
          <Input
            type="number"
            value={prixUnitaire}
            onChange={(e) => setPrixUnitaire(e.target.value)}
            onBlur={enregistrer}
            aria-label={t("colonnePrixUnitaire")}
            className="w-28"
          />
        </TableCell>
```

devient :

```tsx
        <TableCell>
          <Input
            type="number"
            value={prixUnitaire}
            onChange={(e) => {
              setPrixUnitaire(e.target.value);
              setSuggestion(null);
            }}
            onBlur={() => enregistrer()}
            aria-label={t("colonnePrixUnitaire")}
            className="w-28"
          />
        </TableCell>
```

(`onBlur={() => enregistrer()}` plutôt que `onBlur={enregistrer}` : `enregistrer` accepte maintenant un paramètre optionnel, mais `onBlur` passe l'événement React en premier argument — sans ce wrapper, `enregistrer` recevrait l'événement comme `prixOverride`.)

- [ ] **Step 6: Appliquer le même garde-fou aux cinq autres champs qui appellent encore `enregistrer` nu au blur**

`enregistrer` accepte désormais un paramètre optionnel (Step 3) : **tout** `onBlur={enregistrer}` restant recevrait l'événement React comme `prixOverride`, et `prixEffectif.trim()` planterait (l'événement n'a pas de méthode `.trim`). Cinq champs sont concernés — code article, unité, quantité, déboursé sec, taux de frais de structure. Remplacer partout `onBlur={enregistrer}` par `onBlur={() => enregistrer()}`.

Champ code article :

```tsx
        <TableCell>
          <Input
            value={codeArticle}
            onChange={(e) => setCodeArticle(e.target.value)}
            onBlur={() => enregistrer()}
            aria-label={t("colonneCode")}
            className="w-20"
          />
        </TableCell>
```

Champ unité :

```tsx
        <TableCell>
          <Input
            value={unite}
            onChange={(e) => setUnite(e.target.value)}
            onBlur={() => enregistrer()}
            aria-label={t("colonneUnite")}
            className="w-20"
          />
        </TableCell>
```

Champ quantité :

```tsx
        <TableCell>
          <Input
            type="number"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            onBlur={() => enregistrer()}
            aria-label={t("colonneQuantite")}
            className="w-24"
          />
        </TableCell>
```

Champ déboursé sec (dans le bloc `{deplie && ( ... )}`) :

```tsx
                <Input
                  type="number"
                  value={debourseSec}
                  onChange={(e) => setDebourseSec(e.target.value)}
                  onBlur={() => enregistrer()}
                  aria-label={t("colonneDebourseSec")}
                  className="w-32"
                />
```

Champ taux de frais de structure (même bloc) :

```tsx
                <Input
                  type="number"
                  value={tauxFraisStructure}
                  onChange={(e) => setTauxFraisStructure(e.target.value)}
                  onBlur={() => enregistrer()}
                  aria-label={t("colonneTauxFraisStructure")}
                  className="w-24"
                />
```

- [ ] **Step 7: Ajouter le bandeau de suggestion**

Juste après le bloc `{deplie && ( ... )}` existant (avant le `</>`  final qui ferme le fragment), ajouter :

```tsx
      {suggestion && (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/50 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>
                {t("suggestionPrix", {
                  prix: suggestion.prixUnitaire.toLocaleString("fr-FR"),
                  designationOrigine: suggestion.designationOrigine,
                  aoTitre: suggestion.appelOffresTitre ?? t("suggestionPrixAoSansTitre"),
                  date: new Date(suggestion.appelOffresCreatedAt).toLocaleDateString("fr-FR"),
                })}
              </span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const prix = String(suggestion.prixUnitaire);
                    setPrixUnitaire(prix);
                    await enregistrer(prix);
                    setSuggestion(null);
                  }}
                >
                  {t("suggestionPrixUtiliser")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSuggestion(null)}
                >
                  {t("suggestionPrixIgnorer")}
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
```

Le fichier se termine donc ainsi (fragment complet) :

```tsx
      {deplie && (
        <TableRow>
          {/* ... contenu existant inchangé ... */}
        </TableRow>
      )}
      {suggestion && (
        <TableRow>
          {/* ... bloc ajouté ci-dessus ... */}
        </TableRow>
      )}
    </>
  );
}
```

- [ ] **Step 8: Vérifier que le projet compile**

Run: `npx tsc --noEmit`
Expected: aucune erreur de type dans `bpu-ligne-row.tsx`.

- [ ] **Step 9: Lancer la suite de tests complète (non-régression)**

Run: `npx vitest run`
Expected: tous les tests passent, y compris `lib/appels-offres/bpu.test.ts` et `lib/appels-offres/suggestion-prix-bpu.test.ts`.

- [ ] **Step 10: Vérification manuelle en local**

Démarrer le serveur de dev (`npm run dev`), ouvrir un AO avec au moins deux lignes BPU chiffrées sur des unités identiques mais des désignations proches, réparties sur deux AO différents de la même entreprise. Sur un troisième AO (ou une nouvelle section du même AO cible), créer une ligne avec une désignation partageant des mots-clés et la même unité, laisser le prix vide, sortir du champ désignation (blur). Vérifier :
- le bandeau apparaît avec le bon prix, la bonne désignation d'origine, le bon titre d'AO et la bonne date ;
- cliquer « Utiliser » remplit et enregistre le prix, le bandeau disparaît, le montant de la ligne se recalcule ;
- sur une nouvelle ligne, taper un prix manuellement avant de quitter le champ désignation : aucun bandeau ne doit apparaître ;
- sur une ligne dont l'unité ne correspond à aucun historique : aucun bandeau.

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/appels-offres/[id]/bpu-ligne-row.tsx"
git commit -m "feat: bandeau de suggestion de prix BPU basé sur l'historique"
```

---

## Self-Review (effectuée avant remise du plan)

**Couverture du spec** : usage suggestion active (Task 4), matching mots-clés + unité dure (Task 1), périmètre toute ligne chiffrée tout AO (Task 2), une seule suggestion + tie-break récence (Task 1), bandeau automatique avec Utiliser/Ignorer (Task 4), provenance éphémère (aucune colonne ajoutée, confirmé par l'absence de migration dans ce plan), traductions FR/EN (Task 3), tests uniquement sur la fonction pure (Task 1) — tout couvert.

**Cohérence des types** : `SuggestionPrixBpu` et `LigneBpuHistorique` définis une seule fois (Task 1), réutilisés tels quels en Task 2 (import) et Task 4 (import du seul type `SuggestionPrixBpu`) — aucune redéfinition divergente.

**Piège de fermeture React trouvé et corrigé pendant la revue** : en donnant à `enregistrer` un paramètre optionnel `prixOverride` (Step 3), les cinq autres champs qui appelaient encore `onBlur={enregistrer}` nu (code article, unité, quantité, déboursé sec, taux de frais de structure) auraient reçu l'événement React comme `prixOverride` et fait planter `prixEffectif.trim()`. Step 6 corrige les cinq — seuls le bouton « Utiliser » (argument explicite) et les `onBlur` avec wrapper `() => enregistrer()` appellent désormais `enregistrer` en toute sécurité.
