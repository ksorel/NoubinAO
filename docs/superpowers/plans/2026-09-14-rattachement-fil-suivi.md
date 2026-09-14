# Rattachement email ↔ AO + fil de suivi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de rattacher un email synchronisé (Module 6, sous-projet 2) à un AO par suggestion + confirmation manuelle, avec un fil de suivi affiché sur la page de détail de l'AO — dernier sous-projet planifié du Module 6.

**Architecture:** Une heuristique pure de score (acheteur + mots-clés titre + proximité de date) classe les emails non liés de l'utilisateur courant ; deux Server Actions lient/délient un email ; deux nouvelles policies RLS déclenchent la visibilité équipe au rattachement (pas à la synchronisation) ; une nouvelle section UI sur la page AO existante.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres RLS), TypeScript, shadcn/ui (`Select`), next-intl.

## Global Constraints

- Rattachement **suggéré, jamais automatique-silencieux** — l'utilisateur confirme toujours explicitement.
- Suggestions scopées **uniquement aux emails de l'utilisateur courant** (jamais ceux d'un collègue) — confidentialité déjà actée aux sous-projets 1-2.
- La visibilité équipe d'un email se déclenche **au rattachement** (`appel_offres_id is not null`), pas à la synchronisation — `email_select_self` (sous-projet 2) reste inchangée, s'additionne à la nouvelle policy.
- Délier reste réservé au propriétaire de l'email (`email_update_self`), même une fois l'email visible par l'équipe.
- Spec complet : `docs/superpowers/specs/2026-09-14-rattachement-fil-suivi-design.md`.

---

### Task 1: Migration RLS + type `Email` + lectures

**Files:**
- Create: `supabase/migrations/20260914150000_email_fil_suivi.sql`
- Modify: `lib/email/types.ts`
- Modify: `lib/email/queries.ts`

**Interfaces:**
- Produces: policies `email_select_equipe_si_rattache`/`email_update_self` ; `export interface Email` (`lib/email/types.ts`) ; `export async function listerEmailsLies(appelOffresId: string): Promise<Email[]>`, `export async function listerEmailsNonLies(utilisateurId: string): Promise<Email[]>` (`lib/email/queries.ts`) — consommées par Task 3, Task 4, Task 5.

- [ ] **Step 1: Créer la migration**

```sql
-- Rattachement email <-> AO (Module 6, sous-projet 3). Une fois
-- appel_offres_id renseigné sur un email, il devient visible par toute
-- l'équipe de l'entreprise — c'est ce rattachement qui déclenche la
-- visibilité "équipe" actée au sous-projet 1, pas la synchronisation
-- elle-même (email_select_self, sous-projet 2, reste inchangée : un
-- email non rattaché reste toujours privé à son propriétaire).
create policy "email_select_equipe_si_rattache" on email
  for select using (
    appel_offres_id is not null
    and exists (
      select 1 from utilisateur u
      where u.entreprise_id = email.entreprise_id and u.id = auth.uid()
    )
  );

-- Seul le propriétaire de la connexion (celui qui a reçu l'email) peut
-- le lier/délier — un email non rattaché n'est de toute façon visible
-- que par lui (email_select_self), donc lui seul peut jamais le
-- sélectionner dans l'interface pour le lier en premier lieu.
create policy "email_update_self" on email
  for update using (utilisateur_id = auth.uid());
```

- [ ] **Step 2: Relier la worktree au projet Supabase si nécessaire**

Si `npx supabase migration list` échoue avec `LegacyProjectNotLinkedError` :

Run: `npx supabase link --project-ref hjjmymgwvpsxajwtzjdh` (token dans `.env.local` du dépôt principal, jamais committé). Si `.env.local` n'existe pas dans cette worktree (gitignoré, pas copié automatiquement par `git worktree add`), le copier depuis le dépôt principal avant de continuer.

- [ ] **Step 3: Appliquer la migration**

Run: `npx supabase db push`

- [ ] **Step 4: Vérifier réellement que les policies existent**

Run: `npx supabase db query --linked "select policyname, cmd from pg_policies where tablename = 'email' order by policyname;"`

Expected : 4 lignes (`email_insert_self`, `email_select_equipe_si_rattache`, `email_select_self`, `email_update_self`).

- [ ] **Step 5: Créer le type `Email` dans `lib/email/types.ts`**

Le fichier actuel est :

```ts
export const FOURNISSEURS_EMAIL = ["gmail", "outlook"] as const;
export type FournisseurEmail = (typeof FOURNISSEURS_EMAIL)[number];

export const STATUTS_COMPTE_EMAIL = ["connecte", "revoque", "erreur"] as const;
export type StatutCompteEmail = (typeof STATUTS_COMPTE_EMAIL)[number];

export interface CompteEmailConnecte {
  id: string;
  utilisateur_id: string;
  entreprise_id: string;
  fournisseur: FournisseurEmail;
  adresse_email: string;
  refresh_token_chiffre: string;
  access_token_chiffre: string | null;
  expire_le: string | null;
  statut: StatutCompteEmail;
  created_at: string;
  updated_at: string;
}
```

Ajouter à la fin :

```ts

export interface Email {
  id: string;
  entreprise_id: string;
  utilisateur_id: string;
  compte_email_connecte_id: string;
  appel_offres_id: string | null;
  message_id_gmail: string;
  expediteur: string | null;
  destinataires: string | null;
  objet: string | null;
  contenu: string | null;
  pieces_jointes: { nom: string; tailleOctets: number; typeMime: string }[];
  recu_le: string | null;
  created_at: string;
}
```

- [ ] **Step 6: Ajouter `listerEmailsLies`/`listerEmailsNonLies` dans `lib/email/queries.ts`**

Le fichier actuel est :

```ts
import { createClient } from "@/lib/supabase/server";
import type { StatutCompteEmail } from "./types";

export async function obtenirCompteEmailConnecte(
  utilisateurId: string,
): Promise<
  { adresseEmail: string; statut: StatutCompteEmail; dernierSyncLe: string | null } | null
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compte_email_connecte")
    .select("adresse_email, statut, dernier_sync_le")
    .eq("utilisateur_id", utilisateurId)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!data) return null;
  return {
    adresseEmail: data.adresse_email,
    statut: data.statut,
    dernierSyncLe: data.dernier_sync_le,
  };
}
```

Remplacer l'import et ajouter les deux nouvelles fonctions à la fin :

```ts
import { createClient } from "@/lib/supabase/server";
import type { Email, StatutCompteEmail } from "./types";

export async function obtenirCompteEmailConnecte(
  utilisateurId: string,
): Promise<
  { adresseEmail: string; statut: StatutCompteEmail; dernierSyncLe: string | null } | null
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compte_email_connecte")
    .select("adresse_email, statut, dernier_sync_le")
    .eq("utilisateur_id", utilisateurId)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!data) return null;
  return {
    adresseEmail: data.adresse_email,
    statut: data.statut,
    dernierSyncLe: data.dernier_sync_le,
  };
}

export async function listerEmailsLies(appelOffresId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}

export async function listerEmailsNonLies(utilisateurId: string): Promise<Email[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email")
    .select("*")
    .eq("utilisateur_id", utilisateurId)
    .is("appel_offres_id", null)
    .order("recu_le", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Email[];
}
```

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 8: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 154/154 tests passent (aucun test ne couvre ces changements, rien ne doit casser ailleurs).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260914150000_email_fil_suivi.sql lib/email/types.ts lib/email/queries.ts
git commit -m "feat: policies RLS rattachement + type Email + lectures liées/non liées"
```

---

### Task 2: Heuristique de correspondance (TDD)

**Files:**
- Create: `lib/email/correspondance.ts`
- Test: `lib/email/correspondance.test.ts`

**Interfaces:**
- Produces: `export function extraireMotsCles(texte: string): string[]`, `export function calculerScoreCorrespondance(email: EmailAScorer, appelOffres: AppelOffresAScorer): number`, exported interfaces `EmailAScorer`/`AppelOffresAScorer` — consommées par Task 5.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/email/correspondance.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { calculerScoreCorrespondance, extraireMotsCles } from "./correspondance";

describe("extraireMotsCles", () => {
  it("retire les mots vides et les mots courts", () => {
    expect(extraireMotsCles("Construction de deux salles de classe")).toEqual([
      "construction",
      "deux",
      "salles",
      "classe",
    ]);
  });

  it("retire la ponctuation et les nombres entre parenthèses", () => {
    expect(extraireMotsCles("SALLES (02) + BUREAU")).toEqual(["salles", "bureau"]);
  });

  it("retourne un tableau vide pour une chaîne ne contenant que des mots vides/courts", () => {
    expect(extraireMotsCles("de la à un")).toEqual([]);
  });
});

describe("calculerScoreCorrespondance", () => {
  const appelOffres = {
    titre: "CONSTRUCTION DE DEUX SALLES DE CLASSE A L'ECOLE YACE",
    acheteur: "Mairie de Dabou",
    date_limite: "2026-08-24T09:30:00Z",
  };

  it("retourne 0 sans aucune correspondance", () => {
    const email = {
      objet: "Facture électricité",
      contenu: "Merci de régler avant le 30.",
      expediteur: "cie@exemple.ci",
      recu_le: "2026-01-01T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(0);
  });

  it("ajoute des points si le nom de l'acheteur apparaît dans l'objet", () => {
    const email = {
      objet: "Réponse Mairie de Dabou",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(10);
  });

  it("est insensible à la casse pour l'acheteur", () => {
    const email = {
      objet: "réponse MAIRIE DE DABOU",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(10);
  });

  it("ajoute des points par mot-clé du titre trouvé", () => {
    const email = {
      objet: "Salles de classe - suite",
      contenu: null,
      expediteur: null,
      recu_le: null,
    };
    // "salles" et "classe" sont deux mots-clés du titre après extraireMotsCles
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(4);
  });

  it("ajoute des points si la date de réception est proche de la date limite", () => {
    const email = {
      objet: null,
      contenu: null,
      expediteur: null,
      recu_le: "2026-08-20T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(3);
  });

  it("n'ajoute pas de points si la date de réception est loin de la date limite", () => {
    const email = {
      objet: null,
      contenu: null,
      expediteur: null,
      recu_le: "2026-01-01T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(0);
  });

  it("cumule les trois signaux", () => {
    const email = {
      objet: "Mairie de Dabou - Salles de classe",
      contenu: null,
      expediteur: null,
      recu_le: "2026-08-20T00:00:00Z",
    };
    expect(calculerScoreCorrespondance(email, appelOffres)).toBe(10 + 4 + 3);
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run lib/email/correspondance.test.ts`

Expected: FAIL — `lib/email/correspondance.ts` n'existe pas encore (erreur de résolution de module).

- [ ] **Step 3: Créer `lib/email/correspondance.ts`**

```ts
const MOTS_VIDES = new Set([
  "de", "la", "le", "les", "des", "du", "un", "une", "et", "ou", "pour",
  "avec", "dans", "sur", "au", "aux", "en", "à", "d", "l", "par",
]);

export function extraireMotsCles(texte: string): string[] {
  return texte
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((mot) => mot.length >= 4 && !MOTS_VIDES.has(mot));
}

const QUARANTE_CINQ_JOURS_MS = 45 * 24 * 60 * 60 * 1000;

export interface EmailAScorer {
  objet: string | null;
  contenu: string | null;
  expediteur: string | null;
  recu_le: string | null;
}

export interface AppelOffresAScorer {
  titre: string | null;
  acheteur: string | null;
  date_limite: string | null;
}

export function calculerScoreCorrespondance(
  email: EmailAScorer,
  appelOffres: AppelOffresAScorer,
): number {
  const texteEmail = [email.objet, email.expediteur, email.contenu]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;

  if (appelOffres.acheteur && texteEmail.includes(appelOffres.acheteur.toLowerCase())) {
    score += 10;
  }

  if (appelOffres.titre) {
    const motsCles = extraireMotsCles(appelOffres.titre);
    const correspondances = motsCles.filter((mot) => texteEmail.includes(mot)).length;
    score += correspondances * 2;
  }

  if (appelOffres.date_limite && email.recu_le) {
    const diffMs = Math.abs(
      new Date(email.recu_le).getTime() - new Date(appelOffres.date_limite).getTime(),
    );
    if (diffMs <= QUARANTE_CINQ_JOURS_MS) score += 3;
  }

  return score;
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run lib/email/correspondance.test.ts`

Expected: PASS — 10/10 tests.

Si le test "ajoute des points par mot-clé du titre trouvé" ne donne pas exactement 4 : vérifier manuellement le résultat de `extraireMotsCles("CONSTRUCTION DE DEUX SALLES DE CLASSE A L'ECOLE YACE")` — il doit produire `["construction", "deux", "salles", "classe", "ecole", "yace"]` (le titre est en français avec accents normalisés par `\p{L}`, "a" et "l'" sont filtrés comme mots courts/vides). L'objet du test "Salles de classe - suite" ne contient que "salles" et "classe" parmi ces mots-clés → 2 correspondances × 2 points = 4. Si un désaccord apparaît entre ce raisonnement et le comportement réel du regex Unicode, documenter l'écart exact plutôt que d'ajuster arbitrairement la valeur attendue.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/email/correspondance.ts lib/email/correspondance.test.ts
git commit -m "feat: heuristique de correspondance email/AO (TDD)"
```

---

### Task 3: Extension de `obtenirAppelOffres`

**Files:**
- Modify: `lib/appels-offres/queries.ts`
- Modify: `app/(app)/appels-offres/[id]/page.tsx`

**Interfaces:**
- Consumes: `listerEmailsLies`, `listerEmailsNonLies` (Task 1).
- Produces: `obtenirAppelOffres` accepte un troisième paramètre `utilisateurId: string` et son objet de retour gagne `emailsLies: Email[]` et `emailsNonLies: Email[]` — consommés par Task 5.

- [ ] **Step 1: Modifier `lib/appels-offres/queries.ts`**

L'en-tête du fichier (imports) actuel est :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppelOffres, DossierReponse, ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";
```

Remplacer par :

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppelOffres, DossierReponse, ExigenceAo, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";
import type { Email } from "@/lib/email/types";
import { listerEmailsLies, listerEmailsNonLies } from "@/lib/email/queries";
```

La signature et le corps de `obtenirAppelOffres` actuels sont :

```ts
export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
): Promise<{
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  dossierReponse: DossierReponse;
  documentsParExigence: Record<string, Document[]>;
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
} | null> {
  const supabase = await createClient();

  const { data: appelOffres, error: erreurAppelOffres } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurAppelOffres || !appelOffres) return null;
```

Remplacer par :

```ts
export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
  utilisateurId: string,
): Promise<{
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  dossierReponse: DossierReponse;
  documentsParExigence: Record<string, Document[]>;
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: Email[];
  emailsNonLies: Email[];
} | null> {
  const supabase = await createClient();

  const { data: appelOffres, error: erreurAppelOffres } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurAppelOffres || !appelOffres) return null;
```

Le `return` final actuel de la fonction est :

```ts
  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: exigencesTypees,
    dossierReponse,
    documentsParExigence,
    sections: sectionsTypees,
    documentsParSection,
  };
}
```

Remplacer par :

```ts
  const [emailsLies, emailsNonLies] = await Promise.all([
    listerEmailsLies(id),
    listerEmailsNonLies(utilisateurId),
  ]);

  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: exigencesTypees,
    dossierReponse,
    documentsParExigence,
    sections: sectionsTypees,
    documentsParSection,
    emailsLies,
    emailsNonLies,
  };
}
```

- [ ] **Step 2: Modifier `app/(app)/appels-offres/[id]/page.tsx`**

La ligne d'appel actuelle est :

```ts
  const resultat = await obtenirAppelOffres(id, utilisateur.entreprise_id);
```

Remplacer par :

```ts
  const resultat = await obtenirAppelOffres(id, utilisateur.entreprise_id, utilisateur.id);
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: des erreurs sont attendues dans `app/(app)/appels-offres/[id]/appel-offres-detail.tsx` (le composant `AppelOffresDetail` ne reçoit pas encore `emailsLies`/`emailsNonLies` alors que `page.tsx` ne les lui transmet pas non plus à ce stade — normal, corrigé en Task 5). Vérifier que ce sont les seules erreurs.

- [ ] **Step 4: Commit**

```bash
git add lib/appels-offres/queries.ts "app/(app)/appels-offres/[id]/page.tsx"
git commit -m "feat: obtenirAppelOffres charge les emails liés et non liés"
```

---

### Task 4: Server Actions de rattachement

**Files:**
- Modify: `lib/email/actions.ts`

**Interfaces:**
- Produces: `export async function lierEmailAAppelOffres(appelOffresId: string, emailId: string): Promise<{ erreur: string } | { succes: true }>`, `export async function delierEmailAppelOffres(appelOffresId: string, emailId: string): Promise<{ erreur: string } | { succes: true }>` — consommées par Task 5.

**Pas de test dédié** (cohérent avec les autres Server Actions du fichier, ex. `deconnecterCompteEmail`).

- [ ] **Step 1: Ajouter les deux fonctions à la fin de `lib/email/actions.ts`**

```ts

export async function lierEmailAAppelOffres(
  appelOffresId: string,
  emailId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // .select("id") force la requête à renvoyer les lignes réellement
  // modifiées — même défense en profondeur que modifierStatutPipeline
  // (lib/appels-offres/actions.ts) : sans elle, un emailId périmé ou déjà
  // rattaché ailleurs renverrait {succes: true} sans qu'aucune ligne
  // n'ait été modifiée. La policy email_update_self garantit déjà que
  // seul le propriétaire peut modifier CET email ; ce filtre supplémentaire
  // (utilisateur_id) est une seconde barrière explicite, pas la seule.
  const { data, error } = await supabase
    .from("email")
    .update({ appel_offres_id: appelOffresId })
    .eq("id", emailId)
    .eq("utilisateur_id", utilisateur.id)
    .select("id");

  if (error) return { erreur: "Échec du rattachement. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Email introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function delierEmailAppelOffres(
  appelOffresId: string,
  emailId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("email")
    .update({ appel_offres_id: null })
    .eq("id", emailId)
    .eq("utilisateur_id", utilisateur.id)
    .select("id");

  if (error) return { erreur: "Échec de la dissociation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Email introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: mêmes erreurs qu'à la fin de la Task 3 (toujours dans `appel-offres-detail.tsx`), rien de nouveau.

- [ ] **Step 3: Commit**

```bash
git add lib/email/actions.ts
git commit -m "feat: Server Actions lierEmailAAppelOffres / delierEmailAppelOffres"
```

---

### Task 5: Interface — fil de suivi

**Files:**
- Create: `app/(app)/appels-offres/[id]/fil-suivi.tsx`
- Modify: `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `lierEmailAAppelOffres`, `delierEmailAppelOffres` (Task 4), `calculerScoreCorrespondance` (Task 2), `Email` (Task 1), `emailsLies`/`emailsNonLies` (Task 3).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Le bloc `"detail"` actuel se termine par (dans `"AppelsOffres"`) :

```json
      "redaction": {
        "titre": "Rédaction assistée",
        "boutonGenerer": "Générer",
        "boutonRegenerer": "Régénérer",
        "generationEnCours": "Génération en cours...",
        "boutonValider": "Valider",
        "boutonDevalider": "Repasser en brouillon",
        "statutBrouillon": "Brouillon",
        "statutValidee": "Validée",
        "placeholderSelect": "Ajouter un document source...",
        "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
        "retirerSource": "Retirer",
        "aucuneSource": "Aucun document source sélectionné.",
        "boutonEnregistrerTexte": "Enregistrer le texte",
        "erreurGeneration": "Échec de la génération. Réessayez.",
        "erreurEnregistrement": "Échec de l'enregistrement. Réessayez.",
        "erreurValidation": "Échec de la mise à jour du statut. Réessayez."
      },
      "error": {
        "message": "Impossible de charger cet appel d'offres.",
        "reessayer": "Réessayer"
      }
    }
  },
```

Remplacer par (ajout du bloc `filSuivi` avant `error`) :

```json
      "redaction": {
        "titre": "Rédaction assistée",
        "boutonGenerer": "Générer",
        "boutonRegenerer": "Régénérer",
        "generationEnCours": "Génération en cours...",
        "boutonValider": "Valider",
        "boutonDevalider": "Repasser en brouillon",
        "statutBrouillon": "Brouillon",
        "statutValidee": "Validée",
        "placeholderSelect": "Ajouter un document source...",
        "bibliothequeVide": "Aucun document dans la bibliothèque. Ajoutez-en depuis la Bibliothèque.",
        "retirerSource": "Retirer",
        "aucuneSource": "Aucun document source sélectionné.",
        "boutonEnregistrerTexte": "Enregistrer le texte",
        "erreurGeneration": "Échec de la génération. Réessayez.",
        "erreurEnregistrement": "Échec de l'enregistrement. Réessayez.",
        "erreurValidation": "Échec de la mise à jour du statut. Réessayez."
      },
      "filSuivi": {
        "titre": "Fil de suivi",
        "aucunEmailLie": "Aucun email lié pour l'instant.",
        "sansObjet": "(sans objet)",
        "delier": "Délier",
        "placeholderSelect": "Lier un email...",
        "aucuneSuggestion": "Aucun email correspondant trouvé.",
        "erreurRattachement": "Échec du rattachement. Réessayez.",
        "erreurDissociation": "Échec de la dissociation. Réessayez."
      },
      "error": {
        "message": "Impossible de charger cet appel d'offres.",
        "reessayer": "Réessayer"
      }
    }
  },
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Le bloc `"detail"` actuel se termine par :

```json
      "redaction": {
        "titre": "AI-assisted drafting",
        "boutonGenerer": "Generate",
        "boutonRegenerer": "Regenerate",
        "generationEnCours": "Generating...",
        "boutonValider": "Approve",
        "boutonDevalider": "Revert to draft",
        "statutBrouillon": "Draft",
        "statutValidee": "Approved",
        "placeholderSelect": "Add a source document...",
        "bibliothequeVide": "No document in the library yet. Add one from the Library.",
        "retirerSource": "Remove",
        "aucuneSource": "No source document selected.",
        "boutonEnregistrerTexte": "Save text",
        "erreurGeneration": "Failed to generate. Please try again.",
        "erreurEnregistrement": "Failed to save. Please try again.",
        "erreurValidation": "Failed to update status. Please try again."
      },
      "error": {
        "message": "Could not load this tender.",
        "reessayer": "Retry"
      }
    }
  },
```

Remplacer par :

```json
      "redaction": {
        "titre": "AI-assisted drafting",
        "boutonGenerer": "Generate",
        "boutonRegenerer": "Regenerate",
        "generationEnCours": "Generating...",
        "boutonValider": "Approve",
        "boutonDevalider": "Revert to draft",
        "statutBrouillon": "Draft",
        "statutValidee": "Approved",
        "placeholderSelect": "Add a source document...",
        "bibliothequeVide": "No document in the library yet. Add one from the Library.",
        "retirerSource": "Remove",
        "aucuneSource": "No source document selected.",
        "boutonEnregistrerTexte": "Save text",
        "erreurGeneration": "Failed to generate. Please try again.",
        "erreurEnregistrement": "Failed to save. Please try again.",
        "erreurValidation": "Failed to update status. Please try again."
      },
      "filSuivi": {
        "titre": "Activity thread",
        "aucunEmailLie": "No email linked yet.",
        "sansObjet": "(no subject)",
        "delier": "Unlink",
        "placeholderSelect": "Link an email...",
        "aucuneSuggestion": "No matching email found.",
        "erreurRattachement": "Failed to link the email. Please try again.",
        "erreurDissociation": "Failed to unlink the email. Please try again."
      },
      "error": {
        "message": "Could not load this tender.",
        "reessayer": "Retry"
      }
    }
  },
```

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`

Expected: `OK`.

- [ ] **Step 4: Créer `app/(app)/appels-offres/[id]/fil-suivi.tsx`**

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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { lierEmailAAppelOffres, delierEmailAppelOffres } from "@/lib/email/actions";
import { calculerScoreCorrespondance } from "@/lib/email/correspondance";
import type { Email } from "@/lib/email/types";
import type { AppelOffres } from "@/lib/appels-offres/types";

const NB_SUGGESTIONS_MAX = 10;

export function FilSuivi({
  appelOffresId,
  appelOffres,
  emailsLies: emailsLiesInitial,
  emailsNonLies,
}: {
  appelOffresId: string;
  appelOffres: Pick<AppelOffres, "titre" | "acheteur" | "date_limite">;
  emailsLies: Email[];
  emailsNonLies: Email[];
}) {
  const t = useTranslations("AppelsOffres.detail.filSuivi");
  const [emailsLies, setEmailsLies] = useState(emailsLiesInitial);
  const [emailsRestants, setEmailsRestants] = useState(emailsNonLies);
  const [isPending, startTransition] = useTransition();

  const suggestions = emailsRestants
    .map((email) => ({ email, score: calculerScoreCorrespondance(email, appelOffres) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, NB_SUGGESTIONS_MAX)
    .map(({ email }) => email);

  function onLier(emailId: string) {
    const email = emailsRestants.find((e) => e.id === emailId);
    if (!email) return;

    startTransition(async () => {
      const resultat = await lierEmailAAppelOffres(appelOffresId, emailId);
      if ("erreur" in resultat) {
        toast.error(t("erreurRattachement"));
        return;
      }
      setEmailsLies((liste) => [email, ...liste]);
      setEmailsRestants((liste) => liste.filter((e) => e.id !== emailId));
    });
  }

  function onDelier(emailId: string) {
    const precedent = emailsLies;
    setEmailsLies((liste) => liste.filter((e) => e.id !== emailId));

    startTransition(async () => {
      const resultat = await delierEmailAppelOffres(appelOffresId, emailId);
      if ("erreur" in resultat) {
        toast.error(t("erreurDissociation"));
        setEmailsLies(precedent);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {emailsLies.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("aucunEmailLie")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {emailsLies.map((email) => (
            <li key={email.id} className="border-b pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{email.objet ?? t("sansObjet")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onDelier(email.id)}
                >
                  {t("delier")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{email.expediteur}</p>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 ? (
        <Select key={emailsLies.length} onValueChange={onLier} disabled={isPending}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("placeholderSelect")} />
          </SelectTrigger>
          <SelectContent>
            {suggestions.map((email) => (
              <SelectItem key={email.id} value={email.id}>
                {email.objet ?? t("sansObjet")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">{t("aucuneSuggestion")}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Modifier `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`**

L'import de `DocumentsExigence` actuel (ligne 18) est suivi par les autres imports :

```tsx
import { DocumentsExigence } from "./documents-exigence";
import type { Document } from "@/lib/documents/types";
import { SectionRedaction } from "./section-redaction";
import type { SectionDossier } from "@/lib/appels-offres/types";
```

Remplacer par :

```tsx
import { DocumentsExigence } from "./documents-exigence";
import type { Document } from "@/lib/documents/types";
import { SectionRedaction } from "./section-redaction";
import type { SectionDossier } from "@/lib/appels-offres/types";
import { FilSuivi } from "./fil-suivi";
import type { Email } from "@/lib/email/types";
```

La signature du composant actuelle est :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
}) {
```

Remplacer par :

```tsx
export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
  emailsLies,
  emailsNonLies,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: Email[];
  emailsNonLies: Email[];
}) {
```

Le bloc "Critères d'évaluation" actuel se termine, suivi par le bloc de rédaction assistée :

```tsx
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

          {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
```

Remplacer par (insertion de la section "Fil de suivi" entre les deux) :

```tsx
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

          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("filSuivi.titre")}</h2>
            <FilSuivi
              appelOffresId={appelOffres.id}
              appelOffres={{
                titre: appelOffres.titre,
                acheteur: appelOffres.acheteur,
                date_limite: appelOffres.date_limite,
              }}
              emailsLies={emailsLies}
              emailsNonLies={emailsNonLies}
            />
          </div>

          {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
```

- [ ] **Step 6: Transmettre les nouvelles props depuis `app/(app)/appels-offres/[id]/page.tsx`**

Le rendu actuel de `<AppelOffresDetail>` est :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
      />
```

Remplacer par :

```tsx
      <AppelOffresDetail
        appelOffres={resultat.appelOffres}
        exigences={resultat.exigences}
        documentsParExigence={resultat.documentsParExigence}
        bibliotheque={bibliotheque}
        sections={resultat.sections}
        documentsParSection={resultat.documentsParSection}
        emailsLies={resultat.emailsLies}
        emailsNonLies={resultat.emailsNonLies}
      />
```

- [ ] **Step 7: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur (les erreurs transitoires des Tasks 3-4 doivent avoir disparu).

- [ ] **Step 8: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 164/164 tests passent (154 avant ce sous-projet + 10 nouveaux de `correspondance.test.ts`).

- [ ] **Step 9: Vérifier le build de production**

Run: `npx next build`

Expected: build réussi, aucune erreur.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/appels-offres/[id]/fil-suivi.tsx" "app/(app)/appels-offres/[id]/appel-offres-detail.tsx" "app/(app)/appels-offres/[id]/page.tsx" messages/fr.json messages/en.json
git commit -m "feat: interface fil de suivi (suggestions + rattachement manuel)"
```

---

## Self-Review Notes

- **Couverture du spec** : migration RLS + type + lectures (Task 1), heuristique de correspondance en TDD (Task 2), extension de `obtenirAppelOffres` (Task 3), Server Actions de rattachement (Task 4), interface (Task 5) — chaque section du spec a une tâche correspondante.
- **Cohérence des types** : `Email` défini une seule fois (Task 1), réutilisé sans redéfinition dans `queries.ts` (Task 1), `obtenirAppelOffres` (Task 3), `fil-suivi.tsx` (Task 5). `EmailAScorer`/`AppelOffresAScorer` (Task 2) sont des sous-ensembles structurels compatibles avec `Email`/`AppelOffres` sans import croisé — `fil-suivi.tsx` passe un objet `Pick<AppelOffres, "titre" | "acheteur" | "date_limite">` à `calculerScoreCorrespondance`, compatible par structure avec `AppelOffresAScorer` sans cast explicite nécessaire (TypeScript structurel).
- **Vérification manuelle du calcul de test le plus fragile** (Task 2, Step 4) : documentée explicitement avec la liste exacte de mots-clés attendue, pour qu'un désaccord soit immédiatement diagnostiqué plutôt que masqué par un ajustement de la valeur attendue.
- **Aucun placeholder** : chaque étape contient le code exact ou le texte exact à remplacer.
- **Vérification manuelle en conditions réelles** : ce sous-projet est entièrement testable avec les emails déjà synchronisés depuis le sous-projet 2 (pas de dépendance externe supplémentaire comme Google Cloud Console ou QStash) — à faire une fois le plan exécuté, sur le compte Gmail déjà connecté.
