# Formulaires standards pré-remplis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pré-remplir automatiquement, par gabarit déterministe (pas d'IA), les 3 formulaires administratifs récurrents d'un DAO ivoirien (lettre de soumission, déclaration sur l'honneur, pouvoir habilitant) à partir d'un nouveau profil entreprise et du BPU déjà saisi, en réutilisant intégralement le mécanisme `section_dossier` déjà en prod.

**Architecture:** (1) Nouveaux champs `entreprise` (adresse, représentant légal, IDU) + carte de réglage `/parametres` — prérequis bloquant identifié en spec. (2) Détection par mots-clés (`identifierFormulaireStandard`, même patron que `deviserTypeDocumentPrefere`) du type de formulaire à partir du libellé d'exigence extrait du DAO. (3) Trois fonctions pures de substitution de gabarit (`genererXxx`), jamais d'appel Claude. (4) Une Server Action `genererContenuFormulaireStandard` qui upsert dans `section_dossier` — la table, les Server Actions de validation et le filtre d'export existants sont réutilisés sans aucune modification. (5) Un composant `FormulaireStandard` dédié (pas `SectionRedaction`, qui embarque un sélecteur de documents non pertinent ici), branché dans `DocumentsExigence`.

**Tech Stack:** Next.js Server Actions, Supabase Postgres/RLS, Zod, next-intl, shadcn/ui (`Textarea`, `Badge`, `Button`, `Card`).

## Global Constraints

- Aucune génération IA pour ces 3 formulaires — substitution déterministe de gabarit uniquement (spec, décision validée).
- Tout champ entreprise manquant est remplacé par le littéral `[à compléter]` (ou `[montant à compléter]` pour le montant BPU), jamais une valeur inventée ni une chaîne vide silencieuse.
- Le montant total BPU de la lettre de soumission est **toujours recalculé côté serveur** via `listerBpu` + `sommerMontants` — jamais transmis par le client.
- `entreprise.nom`, `rccm`, `adresse`, `representant_legal_nom`, `representant_legal_qualite`, `idu` sont les 6 seuls nouveaux champs — pas de « profil complet » spéculatif.
- `obtenirEntreprise` (nouveau, type `Entreprise` complet) coexist avec `obtenirNomEntreprise`/`obtenirTauxFraisStructureDefaut` existants — aucun renommage ni suppression de ces fonctions.
- Réutilisation intégrale de `section_dossier` (table + `modifierContenuSection`/`validerSection`/`devaliderSection` + filtre `construirePlanExport`) — **aucune modification** à `export/plan.ts`/`docx.ts`.
- Réutilise la policy RLS `entreprise_update_membres` déjà créée (sous-projet pyramide de coût BPU) — aucune nouvelle policy RLS nécessaire pour la migration de ce plan.
- Migration SQL jamais poussée par un agent implémenteur — **interdiction stricte d'exécuter `supabase db push`**. C'est Sorel (contrôleur humain) qui relit et pousse la migration avant tout push `origin main`.
- Toujours vérifier `npx tsc --noEmit`, `npx vitest run`, `npx next build` avant de clore une tâche.
- Commits conventionnels (`feat:`, `fix:`, `test:`...), un commit par étape logique de tâche.
- Tests uniquement sur les fonctions pures (`identifierFormulaireStandard`, les 3 `genererXxx`) — pas de test sur la Server Action ni les composants UI, cohérent avec le reste du projet.

---

### Task 1: Migration profil entreprise + type `Entreprise` + `obtenirEntreprise`

**Files:**
- Create: `supabase/migrations/20260921100000_profil_entreprise.sql`
- Create: `lib/utilisateur/types.ts`
- Modify: `lib/utilisateur/queries.ts`

**Interfaces:**
- Produces: `Entreprise` interface (`lib/utilisateur/types.ts`) — consumed by Task 2 (schema/action/card) and Task 3 (`genererXxx` functions).
- Produces: `obtenirEntreprise(entrepriseId: string): Promise<Entreprise | null>` (`lib/utilisateur/queries.ts`) — consumed by Task 2 (`page.tsx`) and Task 4 (`genererContenuFormulaireStandard`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260921100000_profil_entreprise.sql`:

```sql
-- Formulaires standards pré-remplis (feuille de route stratégique,
-- tier P1, brique 1/2). entreprise n'avait jusqu'ici que nom/rccm —
-- aucun champ ni aucune page ne permettait de renseigner l'adresse, le
-- représentant légal ou l'IDU, pourtant nécessaires pour pré-remplir une
-- lettre de soumission, une déclaration sur l'honneur ou un pouvoir
-- habilitant. Scope strictement limité à ce que ces 3 formulaires
-- exigent — pas un profil entreprise complet.
--
-- Pas de nouvelle policy RLS : la policy update "entreprise_update_membres"
-- (20260916150000_pyramide_cout_bpu.sql) couvre déjà toute colonne de
-- cette table.
alter table entreprise
  add column adresse text,
  add column representant_legal_nom text,
  add column representant_legal_qualite text,
  add column idu text;
```

**Ne pas exécuter `supabase db push`** — Sorel relira et poussera cette migration lui-même.

- [ ] **Step 2: Create the `Entreprise` type**

Create `lib/utilisateur/types.ts`:

```ts
export interface Entreprise {
  id: string;
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representant_legal_nom: string | null;
  representant_legal_qualite: string | null;
  idu: string | null;
  taux_frais_structure_defaut: number | null;
  created_at: string;
}
```

- [ ] **Step 3: Add `obtenirEntreprise` to `lib/utilisateur/queries.ts`**

Current end of file (line 49-57):

```ts
export async function obtenirNomEntreprise(entrepriseId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("nom")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data?.nom ?? null;
}
```

Add after it, and add the import at the top of the file:

```ts
import { createClient } from "@/lib/supabase/server";
import type { Entreprise } from "./types";
```

```ts
export async function obtenirEntreprise(entrepriseId: string): Promise<Entreprise | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("*")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data as Entreprise | null;
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260921100000_profil_entreprise.sql lib/utilisateur/types.ts lib/utilisateur/queries.ts
git commit -m "feat: ajoute adresse/représentant légal/IDU à entreprise + obtenirEntreprise"
```

---

### Task 2: Schéma + Server Action + carte `/parametres` (profil entreprise)

**Files:**
- Create: `lib/utilisateur/schema.ts`
- Create: `lib/utilisateur/actions.ts`
- Create: `app/(app)/parametres/profil-entreprise-card.tsx`
- Modify: `app/(app)/parametres/page.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `Entreprise` (Task 1, `lib/utilisateur/types.ts`), `obtenirEntreprise` (Task 1, `lib/utilisateur/queries.ts`), `obtenirUtilisateurCourant` (`lib/utilisateur/queries.ts`, existing).
- Produces: `modifierProfilEntrepriseSchema` / `ModifierProfilEntrepriseInput` (`lib/utilisateur/schema.ts`) — internal to this task's action.
- Produces: `modifierProfilEntreprise(input): Promise<{erreur: string} | {succes: true}>` (`lib/utilisateur/actions.ts`) — consumed only by `ProfilEntrepriseCard` in this task.

- [ ] **Step 1: Create the Zod schema**

Create `lib/utilisateur/schema.ts`:

```ts
import { z } from "zod";

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
});

export type ModifierProfilEntrepriseInput = z.infer<typeof modifierProfilEntrepriseSchema>;
```

- [ ] **Step 2: Create the Server Action**

Create `lib/utilisateur/actions.ts`:

```ts
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
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

- [ ] **Step 3: Add translation blocks**

In `messages/fr.json`, the `Parametres` block currently reads (lines 370-378):

```json
  "Parametres": {
    "page": {
      "titre": "Réglages",
      "filAriane": "Réglages"
    },
    "tauxFraisStructure": {
      "titre": "Taux de frais de structure par défaut",
      "description": "Préremplit le taux de frais de structure de chaque nouvelle ligne dépliée dans un bordereau des prix unitaires. Modifiable ligne par ligne."
    },
```

Insert a new `profilEntreprise` block between `page` and `tauxFraisStructure`:

```json
  "Parametres": {
    "page": {
      "titre": "Réglages",
      "filAriane": "Réglages"
    },
    "profilEntreprise": {
      "titre": "Profil entreprise",
      "description": "Utilisé pour pré-remplir les formulaires administratifs standards (lettre de soumission, déclaration sur l'honneur, pouvoir habilitant).",
      "champNom": "Nom de l'entreprise",
      "champRccm": "RCCM",
      "champAdresse": "Adresse du siège",
      "champRepresentantLegalNom": "Nom du représentant légal",
      "champRepresentantLegalQualite": "Qualité du représentant légal (ex. Directeur Général)",
      "champIdu": "IDU",
      "boutonEnregistrer": "Enregistrer",
      "toastEnregistre": "Profil entreprise enregistré",
      "erreurEnregistrement": "Échec de l'enregistrement. Réessayez."
    },
    "tauxFraisStructure": {
      "titre": "Taux de frais de structure par défaut",
      "description": "Préremplit le taux de frais de structure de chaque nouvelle ligne dépliée dans un bordereau des prix unitaires. Modifiable ligne par ligne."
    },
```

In `messages/en.json`, the equivalent block currently reads (lines 370-378):

```json
  "Parametres": {
    "page": {
      "titre": "Settings",
      "filAriane": "Settings"
    },
    "tauxFraisStructure": {
      "titre": "Default overhead rate",
      "description": "Pre-fills the overhead rate the first time a bill-of-quantities line is expanded. Editable per line."
    },
```

Insert:

```json
  "Parametres": {
    "page": {
      "titre": "Settings",
      "filAriane": "Settings"
    },
    "profilEntreprise": {
      "titre": "Company profile",
      "description": "Used to pre-fill standard administrative forms (bid submission letter, sworn statement, power of attorney).",
      "champNom": "Company name",
      "champRccm": "Trade register number (RCCM)",
      "champAdresse": "Registered office address",
      "champRepresentantLegalNom": "Legal representative's name",
      "champRepresentantLegalQualite": "Legal representative's title (e.g. Managing Director)",
      "champIdu": "Taxpayer ID (IDU)",
      "boutonEnregistrer": "Save",
      "toastEnregistre": "Company profile saved",
      "erreurEnregistrement": "Failed to save. Please try again."
    },
    "tauxFraisStructure": {
      "titre": "Default overhead rate",
      "description": "Pre-fills the overhead rate the first time a bill-of-quantities line is expanded. Editable per line."
    },
```

- [ ] **Step 4: Create `ProfilEntrepriseCard`**

Create `app/(app)/parametres/profil-entreprise-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { modifierProfilEntreprise } from "@/lib/utilisateur/actions";
import type { Entreprise } from "@/lib/utilisateur/types";

export function ProfilEntrepriseCard({ entreprise }: { entreprise: Entreprise | null }) {
  const t = useTranslations("Parametres.profilEntreprise");
  const [nom, setNom] = useState(entreprise?.nom ?? "");
  const [rccm, setRccm] = useState(entreprise?.rccm ?? "");
  const [adresse, setAdresse] = useState(entreprise?.adresse ?? "");
  const [representantLegalNom, setRepresentantLegalNom] = useState(
    entreprise?.representant_legal_nom ?? "",
  );
  const [representantLegalQualite, setRepresentantLegalQualite] = useState(
    entreprise?.representant_legal_qualite ?? "",
  );
  const [idu, setIdu] = useState(entreprise?.idu ?? "");
  const [envoi, setEnvoi] = useState(false);

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
    });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(t("toastEnregistre"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-nom">{t("champNom")}</Label>
          <Input id="profil-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-rccm">{t("champRccm")}</Label>
          <Input id="profil-rccm" value={rccm} onChange={(e) => setRccm(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-adresse">{t("champAdresse")}</Label>
          <Input id="profil-adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-representant-nom">{t("champRepresentantLegalNom")}</Label>
          <Input
            id="profil-representant-nom"
            value={representantLegalNom}
            onChange={(e) => setRepresentantLegalNom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-representant-qualite">{t("champRepresentantLegalQualite")}</Label>
          <Input
            id="profil-representant-qualite"
            value={representantLegalQualite}
            onChange={(e) => setRepresentantLegalQualite(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profil-idu">{t("champIdu")}</Label>
          <Input id="profil-idu" value={idu} onChange={(e) => setIdu(e.target.value)} />
        </div>
        <Button onClick={enregistrer} disabled={envoi} className="self-start">
          {t("boutonEnregistrer")}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Wire into `/parametres`**

Current `app/(app)/parametres/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant, obtenirTauxFraisStructureDefaut } from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { TauxFraisStructureCard } from "./taux-frais-structure-card";
import { ToastConnexion } from "./toast-connexion";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { succes, erreur } = await searchParams;
  const [compte, tauxFraisStructureDefaut] = await Promise.all([
    obtenirCompteEmailConnecte(utilisateur.id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
  ]);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      <CompteEmailCard compte={compte} />
      <TauxFraisStructureCard tauxInitial={tauxFraisStructureDefaut} />
    </div>
  );
}
```

Replace with:

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  obtenirUtilisateurCourant,
  obtenirTauxFraisStructureDefaut,
  obtenirEntreprise,
} from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { ProfilEntrepriseCard } from "./profil-entreprise-card";
import { TauxFraisStructureCard } from "./taux-frais-structure-card";
import { ToastConnexion } from "./toast-connexion";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { succes, erreur } = await searchParams;
  const [compte, tauxFraisStructureDefaut, entreprise] = await Promise.all([
    obtenirCompteEmailConnecte(utilisateur.id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
    obtenirEntreprise(utilisateur.entreprise_id),
  ]);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      <CompteEmailCard compte={compte} />
      <ProfilEntrepriseCard entreprise={entreprise} />
      <TauxFraisStructureCard tauxInitial={tauxFraisStructureDefaut} />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/utilisateur/schema.ts lib/utilisateur/actions.ts app/\(app\)/parametres/profil-entreprise-card.tsx app/\(app\)/parametres/page.tsx messages/fr.json messages/en.json
git commit -m "feat: carte profil entreprise dans /parametres (adresse, représentant légal, IDU)"
```

---

### Task 3: Détection + génération par gabarit (fonctions pures, TDD)

**Files:**
- Create: `lib/appels-offres/formulaires-standards.ts`
- Test: `lib/appels-offres/formulaires-standards.test.ts`

**Interfaces:**
- Consumes: `Entreprise` (Task 1), `AppelOffres` (`lib/appels-offres/types.ts`, existing).
- Produces: `TYPES_FORMULAIRE_STANDARD`, `TypeFormulaireStandard`, `identifierFormulaireStandard(libelle: string): TypeFormulaireStandard | null`, `genererLettreSoumission(entreprise, appelOffres, montantTotalBpu: number | null): string`, `genererDeclarationHonneur(entreprise, appelOffres): string`, `genererPouvoirHabilitant(entreprise, appelOffres): string` — all consumed by Task 4's Server Action.

- [ ] **Step 1: Write the failing tests**

Create `lib/appels-offres/formulaires-standards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  identifierFormulaireStandard,
  genererLettreSoumission,
  genererDeclarationHonneur,
  genererPouvoirHabilitant,
} from "./formulaires-standards";
import type { Entreprise } from "@/lib/utilisateur/types";
import type { AppelOffres } from "./types";

describe("identifierFormulaireStandard", () => {
  it("reconnaît une lettre de soumission", () => {
    expect(identifierFormulaireStandard("Lettre de soumission de l'offre")).toBe(
      "lettre_soumission",
    );
  });

  it("reconnaît une déclaration sur l'honneur (avec accent)", () => {
    expect(identifierFormulaireStandard("Formulaire de déclaration sur l'honneur")).toBe(
      "declaration_honneur",
    );
  });

  it("reconnaît une déclaration sur l'honneur (sans accent)", () => {
    expect(identifierFormulaireStandard("Declaration sur l'honneur du soumissionnaire")).toBe(
      "declaration_honneur",
    );
  });

  it("reconnaît un pouvoir habilitant", () => {
    expect(identifierFormulaireStandard("Pouvoir habilitant du soumissionnaire")).toBe(
      "pouvoir_habilitant",
    );
  });

  it("est insensible à la casse", () => {
    expect(identifierFormulaireStandard("LETTRE DE SOUMISSION")).toBe("lettre_soumission");
  });

  it("retourne null pour un libellé sans correspondance", () => {
    expect(identifierFormulaireStandard("Attestation de régularité fiscale")).toBeNull();
  });
});

const entrepriseComplete: Entreprise = {
  id: "e1",
  nom: "SARL Exemple",
  rccm: "CI-ABJ-2020-B-1234",
  adresse: "Cocody, Abidjan",
  representant_legal_nom: "Jean Kouassi",
  representant_legal_qualite: "Directeur Général",
  idu: "1234567A",
  taux_frais_structure_defaut: null,
  created_at: "2026-01-01T00:00:00Z",
};

const entrepriseVide: Entreprise = {
  id: "e2",
  nom: "SARL Vide",
  rccm: null,
  adresse: null,
  representant_legal_nom: null,
  representant_legal_qualite: null,
  idu: null,
  taux_frais_structure_defaut: null,
  created_at: "2026-01-01T00:00:00Z",
};

const appelOffres = {
  id: "ao1",
  titre: "Construction d'un pont",
  acheteur: "Ministère des Infrastructures",
} as AppelOffres;

describe("genererLettreSoumission", () => {
  it("ne contient aucun [à compléter] avec une entreprise entièrement renseignée et un montant", () => {
    const texte = genererLettreSoumission(entrepriseComplete, appelOffres, 15000000);
    expect(texte).not.toContain("[à compléter]");
    expect(texte).toContain("15 000 000 FCFA");
  });

  it("remplace chaque champ manquant, jamais une chaîne vide", () => {
    const texte = genererLettreSoumission(entrepriseVide, appelOffres, null);
    expect(texte).toContain("[à compléter]");
    expect(texte).toContain("[montant à compléter]");
  });

  it("affiche [montant à compléter] quand le BPU n'est pas chiffré (0)", () => {
    const texte = genererLettreSoumission(entrepriseComplete, appelOffres, 0);
    expect(texte).toContain("[montant à compléter]");
    expect(texte).not.toContain("0 FCFA");
  });
});

describe("genererDeclarationHonneur", () => {
  it("ne contient aucun [à compléter] avec une entreprise entièrement renseignée", () => {
    const texte = genererDeclarationHonneur(entrepriseComplete, appelOffres);
    expect(texte).not.toContain("[à compléter]");
  });

  it("remplace chaque champ manquant", () => {
    const texte = genererDeclarationHonneur(entrepriseVide, appelOffres);
    expect(texte).toContain("[à compléter]");
  });
});

describe("genererPouvoirHabilitant", () => {
  it("ne contient aucun [à compléter] pour les champs entreprise avec une entreprise entièrement renseignée", () => {
    const texte = genererPouvoirHabilitant(entrepriseComplete, appelOffres);
    expect(texte).toContain(entrepriseComplete.nom);
    expect(texte).toContain(entrepriseComplete.rccm as string);
  });

  it("remplace chaque champ manquant", () => {
    const texte = genererPouvoirHabilitant(entrepriseVide, appelOffres);
    expect(texte).toContain("[à compléter]");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/appels-offres/formulaires-standards.test.ts`
Expected: FAIL with "Cannot find module './formulaires-standards'".

- [ ] **Step 3: Implement `formulaires-standards.ts`**

Create `lib/appels-offres/formulaires-standards.ts`:

```ts
import type { Entreprise } from "@/lib/utilisateur/types";
import type { AppelOffres } from "./types";

export const TYPES_FORMULAIRE_STANDARD = [
  "lettre_soumission",
  "declaration_honneur",
  "pouvoir_habilitant",
] as const;

export type TypeFormulaireStandard = (typeof TYPES_FORMULAIRE_STANDARD)[number];

// Même patron que deviserTypeDocumentPrefere (suggestion-document.ts) :
// mots-clés sur le libellé en texte libre extrait du DAO, pas de
// classification IA tant qu'une règle simple suffit.
export function identifierFormulaireStandard(libelle: string): TypeFormulaireStandard | null {
  const l = libelle.toLowerCase();
  if (l.includes("lettre de soumission")) return "lettre_soumission";
  if (l.includes("déclaration sur l'honneur") || l.includes("declaration sur l'honneur")) {
    return "declaration_honneur";
  }
  if (l.includes("pouvoir habilitant")) return "pouvoir_habilitant";
  return null;
}

function valeurOu(champ: string | null, remplacement = "[à compléter]"): string {
  return champ && champ.trim().length > 0 ? champ : remplacement;
}

export function genererLettreSoumission(
  entreprise: Entreprise,
  appelOffres: AppelOffres,
  montantTotalBpu: number | null,
): string {
  const montant =
    montantTotalBpu !== null && montantTotalBpu > 0
      ? `${montantTotalBpu.toLocaleString("fr-FR")} FCFA`
      : "[montant à compléter]";

  return `LETTRE DE SOUMISSION

Objet : ${valeurOu(appelOffres.titre)}
Acheteur : ${valeurOu(appelOffres.acheteur)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom}, immatriculée au RCCM sous le numéro ${valeurOu(entreprise.rccm)}, dont le siège est situé à ${valeurOu(entreprise.adresse)}, après avoir pris connaissance du Dossier d'Appel d'Offres relatif au marché ci-dessus désigné, m'engage à exécuter les prestations conformément aux clauses et conditions dudit dossier, pour un montant total de ${montant}.

Fait à [à compléter], le [à compléter].

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}

export function genererDeclarationHonneur(entreprise: Entreprise, appelOffres: AppelOffres): string {
  return `DÉCLARATION SUR L'HONNEUR

Objet : ${valeurOu(appelOffres.titre)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom} (RCCM ${valeurOu(entreprise.rccm)}, IDU ${valeurOu(entreprise.idu)}), déclare sur l'honneur :

- que l'entreprise n'est pas sous le coup d'une interdiction de participer aux marchés publics ;
- que l'entreprise n'est pas en état de faillite, de liquidation ou de cessation d'activité ;
- que les informations et pièces fournies dans le cadre de la présente offre sont exactes et sincères ;
- que l'entreprise s'engage à respecter la réglementation en vigueur en matière de marchés publics et à n'exercer ni offrir aucune forme de corruption dans le cadre de la présente procédure.

Fait à [à compléter], le [à compléter].

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}

export function genererPouvoirHabilitant(entreprise: Entreprise, appelOffres: AppelOffres): string {
  return `POUVOIR HABILITANT

Objet : ${valeurOu(appelOffres.titre)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom}, immatriculée au RCCM sous le numéro ${valeurOu(entreprise.rccm)}, donne par la présente pouvoir à [à compléter — nom et qualité du signataire habilité] à l'effet de signer, au nom et pour le compte de l'entreprise, tous documents relatifs à la présente procédure de passation de marché, et notamment l'offre déposée en réponse à l'appel d'offres susvisé.

Fait à [à compléter], le [à compléter].

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/appels-offres/formulaires-standards.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Verify types**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/formulaires-standards.ts lib/appels-offres/formulaires-standards.test.ts
git commit -m "feat: détection et génération par gabarit des formulaires standards (TDD)"
```

---

### Task 4: Server Action `genererContenuFormulaireStandard`

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `identifierFormulaireStandard`/`genererLettreSoumission`/`genererDeclarationHonneur`/`genererPouvoirHabilitant` (Task 3), `obtenirEntreprise` (Task 1), `listerBpu`/`sommerMontants` (existing, `lib/appels-offres/queries.ts` and `lib/appels-offres/bpu.ts`), `obtenirAppelOffres` (existing), `obtenirUtilisateurCourant` (existing), `StatutSectionDossier` (existing, `lib/appels-offres/types.ts`).
- Produces: `genererContenuFormulaireStandard(appelOffresId: string, exigenceId: string): Promise<{erreur: string} | {succes: true; sectionId: string; contenu: string; statut: StatutSectionDossier}>` — consumed by Task 5's `FormulaireStandard` component.

- [ ] **Step 1: Add imports to `lib/appels-offres/actions.ts`**

Current top-of-file imports (relevant excerpt):

```ts
import { normaliserDocument } from "../documents/normalisation";
import { genererContenuCvTransforme } from "./cv-transformation";
import { genererDocumentCvTransforme } from "./export/cv-docx";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres, obtenirAppelOffres } from "./queries";
import { genererJalonsParDefaut } from "./retroplanning";
import { construirePlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import { genererSectionRedaction } from "./redaction/generer";
```

Replace with (adds `listerBpu` to the existing `./queries` import, and three new imports):

```ts
import { normaliserDocument } from "../documents/normalisation";
import { genererContenuCvTransforme } from "./cv-transformation";
import { genererDocumentCvTransforme } from "./export/cv-docx";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres, obtenirAppelOffres, listerBpu } from "./queries";
import { genererJalonsParDefaut } from "./retroplanning";
import { construirePlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import { genererSectionRedaction } from "./redaction/generer";
import { sommerMontants } from "./bpu";
import { obtenirEntreprise } from "@/lib/utilisateur/queries";
import {
  identifierFormulaireStandard,
  genererLettreSoumission,
  genererDeclarationHonneur,
  genererPouvoirHabilitant,
} from "./formulaires-standards";
```

- [ ] **Step 2: Append the Server Action at the end of the file**

Current file tail is `genererUrlTelechargementCvTransforme` (the last function, ending the file at line 1555). Append after it:

```ts

export async function genererContenuFormulaireStandard(
  appelOffresId: string,
  exigenceId: string,
): Promise<
  | { erreur: string }
  | { succes: true; sectionId: string; contenu: string; statut: StatutSectionDossier }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const exigence = resultat.exigences.find((e) => e.id === exigenceId);
  if (!exigence) return { erreur: "Exigence introuvable." };

  const type = identifierFormulaireStandard(exigence.libelle);
  if (!type) return { erreur: "Ce type de formulaire n'est pas reconnu." };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  let contenu: string;
  if (type === "lettre_soumission") {
    const bpu = await listerBpu(appelOffresId);
    const toutesLesLignes = bpu.sections.flatMap((s) => bpu.lignesParSection[s.id] ?? []);
    const montantTotal = sommerMontants(toutesLesLignes);
    contenu = genererLettreSoumission(entreprise, resultat.appelOffres, montantTotal);
  } else if (type === "declaration_honneur") {
    contenu = genererDeclarationHonneur(entreprise, resultat.appelOffres);
  } else {
    contenu = genererPouvoirHabilitant(entreprise, resultat.appelOffres);
  }

  const supabase = await createClient();
  const { data: section, error: erreurUpsert } = await supabase
    .from("section_dossier")
    .upsert(
      {
        dossier_reponse_id: resultat.dossierReponse.id,
        titre: exigence.libelle,
        contenu,
        statut: "brouillon",
        generated_at: new Date().toISOString(),
        created_by: utilisateur.id,
      },
      { onConflict: "dossier_reponse_id,titre" },
    )
    .select("id")
    .maybeSingle();

  if (erreurUpsert || !section) {
    return { erreur: "Échec de l'enregistrement du formulaire. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, sectionId: section.id, contenu, statut: "brouillon" };
}
```

Note: `createClient`, `revalidatePath`, `obtenirUtilisateurCourant`, and `StatutSectionDossier` are already imported at the top of `actions.ts` — no new import needed for those.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all existing tests still pass (this task adds no new tests — pure Server Action wiring over already-tested pure functions, consistent with the spec's test scope).

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat: Server Action genererContenuFormulaireStandard"
```

---

### Task 5: Interface `FormulaireStandard` + branchement + traductions

**Files:**
- Create: `app/(app)/appels-offres/[id]/formulaire-standard.tsx`
- Modify: `app/(app)/appels-offres/[id]/documents-exigence.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `genererContenuFormulaireStandard` (Task 4), `modifierContenuSection`/`validerSection`/`devaliderSection` (existing, `lib/appels-offres/actions.ts`), `identifierFormulaireStandard`/`TypeFormulaireStandard` (Task 3), `SectionDossier`/`StatutSectionDossier` (existing, `lib/appels-offres/types.ts`).

- [ ] **Step 1: Create `FormulaireStandard`**

Create `app/(app)/appels-offres/[id]/formulaire-standard.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  genererContenuFormulaireStandard,
  modifierContenuSection,
  validerSection,
  devaliderSection,
} from "@/lib/appels-offres/actions";
import type { SectionDossier, StatutSectionDossier } from "@/lib/appels-offres/types";

export function FormulaireStandard({
  appelOffresId,
  exigenceId,
  section,
}: {
  appelOffresId: string;
  exigenceId: string;
  section: SectionDossier | undefined;
}) {
  const t = useTranslations("AppelsOffres.detail.exigences.formulaireStandard");
  const [sectionId, setSectionId] = useState(section?.id);
  const [contenu, setContenu] = useState(section?.contenu ?? "");
  const [statut, setStatut] = useState<StatutSectionDossier>(section?.statut ?? "brouillon");
  const [generation, setGeneration] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function generer() {
    setGeneration(true);
    const resultat = await genererContenuFormulaireStandard(appelOffresId, exigenceId);
    setGeneration(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setSectionId(resultat.sectionId);
    setContenu(resultat.contenu);
    setStatut(resultat.statut);
  }

  async function sauvegarderContenu() {
    if (!sectionId) return;
    setEnregistrement(true);
    const resultat = await modifierContenuSection(appelOffresId, sectionId, contenu);
    setEnregistrement(false);
    if ("erreur" in resultat) toast.error(t("erreurEnregistrement"));
  }

  function basculerStatut() {
    if (!sectionId) return;
    const precedent = statut;
    const nouveauStatut: StatutSectionDossier = statut === "brouillon" ? "validee" : "brouillon";
    setStatut(nouveauStatut);

    startTransition(async () => {
      const resultat =
        nouveauStatut === "validee"
          ? await validerSection(appelOffresId, sectionId)
          : await devaliderSection(appelOffresId, sectionId);
      if ("erreur" in resultat) {
        toast.error(t("erreurValidation"));
        setStatut(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 pl-4 border-l-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase text-muted-foreground">{t("titre")}</span>
        {sectionId && (
          <Badge variant={statut === "validee" ? "default" : "outline"}>
            {statut === "validee" ? t("statutValidee") : t("statutBrouillon")}
          </Badge>
        )}
      </div>

      {sectionId && (
        <Textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={10} />
      )}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={generer} disabled={generation}>
          {generation ? t("generationEnCours") : sectionId ? t("boutonRegenerer") : t("boutonGenerer")}
        </Button>
        {sectionId && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={sauvegarderContenu} disabled={enregistrement}>
              {t("boutonEnregistrerTexte")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={basculerStatut} disabled={isPending}>
              {statut === "brouillon" ? t("boutonValider") : t("boutonDevalider")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `documents-exigence.tsx`**

Current props destructuring and type (lines 27-56):

```tsx
export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
  modeleCvDisponible,
  cvTransformeParDocument,
  onCvTransforme,
  documentIdEnCours,
  onDocumentIdEnCoursChange,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
  modeleCvDisponible: boolean;
  cvTransformeParDocument: Record<string, CvTransforme>;
  onCvTransforme: (documentId: string, cv: CvTransforme) => void;
  // Levé au parent (et non local à cette instance) : un même CV peut être
  // associé à plusieurs exigences, donc plusieurs instances de
  // DocumentsExigence peuvent rendre le même document. Sans cet état
  // partagé, une instance ne sait pas qu'une autre a déjà déclenché une
  // génération pour ce document, et peut redéclencher un second appel
  // Claude payant pour la même transformation pendant que le premier est
  // encore en cours.
  documentIdEnCours: string | null;
  onDocumentIdEnCoursChange: (documentId: string | null) => void;
}) {
```

Replace with (adds two new props):

```tsx
export function DocumentsExigence({
  appelOffresId,
  exigenceId,
  libelleExigence,
  documentsAssocies: documentsAssociesInitial,
  bibliotheque,
  modeleCvDisponible,
  cvTransformeParDocument,
  onCvTransforme,
  documentIdEnCours,
  onDocumentIdEnCoursChange,
  typeFormulaireStandard,
  sectionFormulaire,
}: {
  appelOffresId: string;
  exigenceId: string;
  libelleExigence: string;
  documentsAssocies: Document[];
  bibliotheque: Document[];
  modeleCvDisponible: boolean;
  cvTransformeParDocument: Record<string, CvTransforme>;
  onCvTransforme: (documentId: string, cv: CvTransforme) => void;
  // Levé au parent (et non local à cette instance) : un même CV peut être
  // associé à plusieurs exigences, donc plusieurs instances de
  // DocumentsExigence peuvent rendre le même document. Sans cet état
  // partagé, une instance ne sait pas qu'une autre a déjà déclenché une
  // génération pour ce document, et peut redéclencher un second appel
  // Claude payant pour la même transformation pendant que le premier est
  // encore en cours.
  documentIdEnCours: string | null;
  onDocumentIdEnCoursChange: (documentId: string | null) => void;
  // Calculé par le parent (identifierFormulaireStandard(exigence.libelle))
  // pour éviter de dupliquer l'import de détection dans ce composant.
  typeFormulaireStandard: TypeFormulaireStandard | null;
  sectionFormulaire: SectionDossier | undefined;
}) {
```

Add the two new imports at the top of the file, alongside the existing ones:

```tsx
import type { CvTransforme } from "@/lib/appels-offres/types";
```

becomes:

```tsx
import type { CvTransforme, SectionDossier } from "@/lib/appels-offres/types";
import type { TypeFormulaireStandard } from "@/lib/appels-offres/formulaires-standards";
import { FormulaireStandard } from "./formulaire-standard";
```

Finally, render `<FormulaireStandard>` when a type is detected. The current return statement starts with (line 120):

```tsx
  return (
    <div className="flex flex-col gap-2">
      {documentsAssocies.length === 0 ? (
```

Replace the opening of the return with:

```tsx
  return (
    <div className="flex flex-col gap-2">
      {typeFormulaireStandard && (
        <FormulaireStandard
          appelOffresId={appelOffresId}
          exigenceId={exigenceId}
          section={sectionFormulaire}
        />
      )}

      {documentsAssocies.length === 0 ? (
```

- [ ] **Step 3: Wire `appel-offres-detail.tsx`**

Add the import, alongside the existing ones (near the top of the file):

```tsx
import { DocumentsExigence } from "./documents-exigence";
```

becomes:

```tsx
import { DocumentsExigence } from "./documents-exigence";
import { identifierFormulaireStandard } from "@/lib/appels-offres/formulaires-standards";
```

Current `piecesRequises.map` block (lines 276-303):

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
                            modeleCvDisponible={appelOffres.modele_cv_path !== null}
                            cvTransformeParDocument={cvTransformes}
                            onCvTransforme={(documentId, cv) =>
                              setCvTransformes((carte) => ({ ...carte, [documentId]: cv }))
                            }
                            documentIdEnCours={documentIdEnCours}
                            onDocumentIdEnCoursChange={setDocumentIdEnCours}
                          />
                        </div>
                      </li>
                    ))}
```

Replace with:

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
                            modeleCvDisponible={appelOffres.modele_cv_path !== null}
                            cvTransformeParDocument={cvTransformes}
                            onCvTransforme={(documentId, cv) =>
                              setCvTransformes((carte) => ({ ...carte, [documentId]: cv }))
                            }
                            documentIdEnCours={documentIdEnCours}
                            onDocumentIdEnCoursChange={setDocumentIdEnCours}
                            typeFormulaireStandard={identifierFormulaireStandard(exigence.libelle)}
                            sectionFormulaire={sections.find((s) => s.titre === exigence.libelle)}
                          />
                        </div>
                      </li>
                    ))}
```

- [ ] **Step 4: Add translation blocks**

In `messages/fr.json`, the `exigences` block currently ends its `documents` sub-block and closes (lines 262-277):

```json
        "documents": {
          "aucunDocumentAssocie": "Aucun document lié.",
          "dissocier": "Retirer",
          "placeholderSelect": "Lier un document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Autres documents",
          "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
          "erreurAssociation": "Échec de l'association du document. Réessayez.",
          "erreurDissociation": "Échec de la dissociation du document. Réessayez.",
          "boutonTransformer": "Transformer selon le modèle",
          "transformationEnCours": "Génération en cours...",
          "boutonTelechargerTransforme": "Télécharger le CV transformé",
          "genereLe": "Généré le {date}",
          "boutonRegenerer": "Régénérer"
        }
      },
```

Replace with (adds sibling `formulaireStandard` block inside `exigences`, after `documents`):

```json
        "documents": {
          "aucunDocumentAssocie": "Aucun document lié.",
          "dissocier": "Retirer",
          "placeholderSelect": "Lier un document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Autres documents",
          "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
          "erreurAssociation": "Échec de l'association du document. Réessayez.",
          "erreurDissociation": "Échec de la dissociation du document. Réessayez.",
          "boutonTransformer": "Transformer selon le modèle",
          "transformationEnCours": "Génération en cours...",
          "boutonTelechargerTransforme": "Télécharger le CV transformé",
          "genereLe": "Généré le {date}",
          "boutonRegenerer": "Régénérer"
        },
        "formulaireStandard": {
          "titre": "Formulaire standard pré-rempli",
          "boutonGenerer": "Générer",
          "boutonRegenerer": "Régénérer",
          "generationEnCours": "Génération en cours...",
          "boutonValider": "Valider",
          "boutonDevalider": "Repasser en brouillon",
          "statutBrouillon": "Brouillon",
          "statutValidee": "Validée",
          "boutonEnregistrerTexte": "Enregistrer le texte",
          "erreurEnregistrement": "Échec de l'enregistrement. Réessayez.",
          "erreurValidation": "Échec de la mise à jour du statut. Réessayez."
        }
      },
```

In `messages/en.json`, the equivalent block currently reads (lines 262-277):

```json
        "documents": {
          "aucunDocumentAssocie": "No document linked.",
          "dissocier": "Remove",
          "placeholderSelect": "Link a document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Other documents",
          "bibliothequeVide": "No document in the library yet. Add one from the Library.",
          "erreurAssociation": "Failed to link the document. Please try again.",
          "erreurDissociation": "Failed to remove the document. Please try again.",
          "boutonTransformer": "Transform to template",
          "transformationEnCours": "Generating...",
          "boutonTelechargerTransforme": "Download the transformed CV",
          "genereLe": "Generated on {date}",
          "boutonRegenerer": "Regenerate"
        }
      },
```

Replace with:

```json
        "documents": {
          "aucunDocumentAssocie": "No document linked.",
          "dissocier": "Remove",
          "placeholderSelect": "Link a document...",
          "groupeSuggestions": "Suggestions",
          "groupeAutres": "Other documents",
          "bibliothequeVide": "No document in the library yet. Add one from the Library.",
          "erreurAssociation": "Failed to link the document. Please try again.",
          "erreurDissociation": "Failed to remove the document. Please try again.",
          "boutonTransformer": "Transform to template",
          "transformationEnCours": "Generating...",
          "boutonTelechargerTransforme": "Download the transformed CV",
          "genereLe": "Generated on {date}",
          "boutonRegenerer": "Regenerate"
        },
        "formulaireStandard": {
          "titre": "Pre-filled standard form",
          "boutonGenerer": "Generate",
          "boutonRegenerer": "Regenerate",
          "generationEnCours": "Generating...",
          "boutonValider": "Approve",
          "boutonDevalider": "Revert to draft",
          "statutBrouillon": "Draft",
          "statutValidee": "Approved",
          "boutonEnregistrerTexte": "Save text",
          "erreurEnregistrement": "Failed to save. Please try again.",
          "erreurValidation": "Failed to update status. Please try again."
        }
      },
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass.

Run: `npx next build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/appels-offres/\[id\]/formulaire-standard.tsx app/\(app\)/appels-offres/\[id\]/documents-exigence.tsx app/\(app\)/appels-offres/\[id\]/appel-offres-detail.tsx messages/fr.json messages/en.json
git commit -m "feat: branche les formulaires standards pré-remplis dans le détail AO"
```

---

## Self-Review Notes

- **Spec coverage:** Sections 1-4 of the spec map 1:1 to Tasks 1, 2, 3, 4-5. All 6 entreprise fields, all 3 form generators, the keyword detector, the Server Action, the component, and both translation blocks are covered. No spec requirement left without a task.
- **Placeholder scan:** no `TBD`/`TODO` left; every step carries literal code, not a description.
- **Type consistency:** `TypeFormulaireStandard`, `SectionDossier`, `StatutSectionDossier`, `Entreprise` are used with identical names and shapes across Tasks 1, 3, 4, 5 — verified against each task's own Interfaces block. `genererContenuFormulaireStandard`'s return type matches exactly what `FormulaireStandard` destructures (`sectionId`, `contenu`, `statut`).
- **RLS:** confirmed by direct migration reading (`20260916150000_pyramide_cout_bpu.sql`) that `entreprise_update_membres` already covers all columns of `entreprise` — Task 1's migration adds columns only, no new policy, consistent with the spec.
- **No `export/plan.ts`/`docx.ts` changes**: confirmed — `construirePlanExport` already includes any `section_dossier` row with `statut === "validee" && contenu !== null` regardless of `titre`, so a validated formulaire-standard section flows into the export automatically. No task touches these files, matching the spec's explicit "aucun changement requis" statement.
- **Test scope:** matches the spec exactly — TDD only on `identifierFormulaireStandard` and the 3 `genererXxx` functions (Task 3); no test added for the Server Action or the UI components (Tasks 4-5), consistent with the rest of the codebase's test coverage philosophy.
