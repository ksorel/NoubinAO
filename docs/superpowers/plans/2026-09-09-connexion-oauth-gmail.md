# Connexion OAuth Gmail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un utilisateur de connecter son compte Gmail en lecture seule (OAuth), avec le refresh token stocké chiffré — premier sous-projet du Module 6, sans synchronisation d'email ni rattachement à un AO.

**Architecture:** Une table `compte_email_connecte` (RLS strictement privée au propriétaire), un module de chiffrement AES-256-GCM applicatif, deux routes handler pour le flux OAuth (redirection + callback via le package `googleapis`), une Server Action de déconnexion, et une nouvelle page `/parametres`.

**Tech Stack:** Next.js App Router (Route Handlers + Server Actions), Supabase (Postgres RLS), `googleapis` (client OAuth2 officiel), TypeScript, shadcn/ui (`Card`, `AlertDialog`), next-intl.

## Global Constraints

- Scope `gmail.readonly` uniquement — jamais d'écriture, jamais d'envoi.
- Un seul compte Gmail par utilisateur (`unique(utilisateur_id, fournisseur)`), connexion strictement privée à son propriétaire (RLS `utilisateur_id = auth.uid()`) — pas d'accès entreprise sur cette table.
- Refresh/access tokens toujours chiffrés en base (AES-256-GCM applicatif), jamais renvoyés par une fonction de lecture.
- `APP_URL` (jamais `VERCEL_URL`) pour construire l'URL de callback — piège déjà documenté dans `CLAUDE.md`.
- Aucune synchronisation d'email, aucun rattachement à un AO — hors périmètre de ce sous-projet.
- Spec complet : `docs/superpowers/specs/2026-09-09-connexion-oauth-gmail-design.md`.

---

### Task 1: Migration + types

**Files:**
- Create: `supabase/migrations/20260909150000_compte_email_connecte.sql`
- Create: `lib/email/types.ts`

**Interfaces:**
- Produces: table `compte_email_connecte` (colonnes : `id`, `utilisateur_id`, `entreprise_id`, `fournisseur`, `adresse_email`, `refresh_token_chiffre`, `access_token_chiffre`, `expire_le`, `statut`, `created_at`, `updated_at`) ; `FOURNISSEURS_EMAIL`, `FournisseurEmail`, `STATUTS_COMPTE_EMAIL`, `StatutCompteEmail`, `CompteEmailConnecte` (interface) — consommés par les tasks suivantes.

- [ ] **Step 1: Créer la migration**

```sql
-- Connexion OAuth Gmail (Module 6, sous-projet 1). Un compte email
-- connecté par utilisateur et par fournisseur, strictement privé à son
-- propriétaire (RLS) — contrairement aux emails eux-mêmes qui seront un
-- jour visibles par l'équipe une fois rattachés à un AO (table `email`,
-- sous-projet 3, pas celle-ci). Un token de connexion n'a pas de raison
-- d'être lisible par un collègue.
create type fournisseur_email as enum ('gmail', 'outlook');
create type statut_compte_email as enum ('connecte', 'revoque', 'erreur');

create table compte_email_connecte (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  fournisseur fournisseur_email not null,
  adresse_email text not null,
  refresh_token_chiffre text not null,
  access_token_chiffre text,
  expire_le timestamptz,
  statut statut_compte_email not null default 'connecte',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (utilisateur_id, fournisseur)
);

create index compte_email_connecte_utilisateur_id_idx on compte_email_connecte(utilisateur_id);

alter table compte_email_connecte enable row level security;

create policy "compte_email_connecte_select_self" on compte_email_connecte
  for select using (utilisateur_id = auth.uid());

create policy "compte_email_connecte_insert_self" on compte_email_connecte
  for insert with check (utilisateur_id = auth.uid());

create policy "compte_email_connecte_update_self" on compte_email_connecte
  for update using (utilisateur_id = auth.uid());

create policy "compte_email_connecte_delete_self" on compte_email_connecte
  for delete using (utilisateur_id = auth.uid());
```

- [ ] **Step 2: Relier la worktree au projet Supabase si nécessaire**

Si `npx supabase migration list` échoue avec `LegacyProjectNotLinkedError` :

Run: `npx supabase link --project-ref hjjmymgwvpsxajwtzjdh` (token dans `.env.local` du dépôt principal, jamais committé).

- [ ] **Step 3: Appliquer la migration**

Run: `npx supabase db push`

- [ ] **Step 4: Vérifier réellement que la table et les policies existent**

Run: `npx supabase db query --linked "select policyname, cmd from pg_policies where tablename = 'compte_email_connecte' order by policyname;"`

Expected : 4 lignes (`compte_email_connecte_delete_self`, `compte_email_connecte_insert_self`, `compte_email_connecte_select_self`, `compte_email_connecte_update_self`).

- [ ] **Step 5: Créer `lib/email/types.ts`**

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

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260909150000_compte_email_connecte.sql lib/email/types.ts
git commit -m "feat: table compte_email_connecte + types (Module 6, sous-projet 1)"
```

---

### Task 2: Chiffrement AES-256-GCM

**Files:**
- Create: `lib/email/chiffrement.ts`
- Test: `lib/email/chiffrement.test.ts`

**Interfaces:**
- Produces: `export function chiffrer(texteClair: string): string`, `export function dechiffrer(texteChiffre: string): string` — consommées par Task 4 (route de callback) et Task 5 (déconnexion).

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/email/chiffrement.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { chiffrer, dechiffrer } from "./chiffrement";

// Clé de test fixe (32 octets aléatoires encodés en base64) — jamais la
// vraie clé de production, qui ne vit que dans .env.local et Vercel.
process.env.EMAIL_TOKEN_ENCRYPTION_KEY =
  "oEtDycWloZ7myD+XeC/Ip9ngJFHc1FyG+QGg+0J/Xc4=";

describe("chiffrer / dechiffrer", () => {
  it("dechiffre exactement ce qui a été chiffré", () => {
    const original = "ya29.a0AfH6SMC_exemple_refresh_token";
    expect(dechiffrer(chiffrer(original))).toBe(original);
  });

  it("produit une sortie différente à chaque appel (IV aléatoire)", () => {
    const original = "meme-texte";
    expect(chiffrer(original)).not.toBe(chiffrer(original));
  });

  it("lève une erreur explicite si la clé de chiffrement est absente", () => {
    const cleOriginale = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    expect(() => chiffrer("x")).toThrow("EMAIL_TOKEN_ENCRYPTION_KEY manquante");
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = cleOriginale;
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run lib/email/chiffrement.test.ts`

Expected: FAIL — `lib/email/chiffrement.ts` n'existe pas encore (erreur de résolution de module).

- [ ] **Step 3: Créer `lib/email/chiffrement.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHME = "aes-256-gcm";

function obtenirCle(): Buffer {
  const cle = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!cle) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY manquante");
  return Buffer.from(cle, "base64");
}

export function chiffrer(texteClair: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHME, obtenirCle(), iv);
  const chiffre = Buffer.concat([
    cipher.update(texteClair, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, chiffre].map((b) => b.toString("base64")).join(".");
}

export function dechiffrer(texteChiffre: string): string {
  const [ivB64, authTagB64, chiffreB64] = texteChiffre.split(".");
  const decipher = createDecipheriv(
    ALGORITHME,
    obtenirCle(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const clair = Buffer.concat([
    decipher.update(Buffer.from(chiffreB64, "base64")),
    decipher.final(),
  ]);
  return clair.toString("utf8");
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run lib/email/chiffrement.test.ts`

Expected: PASS — 3/3 tests.

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/email/chiffrement.ts lib/email/chiffrement.test.ts
git commit -m "feat: chiffrement AES-256-GCM des tokens email"
```

---

### Task 3: Client OAuth Gmail

**Files:**
- Modify: `package.json`, `package-lock.json` (ajout de la dépendance `googleapis`)
- Create: `lib/email/gmail-oauth.ts`

**Interfaces:**
- Produces: `export const STATE_COOKIE = "gmail_oauth_state"`, `export function creerClientOAuth()` (retourne un `google.auth.OAuth2`, type inféré — volontairement pas d'annotation explicite pour ne pas dépendre de `google-auth-library` comme import direct, une dépendance transitive de `googleapis`), `export function genererUrlConsentement(state: string): string` — consommées par Task 4 et Task 5.

- [ ] **Step 1: Installer `googleapis`**

Run: `npm install googleapis`

- [ ] **Step 2: Créer `lib/email/gmail-oauth.ts`**

```ts
import { google } from "googleapis";

export const STATE_COOKIE = "gmail_oauth_state";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function creerClientOAuth() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/email/gmail/callback`,
  );
}

export function genererUrlConsentement(state: string): string {
  const client = creerClientOAuth();
  return client.generateAuthUrl({
    access_type: "offline", // nécessaire pour obtenir un refresh_token
    prompt: "consent", // force le renvoi du refresh_token même si déjà autorisé
    scope: SCOPES,
    state,
  });
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/email/gmail-oauth.ts
git commit -m "feat: client OAuth2 Gmail (googleapis)"
```

---

### Task 4: Routes OAuth (connexion + callback)

**Files:**
- Create: `app/api/email/gmail/connecter/route.ts`
- Create: `app/api/email/gmail/callback/route.ts`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant` (`lib/utilisateur/queries.ts`), `STATE_COOKIE`/`creerClientOAuth`/`genererUrlConsentement` (Task 3), `chiffrer` (Task 2).
- Produces: routes `GET /api/email/gmail/connecter` et `GET /api/email/gmail/callback` — consommées par Task 6 (bouton "Connecter Gmail" en lien `<a>`, et Google comme redirect URI).

**Pas de test automatisé** (dépend de Google — cohérent avec la décision du spec, validation manuelle une fois `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` obtenus).

- [ ] **Step 1: Créer `app/api/email/gmail/connecter/route.ts`**

```ts
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { STATE_COOKIE, genererUrlConsentement } from "@/lib/email/gmail-oauth";

export async function GET() {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  redirect(genererUrlConsentement(state));
}
```

- [ ] **Step 2: Créer `app/api/email/gmail/callback/route.ts`**

```ts
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { STATE_COOKIE, creerClientOAuth } from "@/lib/email/gmail-oauth";
import { chiffrer } from "@/lib/email/chiffrement";

export async function GET(request: NextRequest) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const erreurConsentement = searchParams.get("error");

  const cookieStore = await cookies();
  const stateAttendu = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  // Toutes les branches d'erreur ci-dessous alimentent `codeErreur` plutôt
  // que d'appeler redirect() directement à l'intérieur du bloc try/catch —
  // redirect() interrompt le rendu en levant une exception spéciale
  // (NEXT_REDIRECT) que le catch générique ci-dessous intercepterait sinon
  // par erreur, transformant une redirection réussie en redirection
  // d'échec. Un seul appel à redirect(), à la toute fin, hors de tout
  // try/catch.
  let codeErreur: string | null = null;

  if (erreurConsentement) {
    codeErreur = "consentement_refuse";
  } else if (!state || !stateAttendu || state !== stateAttendu) {
    codeErreur = "state_invalide";
  } else if (!code) {
    codeErreur = "echange_echoue";
  }

  if (!codeErreur) {
    try {
      const client = creerClientOAuth();
      const { tokens } = await client.getToken(code!);

      if (!tokens.refresh_token || !tokens.access_token) {
        codeErreur = "echange_echoue";
      } else {
        client.setCredentials(tokens);
        const gmail = google.gmail({ version: "v1", auth: client });
        const profil = await gmail.users.getProfile({ userId: "me" });
        const adresseEmail = profil.data.emailAddress;

        if (!adresseEmail) {
          codeErreur = "echange_echoue";
        } else {
          const supabase = await createClient();
          const { error } = await supabase.from("compte_email_connecte").upsert(
            {
              utilisateur_id: utilisateur.id,
              entreprise_id: utilisateur.entreprise_id,
              fournisseur: "gmail",
              adresse_email: adresseEmail,
              refresh_token_chiffre: chiffrer(tokens.refresh_token),
              access_token_chiffre: chiffrer(tokens.access_token),
              expire_le: tokens.expiry_date
                ? new Date(tokens.expiry_date).toISOString()
                : null,
              statut: "connecte",
            },
            { onConflict: "utilisateur_id,fournisseur" },
          );

          if (error) codeErreur = "enregistrement_echoue";
        }
      }
    } catch {
      codeErreur = "echange_echoue";
    }
  }

  redirect(codeErreur ? `/parametres?erreur=${codeErreur}` : "/parametres?succes=1");
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add app/api/email/gmail/connecter/route.ts app/api/email/gmail/callback/route.ts
git commit -m "feat: routes OAuth Gmail (connexion + callback)"
```

---

### Task 5: Lecture + déconnexion

**Files:**
- Create: `lib/email/queries.ts`
- Create: `lib/email/actions.ts`

**Interfaces:**
- Consumes: `creerClientOAuth` (Task 3), `dechiffrer` (Task 2), `StatutCompteEmail` (Task 1).
- Produces: `export async function obtenirCompteEmailConnecte(utilisateurId: string): Promise<{ adresseEmail: string; statut: StatutCompteEmail } | null>`, `export async function deconnecterCompteEmail(): Promise<{ erreur: string } | { succes: true }>` — consommées par Task 6.

**Pas de test dédié** pour ces deux fonctions (dépendent de Supabase/Google, cohérent avec l'absence de test déjà acceptée sur les Server Actions et lectures directes ailleurs dans le projet).

- [ ] **Step 1: Créer `lib/email/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import type { StatutCompteEmail } from "./types";

export async function obtenirCompteEmailConnecte(
  utilisateurId: string,
): Promise<{ adresseEmail: string; statut: StatutCompteEmail } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("compte_email_connecte")
    .select("adresse_email, statut")
    .eq("utilisateur_id", utilisateurId)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!data) return null;
  return { adresseEmail: data.adresse_email, statut: data.statut };
}
```

- [ ] **Step 2: Créer `lib/email/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";

export async function deconnecterCompteEmail(): Promise<
  { erreur: string } | { succes: true }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data: compte } = await supabase
    .from("compte_email_connecte")
    .select("refresh_token_chiffre")
    .eq("utilisateur_id", utilisateur.id)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (compte) {
    // Révocation côté Google en best-effort : la ligne locale doit être
    // supprimée même si Google est indisponible ou renvoie une erreur,
    // sinon l'utilisateur reste bloqué avec une connexion qu'il ne peut
    // plus retirer depuis l'interface.
    try {
      const client = creerClientOAuth();
      await client.revokeToken(dechiffrer(compte.refresh_token_chiffre));
    } catch {
      // ignoré délibérément, voir commentaire ci-dessus
    }
  }

  const { error } = await supabase
    .from("compte_email_connecte")
    .delete()
    .eq("utilisateur_id", utilisateur.id)
    .eq("fournisseur", "gmail");

  if (error) return { erreur: "Échec de la déconnexion. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/email/queries.ts lib/email/actions.ts
git commit -m "feat: lecture et déconnexion du compte email connecté"
```

---

### Task 6: Interface — page Réglages

**Files:**
- Modify: `components/app-sidebar.tsx`
- Create: `app/(app)/parametres/page.tsx`
- Create: `app/(app)/parametres/compte-email-card.tsx`
- Create: `app/(app)/parametres/toast-connexion.tsx`
- Create: `app/(app)/parametres/loading.tsx`
- Create: `app/(app)/parametres/error.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `obtenirCompteEmailConnecte`, `deconnecterCompteEmail` (Task 5).

- [ ] **Step 1: Ajouter la clé "reglages" dans `messages/fr.json`**

Le bloc `"Sidebar"` actuel (lignes 12-16) :

```json
  "Sidebar": {
    "bibliotheque": "Bibliothèque",
    "appelsOffres": "Appels d'offres",
    "pipeline": "Pipeline"
  },
```

Remplacer par :

```json
  "Sidebar": {
    "bibliotheque": "Bibliothèque",
    "appelsOffres": "Appels d'offres",
    "pipeline": "Pipeline",
    "reglages": "Réglages"
  },
```

- [ ] **Step 2: Ajouter le namespace "Parametres" dans `messages/fr.json`**

La fin du fichier actuel (lignes 203-208) :

```json
    "error": {
      "message": "Impossible de charger le pipeline.",
      "reessayer": "Réessayer"
    }
  }
}
```

Remplacer par :

```json
    "error": {
      "message": "Impossible de charger le pipeline.",
      "reessayer": "Réessayer"
    }
  },
  "Parametres": {
    "page": {
      "titre": "Réglages",
      "filAriane": "Réglages"
    },
    "gmail": {
      "titre": "Gmail",
      "description": "Connecte ta boîte Gmail pour centraliser les échanges liés à tes appels d'offres.",
      "nonConnecte": "Aucun compte connecté.",
      "statutErreur": "La connexion a expiré ou a échoué. Reconnecte ton compte.",
      "boutonConnecter": "Connecter Gmail",
      "boutonDeconnecter": "Déconnecter",
      "confirmerDeconnexionTitre": "Déconnecter ce compte Gmail ?",
      "confirmerDeconnexionDescription": "L'accès à cette boîte sera révoqué. Tu pourras reconnecter le même compte à tout moment.",
      "annuler": "Annuler",
      "toastDeconnecte": "Compte Gmail déconnecté"
    },
    "toast": {
      "gmailConnecte": "Compte Gmail connecté",
      "erreurConsentementRefuse": "Connexion annulée.",
      "erreurStateInvalide": "Échec de la connexion (session expirée). Réessaie.",
      "erreurEchangeEchoue": "Échec de la connexion à Gmail. Réessaie.",
      "erreurEnregistrementEchoue": "Échec de l'enregistrement de la connexion. Réessaie.",
      "erreurGenerique": "Une erreur est survenue."
    },
    "error": {
      "message": "Impossible de charger les réglages.",
      "reessayer": "Réessayer"
    }
  }
}
```

- [ ] **Step 3: Ajouter la clé "reglages" dans `messages/en.json`**

Le bloc `"Sidebar"` actuel (lignes 12-16) :

```json
  "Sidebar": {
    "bibliotheque": "Library",
    "appelsOffres": "Tenders",
    "pipeline": "Pipeline"
  },
```

Remplacer par :

```json
  "Sidebar": {
    "bibliotheque": "Library",
    "appelsOffres": "Tenders",
    "pipeline": "Pipeline",
    "reglages": "Settings"
  },
```

- [ ] **Step 4: Ajouter le namespace "Parametres" dans `messages/en.json`**

La fin du fichier actuel (lignes 203-208) :

```json
    "error": {
      "message": "Could not load the pipeline.",
      "reessayer": "Retry"
    }
  }
}
```

Remplacer par :

```json
    "error": {
      "message": "Could not load the pipeline.",
      "reessayer": "Retry"
    }
  },
  "Parametres": {
    "page": {
      "titre": "Settings",
      "filAriane": "Settings"
    },
    "gmail": {
      "titre": "Gmail",
      "description": "Connect your Gmail inbox to centralize exchanges tied to your tenders.",
      "nonConnecte": "No account connected.",
      "statutErreur": "The connection has expired or failed. Reconnect your account.",
      "boutonConnecter": "Connect Gmail",
      "boutonDeconnecter": "Disconnect",
      "confirmerDeconnexionTitre": "Disconnect this Gmail account?",
      "confirmerDeconnexionDescription": "Access to this inbox will be revoked. You can reconnect the same account at any time.",
      "annuler": "Cancel",
      "toastDeconnecte": "Gmail account disconnected"
    },
    "toast": {
      "gmailConnecte": "Gmail account connected",
      "erreurConsentementRefuse": "Connection cancelled.",
      "erreurStateInvalide": "Connection failed (session expired). Please try again.",
      "erreurEchangeEchoue": "Failed to connect to Gmail. Please try again.",
      "erreurEnregistrementEchoue": "Failed to save the connection. Please try again.",
      "erreurGenerique": "Something went wrong."
    },
    "error": {
      "message": "Could not load settings.",
      "reessayer": "Retry"
    }
  }
}
```

- [ ] **Step 5: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`

Expected: `OK`.

- [ ] **Step 6: Ajouter l'entrée sidebar dans `components/app-sidebar.tsx`**

L'import actuel (ligne 2) :

```ts
import { Library, FileSearch, Kanban } from "lucide-react";
```

Remplacer par :

```ts
import { Library, FileSearch, Kanban, Settings } from "lucide-react";
```

Le dernier `<SidebarMenuItem>` actuel :

```tsx
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

Remplacer par :

```tsx
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("pipeline")}>
              <Link href="/pipeline">
                <Kanban />
                <span>{t("pipeline")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("reglages")}>
              <Link href="/parametres">
                <Settings />
                <span>{t("reglages")}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
```

- [ ] **Step 7: Créer `app/(app)/parametres/toast-connexion.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function ToastConnexion({
  succes,
  erreur,
}: {
  succes: string | null;
  erreur: string | null;
}) {
  const t = useTranslations("Parametres.toast");
  const router = useRouter();

  useEffect(() => {
    if (succes) {
      toast.success(t("gmailConnecte"));
      router.replace("/parametres");
      return;
    }

    if (erreur) {
      const messagesErreur: Record<string, string> = {
        consentement_refuse: t("erreurConsentementRefuse"),
        state_invalide: t("erreurStateInvalide"),
        echange_echoue: t("erreurEchangeEchoue"),
        enregistrement_echoue: t("erreurEnregistrementEchoue"),
      };
      toast.error(messagesErreur[erreur] ?? t("erreurGenerique"));
      router.replace("/parametres");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [succes, erreur]);

  return null;
}
```

- [ ] **Step 8: Créer `app/(app)/parametres/compte-email-card.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { deconnecterCompteEmail } from "@/lib/email/actions";
import type { StatutCompteEmail } from "@/lib/email/types";

export function CompteEmailCard({
  compte,
}: {
  compte: { adresseEmail: string; statut: StatutCompteEmail } | null;
}) {
  const t = useTranslations("Parametres.gmail");
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const [isPending, startTransition] = useTransition();

  function confirmerDeconnexion() {
    startTransition(async () => {
      const resultat = await deconnecterCompteEmail();
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
      } else {
        toast.success(t("toastDeconnecte"));
      }
      setConfirmationOuverte(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {compte ? (
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">{compte.adresseEmail}</p>
            {compte.statut === "erreur" && (
              <p className="text-sm text-destructive">{t("statutErreur")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nonConnecte")}</p>
        )}
      </CardContent>
      <CardFooter>
        {compte ? (
          <Button variant="outline" onClick={() => setConfirmationOuverte(true)}>
            {t("boutonDeconnecter")}
          </Button>
        ) : (
          // <a> volontaire plutôt que <Link> : cette route redirige
          // toujours vers une origine externe (Google), la navigation
          // client de Link n'apporte rien ici.
          <Button asChild>
            <a href="/api/email/gmail/connecter">{t("boutonConnecter")}</a>
          </Button>
        )}
      </CardFooter>

      <AlertDialog open={confirmationOuverte} onOpenChange={setConfirmationOuverte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmerDeconnexionTitre")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmerDeconnexionDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("annuler")}</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={confirmerDeconnexion}>
              {t("boutonDeconnecter")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
```

- [ ] **Step 9: Créer `app/(app)/parametres/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { ToastConnexion } from "./toast-connexion";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const { succes, erreur } = await searchParams;
  const compte = await obtenirCompteEmailConnecte(utilisateur.id);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <h1 className="text-2xl font-bold">{t("titre")}</h1>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      <CompteEmailCard compte={compte} />
    </div>
  );
}
```

- [ ] **Step 10: Créer `app/(app)/parametres/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ChargementParametres() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full max-w-md" />
    </div>
  );
}
```

- [ ] **Step 11: Créer `app/(app)/parametres/error.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";

export default function ErreurParametres({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const t = useTranslations("Parametres.error");

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

- [ ] **Step 12: Ajouter `EMAIL_TOKEN_ENCRYPTION_KEY` à `CLAUDE.md`**

Le bloc actuel (lignes 175-190) :

````markdown
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODELE_REDACTION=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
RESEND_API_KEY=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
APP_URL=
```
````

Remplacer par :

````markdown
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
ANTHROPIC_MODELE_REDACTION=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_TOKEN_ENCRYPTION_KEY=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
RESEND_API_KEY=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
APP_URL=
```
````

Puis, juste après le paragraphe `**ANTHROPIC_MODELE_REDACTION**` existant (fin de fichier de cette section), ajouter un nouveau paragraphe :

```markdown
**`EMAIL_TOKEN_ENCRYPTION_KEY`** : clé de chiffrement AES-256-GCM (32 octets aléatoires encodés en base64, générée via `openssl rand -base64 32`) pour les refresh/access tokens email stockés dans `compte_email_connecte` — voir `lib/email/chiffrement.ts`. À générer une fois par environnement (dev/prod), ne jamais commiter, ne jamais réutiliser entre environnements.
```

- [ ] **Step 13: Générer la clé de chiffrement locale et l'ajouter à `.env.local`**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Ajouter manuellement la ligne `EMAIL_TOKEN_ENCRYPTION_KEY=<valeur générée>` à `.env.local` (fichier gitignoré, jamais committé) — nécessaire pour tester le flux OAuth en local avec `npm run dev`.

- [ ] **Step 14: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 15: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent, dont les 3 nouveaux de `chiffrement.test.ts`.

- [ ] **Step 16: Vérifier le build de production**

Run: `npx next build`

Expected: build réussi, aucune erreur.

- [ ] **Step 17: Commit**

```bash
git add "app/(app)/parametres" components/app-sidebar.tsx messages/fr.json messages/en.json CLAUDE.md
git commit -m "feat: page Réglages avec connexion/déconnexion Gmail"
```

- [ ] **Step 18: Vérification manuelle (bloquée tant que Google Cloud Console n'est pas configuré)**

Cette étape ne peut pas être automatisée : `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` doivent d'abord être obtenus depuis Google Cloud Console (projet + écran de consentement OAuth + identifiants OAuth, redirect URI `http://localhost:3000/api/email/gmail/callback` en développement). Une fois ces identifiants dans `.env.local` :

1. `npm run dev`, se connecter à l'application, aller sur `/parametres`.
2. Cliquer "Connecter Gmail", passer l'écran de consentement Google avec un vrai compte Gmail.
3. Vérifier la redirection vers `/parametres?succes=1`, le toast de confirmation, et l'adresse email affichée.
4. Vérifier en base (`npx supabase db query --linked "select adresse_email, statut, fournisseur from compte_email_connecte;"`) qu'une seule ligne existe, avec `refresh_token_chiffre` non lisible en clair.
5. Cliquer "Déconnecter", confirmer, vérifier que la ligne disparaît et que la carte repasse à l'état "non connecté".

---

## Self-Review Notes

- **Couverture du spec** : modèle de données (Task 1), chiffrement (Task 2), client OAuth + package `googleapis` (Task 3), les deux routes du flux OAuth (Task 4), lecture + déconnexion (Task 5), interface complète avec sidebar/page/carte/toast/loading/error/i18n/variables d'env (Task 6) — chaque section du spec a une tâche correspondante.
- **Cohérence des types** : `StatutCompteEmail`/`FournisseurEmail` définis une seule fois (Task 1), réutilisés sans redéfinition dans `queries.ts` (Task 5) et `compte-email-card.tsx` (Task 6). `{ adresseEmail: string; statut: StatutCompteEmail } | null` — même forme partout où le compte est consommé. `STATE_COOKIE` défini une seule fois (Task 3, `gmail-oauth.ts`), importé tel quel par les deux routes (Task 4).
- **Piège `redirect()` dans un `try/catch`** : identifié et évité explicitement dans la route de callback (Task 4) — un seul appel à `redirect()`, hors de tout bloc `try/catch`, avec un `codeErreur` intermédiaire pour porter le résultat de chaque branche.
- **`searchParams` en Promise** : vérifié contre la documentation Next.js locale (`node_modules/next/dist/docs`, ce projet utilise Next.js 16 avec des changements par rapport aux versions antérieures) avant d'écrire `page.tsx` — `searchParams` y est bien un `Promise<{...}>`, awaité dans le composant serveur.
- **Aucun placeholder** : chaque étape contient le code exact ou le texte exact à remplacer.
- **Hors périmètre respecté** : aucune tâche ne touche à la synchronisation d'email, au rattachement à un AO, ou à Outlook — conforme au spec.
