# Cachet et signature du représentant légal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à l'entreprise de téléverser une fois le cachet et la signature de son représentant légal, et les faire apparaître automatiquement (image, pas texte) dans les 3 gabarits de formulaires standards qui l'engagent juridiquement (lettre de soumission, déclaration sur l'honneur, pouvoir habilitant), en export Word et PDF.

**Architecture:** Réutilise à l'identique le pattern déjà en production pour le logo entreprise (colonnes `*_path`/`*_nom_original`/`*_mime_type` sur `entreprise`, upload vers Supabase Storage bucket `documents`, buffer téléchargé une fois par export côté serveur, image insérée dans le document généré). Détection des 3 gabarits via `identifierFormulaireStandard` déjà existant ; insertion de l'image juste avant le dernier paragraphe de la section (celui qui porte le nom du représentant légal), avec repli silencieux vers le texte seul si aucune image n'est disponible.

**Tech Stack:** Next.js (Server Actions), Supabase (Postgres + Storage), `docx` (ImageRun), `pdf-lib` (embedPng/embedJpg + drawImage), Zod, Vitest.

## Global Constraints

- Spec source de vérité : `docs/superpowers/specs/2026-10-29-cachet-signature-representant-legal-design.md`.
- Upload restreint à PNG/JPEG, 5 Mo max (mêmes contraintes que le logo - `televerserLogoSchema` réutilisé tel quel).
- Un seul signataire : cachet et signature sont liés à l'entreprise entière, pas à un document ou un utilisateur en particulier.
- Portée export strictement limitée aux 3 gabarits `lettre_soumission`, `declaration_honneur`, `pouvoir_habilitant`.
- Commits conventionnels (`feat:`, `test:`...), TypeScript strict, aucun `any`.

---

## File Structure

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20261029090000_entreprise_cachet_signature.sql` | Crée les 6 colonnes `entreprise` (création) |
| `lib/utilisateur/types.ts` | Modifie - ajoute les 6 champs à `Entreprise` |
| `lib/utilisateur/storage-path.ts` | Modifie - généralise en `construireCheminStockageImage`, ajoute `construireCheminStockageCachet`/`construireCheminStockageSignature` |
| `lib/utilisateur/storage-path.test.ts` | Modifie - tests des 2 nouvelles fonctions |
| `lib/utilisateur/actions.ts` | Modifie - 4 nouvelles Server Actions (upload/retrait cachet, upload/retrait signature) |
| `app/(app)/parametres/profil-entreprise-card.tsx` | Modifie - sous-composant `ChampImageEntreprise` + 2 instances (cachet, signature) |
| `messages/fr.json`, `messages/en.json` | Modifie - clés i18n du nouveau champ |
| `lib/appels-offres/export/plan.ts` | Modifie - `EntrepriseExport`/`PlanExport` gagnent `signature`/`cachet: LogoExport \| null` |
| `lib/appels-offres/export/plan.test.ts` | Pas de modification requise (n'instancie jamais `PlanExport` par littéral) |
| `lib/appels-offres/formulaires-standards.ts` | Modifie - exporte `TYPES_FORMULAIRE_SIGNE` |
| `lib/appels-offres/export/docx.ts` | Modifie - insère les `ImageRun` dans les 3 gabarits signés |
| `lib/appels-offres/export/docx.test.ts` | Modifie - fixture `signature`/`cachet: null`, nouveau test |
| `lib/appels-offres/export/pdf-layout.ts` | Modifie - ajoute `ecrireImage` |
| `lib/appels-offres/export/pdf.ts` | Modifie - insère les images dans les 3 gabarits signés |
| `lib/appels-offres/export/pdf.test.ts` | Modifie - fixture `signature`/`cachet: null`, nouveau test avec vrai PNG |
| `lib/appels-offres/export/xlsx.test.ts` | Modifie - fixtures `signature`/`cachet: null` (2 occurrences) |
| `lib/appels-offres/actions.ts` | Modifie - helper `telechargerImageEntreprise`, branché aux 2 points d'export existants |

---

### Task 1 : Migration et type `Entreprise`

**Files:**
- Create: `supabase/migrations/20261029090000_entreprise_cachet_signature.sql`
- Modify: `lib/utilisateur/types.ts`

**Interfaces:**
- Produces: `Entreprise.cachet_path: string | null`, `Entreprise.cachet_nom_original: string | null`, `Entreprise.cachet_mime_type: string | null`, `Entreprise.signature_path: string | null`, `Entreprise.signature_nom_original: string | null`, `Entreprise.signature_mime_type: string | null`.

- [ ] **Step 1: Créer la migration**

```sql
-- Cachet et signature du représentant légal (voir
-- docs/superpowers/specs/2026-10-29-cachet-signature-representant-legal-design.md).
-- Même structure que logo_path/logo_nom_original/logo_mime_type
-- (20261019130000_entete_pied_page.sql) : deux images distinctes,
-- téléchargées une fois par export et insérées dans les 3 gabarits de
-- formulaires standards qui engagent juridiquement l'entreprise (lettre de
-- soumission, déclaration sur l'honneur, pouvoir habilitant).
--
-- Pas de nouvelle policy RLS : la policy update "entreprise_update_membres"
-- couvre déjà toute colonne de cette table.
alter table entreprise
  add column cachet_path text,
  add column cachet_nom_original text,
  add column cachet_mime_type text,
  add column signature_path text,
  add column signature_nom_original text,
  add column signature_mime_type text;
```

- [ ] **Step 2: Pousser la migration**

Run: `npx supabase db push`
Expected: `entreprise_cachet_signature` listée comme appliquée, aucune erreur.

- [ ] **Step 3: Ajouter les champs à `Entreprise`**

Dans `lib/utilisateur/types.ts`, remplacer :

```ts
  logo_path: string | null;
  logo_nom_original: string | null;
  logo_mime_type: string | null;
```

par :

```ts
  logo_path: string | null;
  logo_nom_original: string | null;
  logo_mime_type: string | null;
  cachet_path: string | null;
  cachet_nom_original: string | null;
  cachet_mime_type: string | null;
  signature_path: string | null;
  signature_nom_original: string | null;
  signature_mime_type: string | null;
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: échoue sur les fixtures `Entreprise` incomplètes (`formulaires-standards.test.ts`) - confirme que le type est bien devenu plus strict. Les erreurs listées doivent être exactement les fixtures que les tâches suivantes corrigent (pas d'autre régression).

- [ ] **Step 5: Corriger les fixtures `Entreprise` existantes**

Dans `lib/appels-offres/formulaires-standards.test.ts`, pour `entrepriseComplete` ET `entrepriseVide` (les deux objets littéraux), remplacer :

```ts
  logo_path: null,
  logo_nom_original: null,
  logo_mime_type: null,
```

par :

```ts
  logo_path: null,
  logo_nom_original: null,
  logo_mime_type: null,
  cachet_path: null,
  cachet_nom_original: null,
  cachet_mime_type: null,
  signature_path: null,
  signature_nom_original: null,
  signature_mime_type: null,
```

- [ ] **Step 6: Vérifier que la compilation passe**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261029090000_entreprise_cachet_signature.sql lib/utilisateur/types.ts lib/appels-offres/formulaires-standards.test.ts
git commit -m "feat(entreprise): colonnes cachet et signature du representant legal"
```

---

### Task 2 : Chemins de stockage

**Files:**
- Modify: `lib/utilisateur/storage-path.ts`
- Test: `lib/utilisateur/storage-path.test.ts`

**Interfaces:**
- Produces: `construireCheminStockageCachet(entrepriseId: string, nomFichierOriginal: string): string`, `construireCheminStockageSignature(entrepriseId: string, nomFichierOriginal: string): string`.
- Consumes: aucun.

- [ ] **Step 1: Écrire les tests (échouent à la compilation, fonctions inexistantes)**

Dans `lib/utilisateur/storage-path.test.ts`, ajouter après le `describe("construireCheminStockageLogo", ...)` existant :

```ts
describe("construireCheminStockageCachet", () => {
  it("préfixe le chemin par l'id entreprise et le segment cachet", () => {
    expect(construireCheminStockageCachet("ent-1", "cachet.png")).toBe("ent-1/cachet/cachet.png");
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    expect(construireCheminStockageCachet("ent-1", "Cachet K-Nowledge (2026).png")).toBe(
      "ent-1/cachet/Cachet_K-Nowledge__2026_.png",
    );
  });
});

describe("construireCheminStockageSignature", () => {
  it("préfixe le chemin par l'id entreprise et le segment signature", () => {
    expect(construireCheminStockageSignature("ent-1", "signature.png")).toBe(
      "ent-1/signature/signature.png",
    );
  });

  it("nettoie les caractères non sûrs du nom de fichier", () => {
    expect(construireCheminStockageSignature("ent-1", "Signature Jean K. (2026).png")).toBe(
      "ent-1/signature/Signature_Jean_K___2026_.png",
    );
  });
});
```

Et mettre à jour l'import en haut du fichier :

```ts
import { describe, expect, it } from "vitest";
import {
  construireCheminStockageLogo,
  construireCheminStockageCachet,
  construireCheminStockageSignature,
} from "./storage-path";
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run lib/utilisateur/storage-path.test.ts`
Expected: FAIL - `construireCheminStockageCachet is not a function` (ou erreur TypeScript équivalente, les fonctions n'existent pas encore).

- [ ] **Step 3: Généraliser `storage-path.ts`**

Remplacer tout le contenu de `lib/utilisateur/storage-path.ts` par :

```ts
function construireCheminStockageImage(
  dossier: "logo" | "cachet" | "signature",
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/${dossier}/${nomNettoye}`;
}

export function construireCheminStockageLogo(
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  return construireCheminStockageImage("logo", entrepriseId, nomFichierOriginal);
}

export function construireCheminStockageCachet(
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  return construireCheminStockageImage("cachet", entrepriseId, nomFichierOriginal);
}

export function construireCheminStockageSignature(
  entrepriseId: string,
  nomFichierOriginal: string,
): string {
  return construireCheminStockageImage("signature", entrepriseId, nomFichierOriginal);
}
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/utilisateur/storage-path.test.ts`
Expected: PASS, 6 tests (2 existants pour le logo + 4 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add lib/utilisateur/storage-path.ts lib/utilisateur/storage-path.test.ts
git commit -m "feat(entreprise): chemins de stockage pour cachet et signature"
```

---

### Task 3 : Server Actions upload/retrait

**Files:**
- Modify: `lib/utilisateur/actions.ts`

**Interfaces:**
- Consumes: `construireCheminStockageCachet`, `construireCheminStockageSignature` (Task 2), `televerserLogoSchema` (existant, réutilisé tel quel).
- Produces: `televerserCachetEntreprise(formData: FormData): Promise<{ erreur: string } | { succes: true }>`, `retirerCachetEntreprise(cheminStockage: string): Promise<{ erreur: string } | { succes: true }>`, `televerserSignatureEntreprise(formData: FormData): Promise<{ erreur: string } | { succes: true }>`, `retirerSignatureEntreprise(cheminStockage: string): Promise<{ erreur: string } | { succes: true }>`.

Pas de test unitaire dédié : aucune Server Action existante de ce fichier (y compris `televerserLogoEntreprise`, le pattern qu'on reproduit) n'a de test unitaire dans ce projet - elles touchent Supabase Storage + DB et sont vérifiées manuellement en navigateur (voir Task 10). On reste cohérent avec cette convention plutôt que d'introduire un nouveau mocking pour cette seule tâche.

- [ ] **Step 1: Mettre à jour les imports**

Dans `lib/utilisateur/actions.ts`, remplacer :

```ts
import { construireCheminStockageLogo } from "./storage-path";
```

par :

```ts
import {
  construireCheminStockageLogo,
  construireCheminStockageCachet,
  construireCheminStockageSignature,
} from "./storage-path";
```

- [ ] **Step 2: Ajouter les 4 Server Actions**

Après `retirerLogoEntreprise` (juste avant `export async function creerInvitation`), insérer :

```ts
export async function televerserCachetEntreprise(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const parsed = televerserLogoSchema.safeParse({ fichier: formData.get("fichier") });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const cheminStockage = construireCheminStockageCachet(utilisateur.entreprise_id, fichier.name);

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type, upsert: true });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du cachet. Réessayez." };
  }

  const { error: erreurMiseAJour } = await supabase
    .from("entreprise")
    .update({
      cachet_path: cheminStockage,
      cachet_nom_original: fichier.name,
      cachet_mime_type: fichier.type,
    })
    .eq("id", utilisateur.entreprise_id);

  if (erreurMiseAJour) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du cachet. Réessayez." };
  }

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function retirerCachetEntreprise(
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("entreprise")
    .update({ cachet_path: null, cachet_nom_original: null, cachet_mime_type: null })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function televerserSignatureEntreprise(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const parsed = televerserLogoSchema.safeParse({ fichier: formData.get("fichier") });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const cheminStockage = construireCheminStockageSignature(utilisateur.entreprise_id, fichier.name);

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type, upsert: true });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi de la signature. Réessayez." };
  }

  const { error: erreurMiseAJour } = await supabase
    .from("entreprise")
    .update({
      signature_path: cheminStockage,
      signature_nom_original: fichier.name,
      signature_mime_type: fichier.type,
    })
    .eq("id", utilisateur.entreprise_id);

  if (erreurMiseAJour) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement de la signature. Réessayez." };
  }

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function retirerSignatureEntreprise(
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("entreprise")
    .update({ signature_path: null, signature_nom_original: null, signature_mime_type: null })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/utilisateur/actions.ts
git commit -m "feat(entreprise): server actions upload/retrait cachet et signature"
```

---

### Task 4 : UI de téléversement dans `/parametres`

**Files:**
- Modify: `app/(app)/parametres/profil-entreprise-card.tsx`
- Modify: `messages/fr.json`, `messages/en.json`

**Interfaces:**
- Consumes: `televerserCachetEntreprise`, `retirerCachetEntreprise`, `televerserSignatureEntreprise`, `retirerSignatureEntreprise` (Task 3), `genererUrlTelechargement` depuis `@/lib/documents/actions` (existant).

- [ ] **Step 1: Ajouter les clés i18n (fr)**

Dans `messages/fr.json`, dans le bloc `Parametres.profilEntreprise`, remplacer :

```json
      "boutonEnregistrer": "Enregistrer",
      "toastEnregistre": "Profil entreprise enregistré",
      "erreurEnregistrement": "Échec de l'enregistrement. Réessayez."
    },
```

par :

```json
      "champCachet": "Cachet de l'entreprise",
      "boutonTeleverserCachet": "Téléverser le cachet",
      "boutonRetirerCachet": "Retirer",
      "toastCachetEnvoye": "Cachet enregistré",
      "toastCachetRetire": "Cachet retiré",
      "champSignature": "Signature du représentant légal",
      "boutonTeleverserSignature": "Téléverser la signature",
      "boutonRetirerSignature": "Retirer",
      "toastSignatureEnvoyee": "Signature enregistrée",
      "toastSignatureRetiree": "Signature retirée",
      "boutonEnregistrer": "Enregistrer",
      "toastEnregistre": "Profil entreprise enregistré",
      "erreurEnregistrement": "Échec de l'enregistrement. Réessayez."
    },
```

- [ ] **Step 2: Ajouter les clés i18n (en)**

Dans `messages/en.json`, dans le bloc `Parametres.profilEntreprise`, remplacer :

```json
      "boutonEnregistrer": "Save",
      "toastEnregistre": "Company profile saved",
      "erreurEnregistrement": "Failed to save. Please try again."
    },
```

par :

```json
      "champCachet": "Company stamp",
      "boutonTeleverserCachet": "Upload stamp",
      "boutonRetirerCachet": "Remove",
      "toastCachetEnvoye": "Stamp saved",
      "toastCachetRetire": "Stamp removed",
      "champSignature": "Legal representative's signature",
      "boutonTeleverserSignature": "Upload signature",
      "boutonRetirerSignature": "Remove",
      "toastSignatureEnvoyee": "Signature saved",
      "toastSignatureRetiree": "Signature removed",
      "boutonEnregistrer": "Save",
      "toastEnregistre": "Company profile saved",
      "erreurEnregistrement": "Failed to save. Please try again."
    },
```

- [ ] **Step 3: Ajouter le sous-composant `ChampImageEntreprise` et les imports**

Dans `app/(app)/parametres/profil-entreprise-card.tsx`, remplacer le bloc d'imports :

```ts
import { toast } from "sonner";
import { modifierProfilEntreprise } from "@/lib/utilisateur/actions";
import { REGIMES_FISCAUX, type Entreprise, type RegimeFiscal } from "@/lib/utilisateur/types";
import { SECTEURS_CIBLES } from "@/lib/veille/classification-secteur";
```

par :

```ts
import { useEffect } from "react";
import { toast } from "sonner";
import {
  modifierProfilEntreprise,
  televerserCachetEntreprise,
  retirerCachetEntreprise,
  televerserSignatureEntreprise,
  retirerSignatureEntreprise,
} from "@/lib/utilisateur/actions";
import { genererUrlTelechargement } from "@/lib/documents/actions";
import { REGIMES_FISCAUX, type Entreprise, type RegimeFiscal } from "@/lib/utilisateur/types";
import { SECTEURS_CIBLES } from "@/lib/veille/classification-secteur";
```

(Note : `useState` est déjà importé en haut du fichier - on y ajoute seulement `useEffect`.)

Puis, juste avant `export function ProfilEntrepriseCard(...)`, ajouter le sous-composant :

```tsx
// Sous-composant local (pas partagé avec EnTetePiedPageCard, qui a sa
// propre logique de jetons {{logo}} à côté de son propre champ logo) :
// factorise l'upload/aperçu/retrait d'une image liée à l'entreprise,
// réutilisé pour le cachet et la signature ci-dessous. Même UX que le champ
// logo de EnTetePiedPageCard (aperçu via URL signée, bouton retirer).
function ChampImageEntreprise({
  label,
  cheminActuel,
  nomOriginalActuel,
  onTeleverser,
  onRetirer,
  texteBoutonTeleverser,
  texteBoutonRetirer,
  texteToastEnvoye,
  texteToastRetire,
}: {
  label: string;
  cheminActuel: string | null;
  nomOriginalActuel: string | null;
  onTeleverser: (formData: FormData) => Promise<{ erreur: string } | { succes: true }>;
  onRetirer: (cheminStockage: string) => Promise<{ erreur: string } | { succes: true }>;
  texteBoutonTeleverser: string;
  texteBoutonRetirer: string;
  texteToastEnvoye: string;
  texteToastRetire: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [retrait, setRetrait] = useState(false);

  useEffect(() => {
    if (!cheminActuel) {
      setUrl(null);
      return;
    }
    genererUrlTelechargement(cheminActuel).then((resultat) => {
      if ("url" in resultat) setUrl(resultat.url);
    });
  }, [cheminActuel]);

  async function televerser(formData: FormData) {
    setEnvoi(true);
    const resultat = await onTeleverser(formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(texteToastEnvoye);
  }

  async function retirer() {
    if (!cheminActuel) return;
    setRetrait(true);
    const resultat = await onRetirer(cheminActuel);
    setRetrait(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    toast.success(texteToastRetire);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {cheminActuel ? (
        <div className="flex items-center gap-3">
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu d'une image privée (URL signée temporaire), pas une image optimisable par next/image
            <img src={url} alt={nomOriginalActuel ?? ""} className="h-10 w-auto rounded border" />
          )}
          <span className="text-sm">{nomOriginalActuel}</span>
          <Button type="button" variant="ghost" size="sm" onClick={retirer} disabled={retrait}>
            {retrait && <Loader2 className="h-4 w-4 animate-spin" />}
            {texteBoutonRetirer}
          </Button>
        </div>
      ) : (
        <form action={televerser} className="flex items-center gap-2">
          <Input type="file" name="fichier" accept="image/png,image/jpeg" required className="max-w-xs" />
          <Button type="submit" disabled={envoi}>
            {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
            {texteBoutonTeleverser}
          </Button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Insérer les 2 instances dans `ProfilEntrepriseCard`**

Dans `app/(app)/parametres/profil-entreprise-card.tsx`, juste après le bloc du champ `profil-representant-qualite` (avant le bloc `champSecteursActivite`), insérer :

```tsx
        <ChampImageEntreprise
          label={t("champCachet")}
          cheminActuel={entreprise?.cachet_path ?? null}
          nomOriginalActuel={entreprise?.cachet_nom_original ?? null}
          onTeleverser={televerserCachetEntreprise}
          onRetirer={retirerCachetEntreprise}
          texteBoutonTeleverser={t("boutonTeleverserCachet")}
          texteBoutonRetirer={t("boutonRetirerCachet")}
          texteToastEnvoye={t("toastCachetEnvoye")}
          texteToastRetire={t("toastCachetRetire")}
        />
        <ChampImageEntreprise
          label={t("champSignature")}
          cheminActuel={entreprise?.signature_path ?? null}
          nomOriginalActuel={entreprise?.signature_nom_original ?? null}
          onTeleverser={televerserSignatureEntreprise}
          onRetirer={retirerSignatureEntreprise}
          texteBoutonTeleverser={t("boutonTeleverserSignature")}
          texteBoutonRetirer={t("boutonRetirerSignature")}
          texteToastEnvoye={t("toastSignatureEnvoyee")}
          texteToastRetire={t("toastSignatureRetiree")}
        />
```

- [ ] **Step 5: Vérifier la compilation et le JSON**

Run: `npx tsc --noEmit && node -e "JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('json ok')"`
Expected: aucune erreur, `json ok`.

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/parametres/profil-entreprise-card.tsx messages/fr.json messages/en.json
git commit -m "feat(parametres): upload cachet et signature dans le profil entreprise"
```

---

### Task 5 : `PlanExport` gagne `signature`/`cachet`

**Files:**
- Modify: `lib/appels-offres/export/plan.ts`

**Interfaces:**
- Consumes: `LogoExport` (existant, `./entete-pied-page`).
- Produces: `PlanExport.signature: LogoExport | null`, `PlanExport.cachet: LogoExport | null`, `EntrepriseExport.signature: LogoExport | null`, `EntrepriseExport.cachet: LogoExport | null`.

- [ ] **Step 1: Étendre `PlanExport`**

Dans `lib/appels-offres/export/plan.ts`, remplacer :

```ts
  nomEntreprise: string | null;
  logo: LogoExport | null;
  entete: { gauche: string | null; centre: string | null; droite: string | null };
  pied: { gauche: string | null; centre: string | null; droite: string | null };
}
```

(la première occurrence, dans `PlanExport`) par :

```ts
  nomEntreprise: string | null;
  logo: LogoExport | null;
  signature: LogoExport | null;
  cachet: LogoExport | null;
  entete: { gauche: string | null; centre: string | null; droite: string | null };
  pied: { gauche: string | null; centre: string | null; droite: string | null };
}
```

- [ ] **Step 2: Étendre `EntrepriseExport` et `ENTREPRISE_EXPORT_VIDE`**

Remplacer :

```ts
export interface EntrepriseExport {
  nomEntreprise: string | null;
  logo: LogoExport | null;
  entete: { gauche: string | null; centre: string | null; droite: string | null };
  pied: { gauche: string | null; centre: string | null; droite: string | null };
}

const ENTREPRISE_EXPORT_VIDE: EntrepriseExport = {
  nomEntreprise: null,
  logo: null,
  entete: { gauche: null, centre: null, droite: null },
  pied: { gauche: null, centre: null, droite: null },
};
```

par :

```ts
export interface EntrepriseExport {
  nomEntreprise: string | null;
  logo: LogoExport | null;
  signature: LogoExport | null;
  cachet: LogoExport | null;
  entete: { gauche: string | null; centre: string | null; droite: string | null };
  pied: { gauche: string | null; centre: string | null; droite: string | null };
}

const ENTREPRISE_EXPORT_VIDE: EntrepriseExport = {
  nomEntreprise: null,
  logo: null,
  signature: null,
  cachet: null,
  entete: { gauche: null, centre: null, droite: null },
  pied: { gauche: null, centre: null, droite: null },
};
```

- [ ] **Step 3: Propager dans le retour de `construirePlanExport`**

Remplacer :

```ts
    nomEntreprise: entrepriseExport.nomEntreprise,
    logo: entrepriseExport.logo,
    entete: entrepriseExport.entete,
    pied: entrepriseExport.pied,
  };
}
```

par :

```ts
    nomEntreprise: entrepriseExport.nomEntreprise,
    logo: entrepriseExport.logo,
    signature: entrepriseExport.signature,
    cachet: entrepriseExport.cachet,
    entete: entrepriseExport.entete,
    pied: entrepriseExport.pied,
  };
}
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: échoue sur `docx.test.ts`, `pdf.test.ts`, `xlsx.test.ts` (fixtures `PlanExport` littérales incomplètes) - confirme que l'extension du type est bien prise en compte. Corrigé dans les tâches suivantes.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/export/plan.ts
git commit -m "feat(export): PlanExport et EntrepriseExport portent signature et cachet"
```

---

### Task 6 : `TYPES_FORMULAIRE_SIGNE` dans `formulaires-standards.ts`

**Files:**
- Modify: `lib/appels-offres/formulaires-standards.ts`
- Test: `lib/appels-offres/formulaires-standards.test.ts`

**Interfaces:**
- Produces: `TYPES_FORMULAIRE_SIGNE: readonly TypeFormulaireStandard[]` (= `["lettre_soumission", "declaration_honneur", "pouvoir_habilitant"]`).

- [ ] **Step 1: Écrire le test (échoue, export inexistant)**

Dans `lib/appels-offres/formulaires-standards.test.ts`, ajouter à l'import existant `TYPES_FORMULAIRE_SIGNE` :

```ts
import {
  identifierFormulaireStandard,
  TYPES_FORMULAIRE_SIGNE,
  genererLettreSoumission,
  genererDeclarationHonneur,
  genererPouvoirHabilitant,
  genererFormulaireIdentification,
  genererTableauDocuments,
  genererProforma,
  genererLettrePropositionRevisee,
  genererLettreDemandeAbe,
  genererFormulaireAbeVierge,
} from "./formulaires-standards";
```

Et ajouter un nouveau `describe`, après celui de `identifierFormulaireStandard` :

```ts
describe("TYPES_FORMULAIRE_SIGNE", () => {
  it("contient exactement les 3 gabarits qui engagent juridiquement l'entreprise", () => {
    expect(TYPES_FORMULAIRE_SIGNE).toEqual([
      "lettre_soumission",
      "declaration_honneur",
      "pouvoir_habilitant",
    ]);
  });

  it("exclut les gabarits non signés (formulaire d'identification, tableaux)", () => {
    expect(TYPES_FORMULAIRE_SIGNE).not.toContain("formulaire_identification");
    expect(TYPES_FORMULAIRE_SIGNE).not.toContain("tableau_personnel");
    expect(TYPES_FORMULAIRE_SIGNE).not.toContain("tableau_materiel");
  });
});
```

- [ ] **Step 2: Lancer les tests, vérifier l'échec**

Run: `npx vitest run lib/appels-offres/formulaires-standards.test.ts`
Expected: FAIL (import `TYPES_FORMULAIRE_SIGNE` introuvable).

- [ ] **Step 3: Ajouter la constante**

Dans `lib/appels-offres/formulaires-standards.ts`, juste après la définition de `TypeFormulaireStandard` (avant `identifierFormulaireStandard`), ajouter :

```ts
// Les 3 seuls gabarits qui engagent juridiquement l'entreprise et se
// terminent par un bloc "Le représentant légal, {nom}" - voir
// docs/superpowers/specs/2026-10-29-cachet-signature-representant-legal-design.md.
// Formulaire d'identification et tableaux personnel/matériel en sont
// délibérément exclus (décision de scope du brainstorming).
export const TYPES_FORMULAIRE_SIGNE: readonly TypeFormulaireStandard[] = [
  "lettre_soumission",
  "declaration_honneur",
  "pouvoir_habilitant",
];
```

- [ ] **Step 4: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/formulaires-standards.test.ts`
Expected: PASS, tous les tests du fichier (existants + 2 nouveaux).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/formulaires-standards.ts lib/appels-offres/formulaires-standards.test.ts
git commit -m "feat(formulaires-standards): expose TYPES_FORMULAIRE_SIGNE"
```

---

### Task 7 : Insertion dans l'export Word

**Files:**
- Modify: `lib/appels-offres/export/docx.ts`
- Test: `lib/appels-offres/export/docx.test.ts`

**Interfaces:**
- Consumes: `TYPES_FORMULAIRE_SIGNE` (Task 6), `plan.signature`/`plan.cachet` (Task 5).

- [ ] **Step 1: Corriger les fixtures `PlanExport` existantes dans `docx.test.ts`**

Dans `lib/appels-offres/export/docx.test.ts`, dans `creerPlan`, remplacer :

```ts
    logo: null,
```

par :

```ts
    logo: null,
    signature: null,
    cachet: null,
```

- [ ] **Step 2: Écrire le test (échoue, aucune image insérée aujourd'hui)**

Ajouter, à la fin du fichier (avant la dernière accolade fermante du `describe("genererDocumentWord", ...)`) :

```ts
  describe("signature et cachet (gabarits signés)", () => {
    it("génère un buffer non vide pour une lettre de soumission avec signature et cachet", async () => {
      const buffer = await genererDocumentWord(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          signature: { buffer: Buffer.from("fake-signature-png"), type: "png" },
          cachet: { buffer: Buffer.from("fake-cachet-png"), type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("génère un buffer non vide pour une lettre de soumission avec seulement la signature", async () => {
      const buffer = await genererDocumentWord(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          signature: { buffer: Buffer.from("fake-signature-png"), type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("n'insère aucune image dans un gabarit non signé (formulaire d'identification)", async () => {
      const buffer = await genererDocumentWord(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Formulaire d'identification du soumissionnaire",
              contenu: "Raison sociale : SARL Exemple\n\nReprésentant légal : Jean Kouassi",
            },
          ],
          signature: { buffer: Buffer.from("fake-signature-png"), type: "png" },
          cachet: { buffer: Buffer.from("fake-cachet-png"), type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
```

- [ ] **Step 3: Lancer les tests, vérifier l'échec de compilation**

Run: `npx vitest run lib/appels-offres/export/docx.test.ts`
Expected: FAIL à la compilation TypeScript (`creerPlan` ne connaît pas encore `signature`/`cachet` avant le Step 1 déjà appliqué - une fois le Step 1 fait, les tests passent la compilation mais ne vérifient rien de spécifique encore ; ce test échoue seulement si l'implémentation lève une exception, ce qui n'est pas le cas ici puisqu'on ne fait qu'ajouter les champs sans les utiliser. Noter que `buffer.length > 0` est déjà vrai même sans l'implémentation du Step 4 - la régression attendue ici est seulement la vérification manuelle que le code compile avec les nouveaux champs avant d'ajouter le comportement.)

Expected concret : PASS (ces 3 tests ne distinguent pas encore "avec image" de "sans image" par leur seule assertion `length > 0` - cohérent avec le style de test déjà en place dans ce fichier, qui vérifie la génération sans erreur plutôt que le contenu binaire exact). Le test utile ici est que **rien ne lève d'exception** une fois l'implémentation du Step 4 branchée - lancer à nouveau après le Step 4 pour confirmer.

- [ ] **Step 4: Implémenter l'insertion d'image**

Dans `lib/appels-offres/export/docx.ts`, étendre l'import `docx` :

```ts
import {
  Document,
  Header,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  ImageRun,
  TabStopType,
  TabStopPosition,
  AlignmentType,
  type ParagraphChild,
} from "docx";
```

Et l'import des formulaires standards :

```ts
import { identifierFormulaireStandard, TYPES_FORMULAIRE_SIGNE } from "../formulaires-standards";
```

Ajouter, après `const ESPACEMENT_COMPACT = { after: 0, before: 0 };` :

```ts
// Dimensions fixes (pas de calcul de ratio d'aspect réel - même simplicité
// que TAILLE_LOGO_PX dans entete-pied-page.ts) : lisible sans dominer la
// page. Valeur à ajuster empiriquement si un cachet/signature réel s'avère
// trop grand ou trop petit (voir Task 10, vérification manuelle).
const LARGEUR_SIGNATURE_PX = 150;
const HAUTEUR_SIGNATURE_PX = 60;

function construireParagrapheSignature(
  signature: PlanExport["signature"],
  cachet: PlanExport["cachet"],
): Paragraph {
  const enfants: ParagraphChild[] = [];
  if (signature) {
    enfants.push(
      new ImageRun({
        type: signature.type,
        data: signature.buffer,
        transformation: { width: LARGEUR_SIGNATURE_PX, height: HAUTEUR_SIGNATURE_PX },
      }),
    );
  }
  if (cachet) {
    enfants.push(
      new ImageRun({
        type: cachet.type,
        data: cachet.buffer,
        transformation: { width: LARGEUR_SIGNATURE_PX, height: HAUTEUR_SIGNATURE_PX },
      }),
    );
  }
  return new Paragraph({ children: enfants });
}
```

Puis remplacer la boucle des sections rédigées :

```ts
  for (const section of plan.sectionsRedigees) {
    enfants.push(new Paragraph({ text: section.titre, heading: HeadingLevel.HEADING_1 }));
    const compacterCetteSection =
      compacterLettreSoumission &&
      identifierFormulaireStandard(section.titre) === "lettre_soumission";
    const paragraphes = section.contenu
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const paragraphe of paragraphes) {
      enfants.push(
        new Paragraph(
          compacterCetteSection
            ? { text: paragraphe, spacing: ESPACEMENT_COMPACT }
            : { text: paragraphe },
        ),
      );
    }
  }
```

par :

```ts
  for (const section of plan.sectionsRedigees) {
    enfants.push(new Paragraph({ text: section.titre, heading: HeadingLevel.HEADING_1 }));
    const typeFormulaire = identifierFormulaireStandard(section.titre);
    const compacterCetteSection = compacterLettreSoumission && typeFormulaire === "lettre_soumission";
    const estGabaritSigne = typeFormulaire !== null && TYPES_FORMULAIRE_SIGNE.includes(typeFormulaire);
    const paragraphes = section.contenu
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    paragraphes.forEach((paragraphe, index) => {
      const estDernierParagraphe = index === paragraphes.length - 1;
      if (estDernierParagraphe && estGabaritSigne && (plan.signature !== null || plan.cachet !== null)) {
        enfants.push(construireParagrapheSignature(plan.signature, plan.cachet));
      }
      enfants.push(
        new Paragraph(
          compacterCetteSection
            ? { text: paragraphe, spacing: ESPACEMENT_COMPACT }
            : { text: paragraphe },
        ),
      );
    });
  }
```

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/export/docx.test.ts`
Expected: PASS, tous les tests (existants + les 3 nouveaux de signature/cachet).

- [ ] **Step 6: Lancer toute la suite pour non-régression**

Run: `npx vitest run`
Expected: PASS (en particulier `xlsx.test.ts`, qui échouerait encore à la compilation à ce stade si ses fixtures `PlanExport` n'ont pas été corrigées - sinon, corriger `logo: null,` → `logo: null,\n    signature: null,\n    cachet: null,` aux 2 occurrences de `lib/appels-offres/export/xlsx.test.ts`, lignes ~19 et ~315, avant de relancer).

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/export/docx.ts lib/appels-offres/export/docx.test.ts lib/appels-offres/export/xlsx.test.ts
git commit -m "feat(export): insere signature et cachet dans l'export Word des gabarits signes"
```

---

### Task 8 : Primitive `ecrireImage` (PDF)

**Files:**
- Modify: `lib/appels-offres/export/pdf-layout.ts`

**Interfaces:**
- Consumes: `EtatRendu`, `MARGE`, `nouvellePage` (existants).
- Produces: `ecrireImage(etat: EtatRendu, buffer: Buffer, type: "png" | "jpg", dimensions: { largeur: number; hauteur: number }, x?: number): Promise<void>` - dessine à la position `(x, etat.y - hauteur)` **sans faire avancer `etat.y`** (pour permettre plusieurs images sur la même ligne) ; l'appelant avance `etat.y` lui-même via `ecrireEspace` une fois toutes les images de la ligne dessinées.

Pas de test dédié (`pdf-layout.ts` n'a aucun fichier de test existant - il est couvert indirectement par `pdf.test.ts` et `go-no-go-pdf.test.ts`, mêmes conventions que Task 7 Step 2 pour `docx.ts`). Couvert par le test de Task 9.

- [ ] **Step 1: Ajouter `ecrireImage`**

Dans `lib/appels-offres/export/pdf-layout.ts`, ajouter à la fin du fichier :

```ts
// Dessine une image à la position courante, sans avancer `etat.y` - contrairement
// à ecrireLigne, qui avance toujours d'une ligne. Permet à l'appelant de
// dessiner plusieurs images sur la même ligne horizontale (ex. signature +
// cachet côte à côte) avant d'avancer une seule fois via ecrireEspace.
// Vérifie le saut de page avant de dessiner (comme ecrireLigne) - sûr même
// pour plusieurs images de même hauteur sur une ligne, puisque `etat.y`
// n'a pas encore changé entre les appels.
export async function ecrireImage(
  etat: EtatRendu,
  buffer: Buffer,
  type: "png" | "jpg",
  dimensions: { largeur: number; hauteur: number },
  x = MARGE,
): Promise<void> {
  if (etat.y < MARGE + dimensions.hauteur) nouvellePage(etat);
  const image = type === "png" ? await etat.doc.embedPng(buffer) : await etat.doc.embedJpg(buffer);
  etat.page.drawImage(image, {
    x,
    y: etat.y - dimensions.hauteur,
    width: dimensions.largeur,
    height: dimensions.hauteur,
  });
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add lib/appels-offres/export/pdf-layout.ts
git commit -m "feat(export): primitive ecrireImage pour pdf-layout"
```

---

### Task 9 : Insertion dans l'export PDF

**Files:**
- Modify: `lib/appels-offres/export/pdf.ts`
- Test: `lib/appels-offres/export/pdf.test.ts`

**Interfaces:**
- Consumes: `ecrireImage` (Task 8), `TYPES_FORMULAIRE_SIGNE` (Task 6), `plan.signature`/`plan.cachet` (Task 5).

- [ ] **Step 1: Corriger les fixtures `PlanExport` existantes dans `pdf.test.ts`**

Dans `lib/appels-offres/export/pdf.test.ts`, dans `creerPlan`, remplacer :

```ts
    logo: null,
```

par :

```ts
    logo: null,
    signature: null,
    cachet: null,
```

- [ ] **Step 2: Écrire le test avec un vrai PNG (échoue, aucune image dessinée aujourd'hui)**

`pdf-lib` décode réellement le buffer PNG (contrairement à `docx.ImageRun`, qui n'exige aucun format valide pour produire un buffer) - un buffer factice comme `Buffer.from("fake-png")` ferait lever une exception à `embedPng`. Ajouter en haut du fichier, après les imports :

```ts
// Plus petit PNG valide possible (1x1 pixel transparent) - nécessaire ici
// car pdf-lib décode réellement le buffer (contrairement à docx.ImageRun,
// qui accepte n'importe quel buffer sans le valider).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
```

Puis ajouter, à la fin du fichier (avant la dernière accolade fermante du `describe("genererPdfDossier", ...)`) :

```ts
  describe("signature et cachet (gabarits signés)", () => {
    it("génère un buffer non vide pour une lettre de soumission avec signature et cachet", async () => {
      const buffer = await genererPdfDossier(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          signature: { buffer: PNG_1X1, type: "png" },
          cachet: { buffer: PNG_1X1, type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("génère un buffer non vide pour une lettre de soumission avec seulement le cachet", async () => {
      const buffer = await genererPdfDossier(
        creerPlan({
          sectionsRedigees: [
            {
              titre: "Lettre de soumission",
              contenu: "Je soussigné...\n\nLe représentant légal,\nJean Kouassi",
            },
          ],
          cachet: { buffer: PNG_1X1, type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("n'insère aucune image dans un gabarit non signé (déclaration non reconnue)", async () => {
      const buffer = await genererPdfDossier(
        creerPlan({
          sectionsRedigees: [
            { titre: "Tableau du matériel", contenu: "Désignation : Pelle mécanique" },
          ],
          signature: { buffer: PNG_1X1, type: "png" },
          cachet: { buffer: PNG_1X1, type: "png" },
        }),
      );
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
```

- [ ] **Step 3: Lancer les tests, vérifier l'échec**

Run: `npx vitest run lib/appels-offres/export/pdf.test.ts`
Expected: PASS à ce stade (aucune image n'est encore dessinée, mais rien ne lève d'exception non plus puisque le code actuel ignore simplement `plan.signature`/`plan.cachet`). Relancer après le Step 4 pour confirmer qu'aucune régression n'est introduite par le branchement réel de `ecrireImage`.

- [ ] **Step 4: Implémenter l'insertion d'image**

Dans `lib/appels-offres/export/pdf.ts`, étendre les imports :

```ts
import { PDFDocument } from "pdf-lib";
import type { PlanExport } from "./plan";
import type { LogoExport } from "./entete-pied-page";
import type { OptionsExportWord } from "./docx";
import { formaterMontant } from "../bpu";
import { creerEtatRendu, ecrireLigne, ecrireEspace, ecrireImage, type EtatRendu } from "./pdf-layout";
import { identifierFormulaireStandard, TYPES_FORMULAIRE_SIGNE } from "../formulaires-standards";
```

Ajouter, après `const LIBELLE_GARDE_PLI` :

```ts
// Mêmes dimensions que LARGEUR_SIGNATURE_PX/HAUTEUR_SIGNATURE_PX côté Word
// (docx.ts) - repère visuel cohérent entre les deux formats d'export.
const LARGEUR_SIGNATURE_PDF = 150;
const HAUTEUR_SIGNATURE_PDF = 60;

// pdf-lib n'embarque que PNG/JPEG (contrairement à docx.ImageRun, qui
// accepte aussi GIF/BMP) - sans conséquence en pratique puisque l'upload
// du cachet/de la signature est déjà restreint à PNG/JPEG (même schéma Zod
// que le logo, voir televerserLogoSchema), mais LogoExport.type reste
// typé sur l'union à 4 valeurs par réutilisation du type existant.
function typeImagePdf(type: LogoExport["type"]): "png" | "jpg" {
  return type === "png" ? "png" : "jpg";
}

// Dessine signature puis cachet côte à côte sur la même ligne (ecrireImage
// ne fait pas avancer `etat.y` lui-même - voir pdf-layout.ts), puis avance
// une seule fois une fois les deux dessinées.
async function ecrireImagesSignature(
  etat: EtatRendu,
  signature: LogoExport | null,
  cachet: LogoExport | null,
): Promise<void> {
  if (!signature && !cachet) return;
  if (signature) {
    await ecrireImage(etat, signature.buffer, typeImagePdf(signature.type), {
      largeur: LARGEUR_SIGNATURE_PDF,
      hauteur: HAUTEUR_SIGNATURE_PDF,
    });
  }
  if (cachet) {
    const x = MARGE_SIGNATURE_X(signature !== null);
    await ecrireImage(
      etat,
      cachet.buffer,
      typeImagePdf(cachet.type),
      { largeur: LARGEUR_SIGNATURE_PDF, hauteur: HAUTEUR_SIGNATURE_PDF },
      x,
    );
  }
  ecrireEspace(etat, HAUTEUR_SIGNATURE_PDF + 4);
}

function MARGE_SIGNATURE_X(signaturePresente: boolean): number {
  // 50 = MARGE (pdf-layout.ts) - pas réexportée, valeur dupliquée
  // volontairement ici plutôt que de l'exporter pour un seul usage externe.
  const MARGE_LOCALE = 50;
  return MARGE_LOCALE + (signaturePresente ? LARGEUR_SIGNATURE_PDF + 10 : 0);
}
```

Puis remplacer la boucle des sections rédigées :

```ts
  for (const section of plan.sectionsRedigees) {
    ecrireLigne(etat, section.titre, { gras: true, taille: 13 });
    const paragraphes = section.contenu
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (const paragraphe of paragraphes) {
      ecrireLigne(etat, paragraphe);
    }
    ecrireEspace(etat, 16);
  }
```

par :

```ts
  for (const section of plan.sectionsRedigees) {
    ecrireLigne(etat, section.titre, { gras: true, taille: 13 });
    const typeFormulaire = identifierFormulaireStandard(section.titre);
    const estGabaritSigne = typeFormulaire !== null && TYPES_FORMULAIRE_SIGNE.includes(typeFormulaire);
    const paragraphes = section.contenu
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    for (let i = 0; i < paragraphes.length; i++) {
      const estDernierParagraphe = i === paragraphes.length - 1;
      if (estDernierParagraphe && estGabaritSigne && (plan.signature !== null || plan.cachet !== null)) {
        await ecrireImagesSignature(etat, plan.signature, plan.cachet);
      }
      ecrireLigne(etat, paragraphes[i]);
    }
    ecrireEspace(etat, 16);
  }
```

- [ ] **Step 5: Lancer les tests, vérifier le succès**

Run: `npx vitest run lib/appels-offres/export/pdf.test.ts`
Expected: PASS, tous les tests (existants + les 3 nouveaux).

- [ ] **Step 6: Lancer toute la suite pour non-régression**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/appels-offres/export/pdf.ts lib/appels-offres/export/pdf.test.ts
git commit -m "feat(export): insere signature et cachet dans l'export PDF des gabarits signes"
```

---

### Task 10 : Branchement aux actions d'export + vérification manuelle

**Files:**
- Modify: `lib/appels-offres/actions.ts`

**Interfaces:**
- Consumes: `construirePlanExport` (Task 5), `LogoExport` (existant).
- Produces: les deux actions `exporterDossierReponse`/`exporterDossierReponsePli` téléchargent désormais aussi signature et cachet.

- [ ] **Step 1: Ajouter le helper de téléchargement**

Dans `lib/appels-offres/actions.ts`, juste avant `async function genererBufferExportDossier` (ligne ~836), ajouter :

```ts
// Partagé par exporterDossierReponse et exporterDossierReponsePli : les
// deux téléchargent logo, signature et cachet de la même façon (voir
// docs/superpowers/specs/2026-10-29-cachet-signature-representant-legal-design.md).
async function telechargerImageEntreprise(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cheminStockage: string | null,
  mimeType: string | null,
): Promise<LogoExport | null> {
  if (!cheminStockage || !mimeType) return null;
  const { data: blob } = await supabase.storage.from("documents").download(cheminStockage);
  if (!blob) return null;
  return {
    buffer: Buffer.from(await blob.arrayBuffer()),
    type: mimeType === "image/png" ? "png" : "jpg",
  };
}
```

- [ ] **Step 2: Brancher dans `exporterDossierReponse`**

Remplacer :

```ts
  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  let logo: LogoExport | null = null;
  if (entreprise?.logo_path && entreprise.logo_mime_type) {
    const { data: logoBlob } = await supabase.storage.from("documents").download(entreprise.logo_path);
    if (logoBlob) {
      logo = {
        buffer: Buffer.from(await logoBlob.arrayBuffer()),
        type: entreprise.logo_mime_type === "image/png" ? "png" : "jpg",
      };
    }
  }

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
    sectionsBpu,
    lignesParSectionBpu,
    {
      nomEntreprise: entreprise?.nom ?? null,
      logo,
      entete: {
        gauche: entreprise?.entete_gauche ?? null,
        centre: entreprise?.entete_centre ?? null,
        droite: entreprise?.entete_droite ?? null,
      },
      pied: {
        gauche: entreprise?.pied_gauche ?? null,
        centre: entreprise?.pied_centre ?? null,
        droite: entreprise?.pied_droite ?? null,
      },
    },
  );

  let buffer: Buffer;
  try {
    buffer = await genererBufferExportDossier(plan, format, options);
  } catch {
    return { erreur: "Échec de la génération de l'export. Réessayez." };
  }
  const cheminStockage = construireCheminStockageExport(utilisateur.entreprise_id, appelOffresId, format);
```

par :

```ts
  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  const [logo, signature, cachet] = await Promise.all([
    telechargerImageEntreprise(supabase, entreprise?.logo_path ?? null, entreprise?.logo_mime_type ?? null),
    telechargerImageEntreprise(
      supabase,
      entreprise?.signature_path ?? null,
      entreprise?.signature_mime_type ?? null,
    ),
    telechargerImageEntreprise(supabase, entreprise?.cachet_path ?? null, entreprise?.cachet_mime_type ?? null),
  ]);

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
    sectionsBpu,
    lignesParSectionBpu,
    {
      nomEntreprise: entreprise?.nom ?? null,
      logo,
      signature,
      cachet,
      entete: {
        gauche: entreprise?.entete_gauche ?? null,
        centre: entreprise?.entete_centre ?? null,
        droite: entreprise?.entete_droite ?? null,
      },
      pied: {
        gauche: entreprise?.pied_gauche ?? null,
        centre: entreprise?.pied_centre ?? null,
        droite: entreprise?.pied_droite ?? null,
      },
    },
  );

  let buffer: Buffer;
  try {
    buffer = await genererBufferExportDossier(plan, format, options);
  } catch {
    return { erreur: "Échec de la génération de l'export. Réessayez." };
  }
  const cheminStockage = construireCheminStockageExport(utilisateur.entreprise_id, appelOffresId, format);
```

- [ ] **Step 3: Brancher dans `exporterDossierReponsePli`**

Appliquer exactement le même remplacement (même bloc `let logo: LogoExport | null = null; ...` suivi du même appel `construirePlanExport(...)`, mais avec le 11ᵉ argument `pli` en plus) dans `exporterDossierReponsePli` : remplacer le bloc de téléchargement du logo par le même `Promise.all` que le Step 2, et ajouter `signature,` et `cachet,` à l'objet passé à `construirePlanExport` (juste après `logo,`), en laissant `pli` comme dernier argument inchangé.

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Lancer toute la suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/appels-offres/actions.ts
git commit -m "feat(appel-offres): telecharge signature et cachet pour l'export du dossier"
```

- [ ] **Step 7: Vérification manuelle en navigateur (dev server)**

1. Lancer `npm run dev`, se connecter en admin.
2. Aller sur `/parametres`, téléverser une image PNG pour le cachet et une pour la signature (section "Profil entreprise"). Vérifier l'aperçu et le nom de fichier affichés.
3. Recharger la page : vérifier que les deux images restent affichées (pas de régression après `revalidatePath`).
4. Sur un AO ayant une section générée de type "Lettre de soumission" (ou en générer une via le bouton de génération de formulaire standard existant), exporter en Word (bouton export existant, onglet concerné) : ouvrir le `.docx` téléchargé, vérifier que signature et cachet apparaissent juste avant le nom du représentant légal, lisibles, pas disproportionnés.
5. Exporter la même section en PDF : ouvrir le `.pdf`, vérifier la même chose.
6. Retirer le cachet dans `/parametres`, relancer l'export Word : vérifier que seule la signature apparaît (pas d'espace vide à la place du cachet).
7. Nettoyer : retirer aussi la signature si le compte de test ne doit pas garder ces données.

---

## Self-Review

**Spec coverage** :
- Modèle de données (6 colonnes) → Task 1. ✅
- Stockage/upload (Server Actions + chemins) → Task 2, 3. ✅
- Interface `/parametres` → Task 4. ✅
- Export Word (3 gabarits, ImageRun, repli transparent) → Task 5, 6, 7. ✅
- Export PDF (même scope, pdf-lib) → Task 5, 6, 8, 9. ✅
- Récupération des buffers aux 2 points d'entrée d'export → Task 10. ✅
- Hors scope (signataire multiple, autres gabarits, scan combiné, dimensionnement pixel-perfect) : non implémenté, conforme. ✅

**Placeholder scan** : aucun "TBD"/"TODO" ; toutes les étapes de code sont des blocs complets, aucune référence à une fonction non définie dans une tâche antérieure.

**Type consistency** : `LogoExport` (buffer + type png/jpg/gif/bmp) réutilisé tel quel pour `signature`/`cachet` partout (Task 5, 7, 9, 10) - aucun nouveau type dupliqué. `TYPES_FORMULAIRE_SIGNE` (Task 6) consommé identiquement dans `docx.ts` (Task 7) et `pdf.ts` (Task 9). `ecrireImage` (Task 8) a la même signature partout où elle est appelée (Task 9).

Plan complet et sauvegardé à `docs/superpowers/plans/2026-10-29-cachet-signature-representant-legal.md`.
