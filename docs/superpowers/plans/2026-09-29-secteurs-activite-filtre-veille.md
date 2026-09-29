# Secteurs d'activité entreprise + filtre veille Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une entreprise choisit ses secteurs d'activité parmi 4 valeurs
fixes (`/parametres`) ; `/veille` ne lui montre plus que les avis de ces
secteurs (plus les avis non classés) — chaque avis scrapé est classé par
mots-clés à son insertion.

**Architecture:** Nouveau module pur `lib/veille/classification-secteur.ts`
(même patron que `classifierTypeFichierDao`), branché dans
`construireLigneInsertion` (Task 5 de la spec veille, déjà en prod).
Nouvelle colonne `entreprise.secteurs_activite text[]`, éditée via la
`ProfilEntrepriseCard` existante. `listerAvisNational` filtre côté
serveur selon ces secteurs.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres
+ RLS existante, aucune nouvelle policy), Zod, Vitest (TDD).

## Global Constraints

- Référentiel fermé à 4 secteurs : `btp`, `ingenierie`, `environnement`,
  `energie_climat` — jamais élargi (CLAUDE.md).
- Classification uniquement à l'insertion d'un nouvel avis — jamais en
  réécriture sur un avis déjà en base.
- Filtre strict côté serveur : un avis hors des secteurs de l'entreprise
  n'est jamais renvoyé au navigateur.
- Avis non classé (`secteur` null) : toujours visible, quel que soit le
  paramétrage de l'entreprise.
- Entreprise sans secteur configuré (tableau vide) : aucune restriction,
  comportement actuel.
- Commits conventionnels (`feat:`, `test:`, `docs:`), un commit par
  tâche.

---

### Task 1: Migration + classification par secteur (TDD)

**Files:**
- Create: `supabase/migrations/20260929130000_secteurs_activite_entreprise.sql`
- Create: `lib/veille/classification-secteur.ts`
- Create: `lib/veille/classification-secteur.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `export const SECTEURS_CIBLES = ["btp", "ingenierie", "environnement", "energie_climat"] as const;`
  - `export type SecteurCible = (typeof SECTEURS_CIBLES)[number];`
  - `export function classifierSecteur(objet: string): SecteurCible | null`
  - Consommé en Tâche 2 (`lib/veille/marches-publics.ts`) et Tâche 3
    (`lib/utilisateur/schema.ts`, import de `SECTEURS_CIBLES` pour la
    validation Zod — pas de duplication de la liste).

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260929130000_secteurs_activite_entreprise.sql

-- Secteurs d'activité choisis par l'entreprise, pour filtrer /veille aux
-- avis pertinents. Liste fermée à 4 valeurs (voir CLAUDE.md, ciblage
-- commercial déjà restreint à BTP/ingénierie/environnement/énergie-
-- climat) — validée côté application (Zod, lib/utilisateur/schema.ts),
-- pas de contrainte SQL check : même patron que appel_offres.secteur
-- (text libre sans contrainte).
alter table entreprise
  add column secteurs_activite text[] not null default '{}';
```

- [ ] **Step 2: Appliquer la migration**

Run: `npx supabase db push`
Expected: `Applying migration 20260929130000_secteurs_activite_entreprise.sql...` puis `Finished supabase db push.`

- [ ] **Step 3: Écrire les tests (échouent, le module n'existe pas encore)**

```typescript
// lib/veille/classification-secteur.test.ts
import { describe, expect, it } from "vitest";
import { classifierSecteur } from "./classification-secteur";

describe("classifierSecteur", () => {
  it("classe un avis de construction/bâtiment en btp", () => {
    const objet =
      "Travaux de construction d'un bâtiment de 03 salles de classes au Groupe Scolaire Sandégué";
    expect(classifierSecteur(objet)).toBe("btp");
  });

  it("classe un avis de bureau d'études en ingenierie", () => {
    const objet =
      "Recrutement d'un bureau d'études pour la supervision de travaux d'assainissement";
    expect(classifierSecteur(objet)).toBe("ingenierie");
  });

  it("classe un avis d'assainissement/déchets en environnement", () => {
    const objet = "Travaux d'assainissement et de gestion des déchets dans la commune";
    expect(classifierSecteur(objet)).toBe("environnement");
  });

  it("classe un avis d'électrification/solaire en energie_climat", () => {
    const objet =
      "Fourniture et installation d'un système d'électrification solaire pour l'éclairage public";
    expect(classifierSecteur(objet)).toBe("energie_climat");
  });

  it("renvoie null si aucun mot-clé ne matche", () => {
    const objet = "Fourniture de matériel de bureau pour l'administration";
    expect(classifierSecteur(objet)).toBeNull();
  });

  it("priorise le premier secteur du registre en cas de chevauchement", () => {
    // Contient à la fois un mot-clé btp ("construction") et un mot-clé
    // ingenierie ("étude") — btp est avant ingenierie dans le registre,
    // doit l'emporter.
    const objet = "Étude et construction d'un pont routier";
    expect(classifierSecteur(objet)).toBe("btp");
  });

  it("ignore la casse", () => {
    expect(classifierSecteur("TRAVAUX DE CONSTRUCTION D'UN BÂTIMENT")).toBe("btp");
  });
});
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/veille/classification-secteur.test.ts`
Expected: FAIL — `Cannot find module './classification-secteur'`

- [ ] **Step 5: Implémenter le module**

```typescript
// lib/veille/classification-secteur.ts

export const SECTEURS_CIBLES = [
  "btp",
  "ingenierie",
  "environnement",
  "energie_climat",
] as const;
export type SecteurCible = (typeof SECTEURS_CIBLES)[number];

interface MotsClesSecteur {
  secteur: SecteurCible;
  motsCles: string[];
}

// Ordre du registre = ordre de priorité en cas de chevauchement — premier
// secteur dont un mot-clé matche qui l'emporte, même patron que
// classifierTypeFichierDao
// (lib/appels-offres/normalisation/classification-fichier.ts).
// Mots-clés de départ, à affiner contre un échantillon réel d'avis en
// production (voir spec 2026-09-29-secteurs-activite-filtre-veille-design.md)
// — pas supposés exhaustifs.
const REGISTRE: MotsClesSecteur[] = [
  {
    secteur: "btp",
    motsCles: [
      "construction",
      "bâtiment",
      "voirie",
      "génie civil",
      "réhabilitation",
      "édifice",
      "salle de classe",
      "logement",
      "route",
      "pont",
      "dallage",
    ],
  },
  {
    secteur: "ingenierie",
    motsCles: [
      "étude",
      "ingénierie",
      "conception",
      "supervision",
      "contrôle technique",
      "maîtrise d'œuvre",
      "bureau d'études",
      "assistance technique",
    ],
  },
  {
    secteur: "environnement",
    motsCles: [
      "assainissement",
      "environnement",
      "déchets",
      "eau potable",
      "impact environnemental",
      "reboisement",
      "gestion des déchets",
    ],
  },
  {
    secteur: "energie_climat",
    motsCles: [
      "électrification",
      "solaire",
      "photovoltaïque",
      "climatisation",
      "réseau électrique",
      "éclairage public",
      "groupe électrogène",
    ],
  },
];

function normaliser(texte: string): string {
  return texte.toLowerCase();
}

export function classifierSecteur(objet: string): SecteurCible | null {
  const objetNormalise = normaliser(objet);
  for (const { secteur, motsCles } of REGISTRE) {
    if (motsCles.some((mot) => objetNormalise.includes(normaliser(mot)))) {
      return secteur;
    }
  }
  return null;
}
```

- [ ] **Step 6: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/veille/classification-secteur.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260929130000_secteurs_activite_entreprise.sql lib/veille/classification-secteur.ts lib/veille/classification-secteur.test.ts
git commit -m "feat(veille): classification des avis par secteur (mots-clés)"
```

---

### Task 2: Brancher la classification à l'insertion d'un avis

**Files:**
- Modify: `lib/veille/marches-publics.ts`
- Modify: `lib/veille/marches-publics.test.ts`

**Interfaces:**
- Consumes: `classifierSecteur` (Tâche 1).
- Produces: `construireLigneInsertion` renvoie désormais un objet avec un
  champ `secteur` en plus — Tâche 4 n'en a pas besoin directement (le
  filtre lit la colonne en base, pas cette fonction), mais toute future
  tâche qui inspecterait la forme de cet objet doit savoir que `secteur`
  y figure maintenant.

- [ ] **Step 1: Écrire le test (échoue)**

Ajouter à `lib/veille/marches-publics.test.ts` (après les tests
existants de `construireLigneInsertion`/`construireLigneMiseAJour`, à
localiser dans le fichier actuel) :

```typescript
import { classifierSecteur } from "./classification-secteur";

// ... dans le describe existant de construireLigneInsertion, ou un
// nouveau describe dédié :

describe("construireLigneInsertion — secteur", () => {
  it("classe le secteur depuis l'objet de l'avis", () => {
    const avis: AvisScrape = {
      reference: "T 1/2027",
      type: "travaux",
      objet: "Travaux de construction d'un bâtiment scolaire",
      autoriteContractante: null,
      dateLimite: "2027-01-01",
    };
    const ligne = construireLigneInsertion(avis);
    expect(ligne.secteur).toBe("btp");
  });

  it("renvoie secteur null si aucun mot-clé ne matche", () => {
    const avis: AvisScrape = {
      reference: "F 1/2027",
      type: "fournitures",
      objet: "Fourniture de matériel de bureau",
      autoriteContractante: null,
      dateLimite: "2027-01-01",
    };
    const ligne = construireLigneInsertion(avis);
    expect(ligne.secteur).toBeNull();
  });
});

describe("construireLigneMiseAJour — secteur", () => {
  it("n'inclut jamais la clé secteur (préserve la classification existante)", () => {
    const avis: AvisScrape = {
      reference: "T 1/2027",
      type: "travaux",
      objet: "Travaux de construction d'un bâtiment scolaire",
      autoriteContractante: null,
      dateLimite: "2027-01-01",
    };
    const ligne = construireLigneMiseAJour(avis);
    expect(ligne).not.toHaveProperty("secteur");
  });
});
```

(L'import `classifierSecteur` ci-dessus n'est en fait pas utilisé
directement dans ce fichier de test — retire-le si `tsc`/`eslint` le
signale comme inutilisé ; le test vérifie le comportement de
`construireLigneInsertion`, pas `classifierSecteur` directement, déjà
couvert en Tâche 1.)

- [ ] **Step 2: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/veille/marches-publics.test.ts`
Expected: FAIL — `expect(received).toBe(expected)` avec `received: undefined` (le champ `secteur` n'existe pas encore sur l'objet renvoyé)

- [ ] **Step 3: Brancher la classification**

Dans `lib/veille/marches-publics.ts`, ajouter l'import en haut du
fichier :

```typescript
import { classifierSecteur } from "./classification-secteur";
```

Modifier `construireLigneInsertion` :

```typescript
export function construireLigneInsertion(avis: AvisScrape) {
  return {
    reference: avis.reference,
    type: avis.type,
    objet: avis.objet,
    autorite_contractante: avis.autoriteContractante,
    date_limite_remise_offres: avis.dateLimite,
    secteur: classifierSecteur(avis.objet),
    bomp_numero_id: null,
    texte_brut: null,
    structure_le: new Date().toISOString(),
  };
}
```

`construireLigneMiseAJour` n'est **pas modifiée** — elle n'inclut déjà
pas de clé `secteur`, ce qui suffit à préserver le secteur existant
d'un avis déjà en base (même mécanisme que pour
`bomp_numero_id`/`texte_brut`/`structure_le`, voir le commentaire déjà
présent sur cette fonction).

- [ ] **Step 4: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/veille/marches-publics.test.ts`
Expected: PASS (tous les tests existants + les 3 nouveaux)

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/veille/marches-publics.ts lib/veille/marches-publics.test.ts
git commit -m "feat(veille): classe le secteur d'un avis à son insertion"
```

---

### Task 3: Configuration des secteurs côté entreprise

**Files:**
- Modify: `lib/utilisateur/types.ts`
- Modify: `lib/utilisateur/schema.ts`
- Modify: `lib/utilisateur/actions.ts`
- Modify: `app/(app)/parametres/profil-entreprise-card.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `SECTEURS_CIBLES`, `SecteurCible` (Tâche 1, importés depuis
  `@/lib/veille/classification-secteur`).
- Produces: `Entreprise.secteurs_activite: string[]` (Tâche 4 en a
  besoin pour filtrer `/veille`) ; `modifierProfilEntreprise` accepte
  désormais `secteursActivite: string[]` dans son input.

- [ ] **Step 1: Étendre le type `Entreprise`**

Dans `lib/utilisateur/types.ts` :

```typescript
export interface Entreprise {
  id: string;
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representant_legal_nom: string | null;
  representant_legal_qualite: string | null;
  idu: string | null;
  taux_frais_structure_defaut: number | null;
  secteurs_activite: string[];
  created_at: string;
}
```

- [ ] **Step 2: Étendre le schéma Zod**

Dans `lib/utilisateur/schema.ts`, ajouter l'import et le champ :

```typescript
import { z } from "zod";
import { SECTEURS_CIBLES } from "@/lib/veille/classification-secteur";

const champTexteOptionnel = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null));

export const modifierProfilEntrepriseSchema = z.object({
  nom: z.string().trim().min(1, "Le nom de l'entreprise est requis").max(200),
  rccm: champTexteOptionnel,
  adresse: champTexteOptionnel,
  representantLegalNom: champTexteOptionnel,
  representantLegalQualite: champTexteOptionnel,
  idu: champTexteOptionnel,
  secteursActivite: z.array(z.enum(SECTEURS_CIBLES)),
});

export type ModifierProfilEntrepriseInput = z.infer<typeof modifierProfilEntrepriseSchema>;
```

- [ ] **Step 3: Étendre la Server Action**

Dans `lib/utilisateur/actions.ts` :

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "./queries";
import { modifierProfilEntrepriseSchema } from "./schema";

export async function modifierProfilEntreprise(input: {
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representantLegalNom: string | null;
  representantLegalQualite: string | null;
  idu: string | null;
  secteursActivite: string[];
}): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierProfilEntrepriseSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({
      nom: parsed.data.nom,
      rccm: parsed.data.rccm,
      adresse: parsed.data.adresse,
      representant_legal_nom: parsed.data.representantLegalNom,
      representant_legal_qualite: parsed.data.representantLegalQualite,
      idu: parsed.data.idu,
      secteurs_activite: parsed.data.secteursActivite,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

- [ ] **Step 4: Ajouter les traductions**

Dans `messages/fr.json`, section `Parametres.profilEntreprise` (repérer
la clé `"profilEntreprise": {` existante), ajouter avant la fermeture
de cet objet (après `"champIdu"`, avant `"boutonEnregistrer"`) :

```json
      "champSecteursActivite": "Secteurs d'activité",
      "secteur": {
        "btp": "BTP",
        "ingenierie": "Ingénierie",
        "environnement": "Environnement",
        "energie_climat": "Énergie-climat"
      },
```

Dans `messages/en.json`, même structure au même endroit :

```json
      "champSecteursActivite": "Business sectors",
      "secteur": {
        "btp": "Construction",
        "ingenierie": "Engineering",
        "environnement": "Environment",
        "energie_climat": "Energy & climate"
      },
```

- [ ] **Step 5: Ajouter les cases à cocher dans `ProfilEntrepriseCard`**

Dans `app/(app)/parametres/profil-entreprise-card.tsx`, ajouter les
imports :

```typescript
import { Checkbox } from "@/components/ui/checkbox";
import { SECTEURS_CIBLES } from "@/lib/veille/classification-secteur";
```

Ajouter l'état et l'inclure dans l'appel à `modifierProfilEntreprise` :

```typescript
  const [secteursActivite, setSecteursActivite] = useState<string[]>(
    entreprise?.secteurs_activite ?? [],
  );
```

(à placer juste après la déclaration de `envoi` existante)

Dans `enregistrer()`, ajouter `secteursActivite` à l'appel :

```typescript
  async function enregistrer() {
    setEnvoi(true);
    const resultat = await modifierProfilEntreprise({
      nom,
      rccm: rccm.trim().length > 0 ? rccm : null,
      adresse: adresse.trim().length > 0 ? adresse : null,
      representantLegalNom: representantLegalNom.trim().length > 0 ? representantLegalNom : null,
      representantLegalQualite:
        representantLegalQualite.trim().length > 0 ? representantLegalQualite : null,
      idu: idu.trim().length > 0 ? idu : null,
      secteursActivite,
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(t("erreurEnregistrement"));
      return;
    }
    toast.success(t("toastEnregistre"));
  }
```

Ajouter le bloc de cases à cocher dans le JSX, juste avant le champ
`profil-idu` (avant `<div className="flex flex-col gap-2"><Label htmlFor="profil-idu">`) :

```tsx
        <div className="flex flex-col gap-2">
          <Label>{t("champSecteursActivite")}</Label>
          <div className="flex flex-col gap-2">
            {SECTEURS_CIBLES.map((secteur) => (
              <div key={secteur} className="flex items-center gap-2">
                <Checkbox
                  id={`secteur-${secteur}`}
                  checked={secteursActivite.includes(secteur)}
                  onCheckedChange={(coche) =>
                    setSecteursActivite((liste) =>
                      coche === true
                        ? [...liste, secteur]
                        : liste.filter((s) => s !== secteur),
                    )
                  }
                />
                <Label htmlFor={`secteur-${secteur}`} className="font-normal">
                  {t(`secteur.${secteur}`)}
                </Label>
              </div>
            ))}
          </div>
        </div>
```

- [ ] **Step 6: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 7: Vérifier le lint**

Run: `npx eslint app/(app)/parametres/profil-entreprise-card.tsx lib/utilisateur/actions.ts lib/utilisateur/schema.ts lib/utilisateur/types.ts`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add lib/utilisateur/types.ts lib/utilisateur/schema.ts lib/utilisateur/actions.ts "app/(app)/parametres/profil-entreprise-card.tsx" messages/fr.json messages/en.json
git commit -m "feat(parametres): secteurs d'activité de l'entreprise"
```

---

### Task 4: Filtre `/veille` par secteur + vérification finale

**Files:**
- Modify: `lib/veille/queries.ts`
- Modify: `app/(app)/veille/page.tsx`

**Interfaces:**
- Consumes: `Entreprise.secteurs_activite` (Tâche 3), `obtenirEntreprise`
  (existant, `@/lib/utilisateur/queries`, signature
  `(entrepriseId: string) => Promise<Entreprise | null>`).
- Produces: rien consommé par une tâche ultérieure — dernière tâche du
  plan.

- [ ] **Step 1: Filtrer `listerAvisNational`**

Dans `lib/veille/queries.ts` :

```typescript
export async function listerAvisNational(secteursEntreprise: string[]): Promise<AvisAoNational[]> {
  const supabase = await createClient();
  let requete = supabase
    .from("avis_ao_national")
    .select("*")
    .order("date_limite_remise_offres", { ascending: true, nullsFirst: false });

  if (secteursEntreprise.length > 0) {
    // Un avis hors des secteurs de l'entreprise n'est jamais renvoyé —
    // sauf s'il n'a pas pu être classé (secteur null), toujours visible
    // pour ne pas perdre une vraie opportunité sur un faux négatif de
    // classification par mots-clés (voir spec).
    requete = requete.or(
      `secteur.in.(${secteursEntreprise.join(",")}),secteur.is.null`,
    );
  }

  const { data, error } = await requete;

  if (error) throw error;
  return (data ?? []) as AvisAoNational[];
}
```

- [ ] **Step 2: Passer les secteurs de l'entreprise depuis la page**

Dans `app/(app)/veille/page.tsx`, ajouter l'import :

```typescript
import { obtenirEntreprise } from "@/lib/utilisateur/queries";
```

Remplacer le corps de la fonction :

```typescript
export default async function VeillePage() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  const [avis, importations] = await Promise.all([
    listerAvisNational(entreprise?.secteurs_activite ?? []),
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

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Lancer la suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests passent (existants + les nouveaux des Tâches 1
et 2).

- [ ] **Step 5: Vérification manuelle en local**

Démarrer le serveur de dev (`npm run dev`). Se connecter avec un compte
de test.

1. Aller sur `/parametres`, cocher un secteur (ex. « BTP »),
   enregistrer — vérifier le toast de succès.
2. Aller sur `/veille` — vérifier que seuls les avis dont l'objet
   contient un mot-clé BTP (ou aucun secteur détecté) s'affichent. Si le
   catalogue en base ne contient aucun avis de secteur autre que BTP au
   moment du test, ce comportement ne sera pas visuellement distinguable
   du cas « tout affiché » — dans ce cas, insérer temporairement (via un
   script `tsx` jetable avec `createServiceRoleClient`, supprimé après
   test) un avis de test avec un `objet` clairement énergie-climat (ex.
   « Fourniture et installation d'un système solaire ») et vérifier
   qu'il **n'apparaît pas** dans `/veille` tant que seul BTP est coché.
2bis. Décocher tous les secteurs sur `/parametres`, revenir sur
   `/veille` — vérifier que tout redevient visible (comportement actuel
   restauré).
3. Aller sur `/parametres`, cocher aussi « Énergie-climat » — vérifier
   que l'avis de test créé au point 2 apparaît maintenant.

Nettoyer toute donnée de test insérée manuellement (avis + éventuel
compte) avant de terminer.

- [ ] **Step 6: Commit**

```bash
git add lib/veille/queries.ts "app/(app)/veille/page.tsx"
git commit -m "feat(veille): filtre les avis par secteurs de l'entreprise"
```
