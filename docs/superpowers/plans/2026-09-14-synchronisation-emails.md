# Synchronisation des emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Récupérer et stocker les messages Gmail des comptes connectés (Module 6, sous-projet 1) — synchronisation automatique horaire (Schedule QStash) et manuelle (bouton), sans rattachement à un AO ni exposition à l'équipe.

**Architecture:** Une fonction cœur `synchroniserCompteEmail` (Gmail API : liste + récupère les messages depuis une date, extrait un corps texte, insère avec anti-doublon) appelée par une route batch déclenchée par une Schedule QStash horaire (tous les comptes connectés) et par une Server Action manuelle (le compte de l'utilisateur courant).

**Tech Stack:** Next.js App Router (Route Handlers + Server Actions), Supabase (Postgres RLS), `googleapis`, `@upstash/qstash` (Schedules API), TypeScript.

## Global Constraints

- Fenêtre de sync : 30 jours glissants au premier sync, puis uniquement depuis `dernier_sync_le`.
- Fréquence automatique : toutes les heures (cron `0 * * * *`).
- Pièces jointes : métadonnées seulement (nom, taille, type MIME) — jamais de téléchargement de fichier.
- Corps complet du message (pas le snippet Gmail) — nécessaire au rattachement par mots-clés d'un sous-projet ultérieur.
- Chaque email reste **privé à son propriétaire** (`utilisateur_id = auth.uid()`) — aucune policy RLS élargie à l'entreprise dans ce sous-projet, `appel_offres_id` reste toujours `null` à l'issue de ce sous-projet.
- Un compte en échec de sync (token révoqué, erreur réseau) ne doit jamais bloquer la synchronisation des autres comptes du batch.
- `APP_URL` (jamais `VERCEL_URL`) pour toute URL de callback — piège déjà documenté dans `CLAUDE.md`.
- Spec complet : `docs/superpowers/specs/2026-09-14-synchronisation-emails-design.md`.

---

### Task 1: Migration — table `email` + colonne `dernier_sync_le`

**Files:**
- Create: `supabase/migrations/20260914120000_email.sql`

**Interfaces:**
- Produces: table `email` (colonnes : `id`, `entreprise_id`, `utilisateur_id`, `compte_email_connecte_id`, `appel_offres_id`, `message_id_gmail`, `expediteur`, `destinataires`, `objet`, `contenu`, `pieces_jointes`, `recu_le`, `created_at`) ; colonne `compte_email_connecte.dernier_sync_le` — consommées par toutes les tasks suivantes.

- [ ] **Step 1: Créer la migration**

```sql
-- Synchronisation des emails (Module 6, sous-projet 2). Un email
-- synchronisé reste strictement privé à son propriétaire (RLS) tant qu'il
-- n'est pas rattaché à un AO — appel_offres_id reste toujours null à
-- l'issue de ce sous-projet, un sous-projet ultérieur ajoutera la policy
-- élargie ("visible par l'équipe si appel_offres_id n'est pas null").
alter table compte_email_connecte
  add column dernier_sync_le timestamptz;

create table email (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  compte_email_connecte_id uuid not null references compte_email_connecte(id) on delete cascade,
  appel_offres_id uuid references appel_offres(id) on delete cascade,
  message_id_gmail text not null,
  expediteur text,
  destinataires text,
  objet text,
  contenu text,
  pieces_jointes jsonb not null default '[]'::jsonb,
  recu_le timestamptz,
  created_at timestamptz not null default now(),
  unique (compte_email_connecte_id, message_id_gmail)
);

create index email_utilisateur_id_idx on email(utilisateur_id);
create index email_appel_offres_id_idx on email(appel_offres_id);

alter table email enable row level security;

create policy "email_select_self" on email
  for select using (utilisateur_id = auth.uid());

create policy "email_insert_self" on email
  for insert with check (utilisateur_id = auth.uid());
```

- [ ] **Step 2: Relier la worktree au projet Supabase si nécessaire**

Si `npx supabase migration list` échoue avec `LegacyProjectNotLinkedError` :

Run: `npx supabase link --project-ref hjjmymgwvpsxajwtzjdh` (token dans `.env.local` du dépôt principal, jamais committé).

- [ ] **Step 3: Appliquer la migration**

Run: `npx supabase db push`

- [ ] **Step 4: Vérifier réellement que la table, la colonne et les policies existent**

Run: `npx supabase db query --linked "select column_name from information_schema.columns where table_name = 'compte_email_connecte' and column_name = 'dernier_sync_le';"`

Expected : 1 ligne, `dernier_sync_le`.

Run: `npx supabase db query --linked "select policyname, cmd from pg_policies where tablename = 'email' order by policyname;"`

Expected : 2 lignes (`email_insert_self`, `email_select_self`).

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur (cette task ne touche aucun fichier TypeScript, doit rester vert).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260914120000_email.sql
git commit -m "feat: table email + colonne dernier_sync_le (Module 6, sous-projet 2)"
```

---

### Task 2: Extraction du corps du message (TDD) + durcissement `chiffrement.ts`

**Files:**
- Create: `lib/email/extraction-message.ts`
- Test: `lib/email/extraction-message.test.ts`
- Modify: `lib/email/chiffrement.ts`

**Interfaces:**
- Produces: `export function extraireCorpsTexte(payload: PartieMessage | undefined): string | null`, exported type `PartieMessage` — consommée par Task 3.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/email/extraction-message.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { extraireCorpsTexte } from "./extraction-message";

// Base64url de "Bonjour, ceci est le corps en texte brut."
const CORPS_PLAIN_B64URL =
  "Qm9uam91ciwgY2VjaSBlc3QgbGUgY29ycHMgZW4gdGV4dGUgYnJ1dC4=";
// Base64url de "<p>Bonjour, <b>corps</b> en HTML.</p>"
const CORPS_HTML_B64URL = "PHA-Qm9uam91ciwgPGI-Y29ycHM8L2I-IGVuIEhUTUwuPC9wPg==";

describe("extraireCorpsTexte", () => {
  it("retourne null si le payload est undefined", () => {
    expect(extraireCorpsTexte(undefined)).toBeNull();
  });

  it("extrait un message text/plain simple (pas de parts)", () => {
    const payload = {
      mimeType: "text/plain",
      body: { data: CORPS_PLAIN_B64URL },
    };
    expect(extraireCorpsTexte(payload)).toBe(
      "Bonjour, ceci est le corps en texte brut.",
    );
  });

  it("préfère text/plain à text/html dans un message multipart", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: CORPS_HTML_B64URL } },
        { mimeType: "text/plain", body: { data: CORPS_PLAIN_B64URL } },
      ],
    };
    expect(extraireCorpsTexte(payload)).toBe(
      "Bonjour, ceci est le corps en texte brut.",
    );
  });

  it("replie sur text/html (tags retirés) si aucun text/plain", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [{ mimeType: "text/html", body: { data: CORPS_HTML_B64URL } }],
    };
    expect(extraireCorpsTexte(payload)).toBe(
      " Bonjour,  corps  en HTML. ",
    );
  });

  it("retourne null si aucune partie textuelle n'est trouvée", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "application/pdf",
          filename: "addenda.pdf",
          body: { size: 1024 },
        },
      ],
    };
    expect(extraireCorpsTexte(payload)).toBeNull();
  });

  it("descend récursivement dans des parts imbriquées", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          parts: [{ mimeType: "text/plain", body: { data: CORPS_PLAIN_B64URL } }],
        },
        {
          mimeType: "application/pdf",
          filename: "addenda.pdf",
          body: { size: 1024 },
        },
      ],
    };
    expect(extraireCorpsTexte(payload)).toBe(
      "Bonjour, ceci est le corps en texte brut.",
    );
  });
});
```

- [ ] **Step 2: Vérifier que le test échoue**

Run: `npx vitest run lib/email/extraction-message.test.ts`

Expected: FAIL — `lib/email/extraction-message.ts` n'existe pas encore (erreur de résolution de module).

- [ ] **Step 3: Créer `lib/email/extraction-message.ts`**

```ts
export interface PartieMessage {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: PartieMessage[];
}

export function extraireCorpsTexte(payload: PartieMessage | undefined): string | null {
  if (!payload) return null;

  const partieTexte = trouverPartie(payload, "text/plain");
  if (partieTexte?.body?.data) return decoderBase64Url(partieTexte.body.data);

  const partieHtml = trouverPartie(payload, "text/html");
  if (partieHtml?.body?.data) {
    return decoderBase64Url(partieHtml.body.data).replace(/<[^>]+>/g, " ");
  }

  return null;
}

function trouverPartie(
  partie: PartieMessage,
  mimeType: string,
): PartieMessage | null {
  if (partie.mimeType === mimeType) return partie;
  for (const sousPartie of partie.parts ?? []) {
    const trouvee = trouverPartie(sousPartie, mimeType);
    if (trouvee) return trouvee;
  }
  return null;
}

function decoderBase64Url(donnees: string): string {
  const base64 = donnees.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npx vitest run lib/email/extraction-message.test.ts`

Expected: PASS — 6/6 tests.

- [ ] **Step 5: Ajouter `import "server-only";` en tête de `lib/email/chiffrement.ts`**

Le fichier actuel commence par :

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
```

Remplacer par :

```ts
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
```

- [ ] **Step 6: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 7: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: tous les tests passent, dont les 6 nouveaux de `extraction-message.test.ts` (147 tests au total : 141 avant ce sous-projet + 6).

- [ ] **Step 8: Commit**

```bash
git add lib/email/extraction-message.ts lib/email/extraction-message.test.ts lib/email/chiffrement.ts
git commit -m "feat: extraction du corps texte d'un message Gmail (TDD)"
```

---

### Task 3: Fonction cœur de synchronisation

**Files:**
- Create: `lib/email/gmail-sync.ts`
- Create: `lib/email/file-attente.ts`

**Interfaces:**
- Consumes: `creerClientOAuth` (`lib/email/gmail-oauth.ts`), `dechiffrer` (`lib/email/chiffrement.ts`), `extraireCorpsTexte` (Task 2).
- Produces: `export async function synchroniserCompteEmail(supabase: SupabaseClient, compte: CompteASynchroniser): Promise<{ messagesSynchronises: number } | { erreur: string }>` (avec `interface CompteASynchroniser { id: string; utilisateur_id: string; entreprise_id: string; refresh_token_chiffre: string; dernier_sync_le: string | null }`), `export function construireUrlCallbackSyncEmail(): string` — consommées par Task 4 et Task 5.

**Pas de test dédié** pour `synchroniserCompteEmail` (dépend de l'API Gmail réelle — cohérent avec la décision déjà prise au sous-projet 1 de ne pas tester le code dépendant de Google).

- [ ] **Step 1: Créer `lib/email/file-attente.ts`**

```ts
export function construireUrlCallbackSyncEmail(): string {
  // Même piège que lib/appels-offres/file-attente.ts : VERCEL_URL pointe
  // vers l'URL unique du déploiement en cours, protégée par "Vercel
  // Authentication" même quand cette protection est désactivée pour le
  // domaine de production principal — APP_URL est le domaine stable à
  // utiliser pour tout callback externe (QStash, webhooks).
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/email/sync`;
}
```

- [ ] **Step 2: Créer `lib/email/gmail-sync.ts`**

```ts
import "server-only";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";
import { extraireCorpsTexte, type PartieMessage } from "./extraction-message";

const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;

export interface CompteASynchroniser {
  id: string;
  utilisateur_id: string;
  entreprise_id: string;
  refresh_token_chiffre: string;
  dernier_sync_le: string | null;
}

export async function synchroniserCompteEmail(
  supabase: SupabaseClient,
  compte: CompteASynchroniser,
): Promise<{ messagesSynchronises: number } | { erreur: string }> {
  const debutSync = new Date();
  const depuis = compte.dernier_sync_le
    ? new Date(compte.dernier_sync_le)
    : new Date(debutSync.getTime() - TRENTE_JOURS_MS);
  const epochDepuis = Math.floor(depuis.getTime() / 1000);

  const client = creerClientOAuth();
  client.setCredentials({ refresh_token: dechiffrer(compte.refresh_token_chiffre) });
  const gmail = google.gmail({ version: "v1", auth: client });

  let messagesSynchronises = 0;

  try {
    let pageToken: string | undefined;

    do {
      const { data } = await gmail.users.messages.list({
        userId: "me",
        q: `after:${epochDepuis}`,
        pageToken,
      });

      for (const { id: messageId } of data.messages ?? []) {
        if (!messageId) continue;

        const { data: message } = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: "full",
        });

        const headers = message.payload?.headers ?? [];
        const lireEnTete = (nom: string) =>
          headers.find((h) => h.name?.toLowerCase() === nom.toLowerCase())?.value ?? null;

        const piecesJointes = collecterPiecesJointes(message.payload as PartieMessageAvecPiecesJointes);

        const { error: erreurInsertion } = await supabase.from("email").insert({
          entreprise_id: compte.entreprise_id,
          utilisateur_id: compte.utilisateur_id,
          compte_email_connecte_id: compte.id,
          message_id_gmail: messageId,
          expediteur: lireEnTete("From"),
          destinataires: lireEnTete("To"),
          objet: lireEnTete("Subject"),
          contenu: extraireCorpsTexte(message.payload as PartieMessage) ?? message.snippet ?? null,
          pieces_jointes: piecesJointes,
          recu_le: message.internalDate
            ? new Date(Number(message.internalDate)).toISOString()
            : null,
        });

        // 23505 = violation de contrainte unique : message déjà synchronisé
        // lors d'une exécution précédente (fenêtres after: qui se
        // chevauchent) — traité comme un succès idempotent, pas une erreur.
        if (erreurInsertion && erreurInsertion.code !== "23505") {
          throw erreurInsertion;
        }

        if (!erreurInsertion) messagesSynchronises++;
      }

      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (erreur) {
    console.error(
      `Échec de la synchronisation du compte email ${compte.id} :`,
      erreur,
    );
    return { erreur: "Échec de la synchronisation." };
  }

  await supabase
    .from("compte_email_connecte")
    .update({ dernier_sync_le: debutSync.toISOString() })
    .eq("id", compte.id);

  return { messagesSynchronises };
}

interface PartieMessageAvecPiecesJointes {
  filename?: string | null;
  mimeType?: string | null;
  body?: { size?: number | null } | null;
  parts?: PartieMessageAvecPiecesJointes[];
}

function collecterPiecesJointes(
  payload: PartieMessageAvecPiecesJointes | undefined,
): { nom: string; tailleOctets: number; typeMime: string }[] {
  const resultat: { nom: string; tailleOctets: number; typeMime: string }[] = [];

  function parcourir(partie: PartieMessageAvecPiecesJointes) {
    if (partie.filename) {
      resultat.push({
        nom: partie.filename,
        tailleOctets: partie.body?.size ?? 0,
        typeMime: partie.mimeType ?? "application/octet-stream",
      });
    }
    for (const sousPartie of partie.parts ?? []) {
      parcourir(sousPartie);
    }
  }

  if (payload) parcourir(payload);
  return resultat;
}
```

Note pour l'implémenteur : `message.payload` (type retourné par `googleapis`) est structurellement compatible avec `PartieMessage`/`PartieMessageAvecPiecesJointes` (mêmes champs `mimeType`/`body`/`parts`, tous optionnels) mais TypeScript peut exiger un cast explicite (`as PartieMessage`, déjà présent ci-dessus) selon la version exacte des types `googleapis` installée — si `tsc` signale une incompatibilité de structure plutôt qu'un simple avertissement de cast, s'arrêter et documenter l'écart exact plutôt que d'ajouter un `as unknown as X` à l'aveugle.

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur (voir note du Step 2 si un écart de type apparaît).

- [ ] **Step 4: Commit**

```bash
git add lib/email/gmail-sync.ts lib/email/file-attente.ts
git commit -m "feat: fonction cœur de synchronisation Gmail"
```

---

### Task 4: Route batch (déclenchée par la Schedule QStash)

**Files:**
- Create: `app/api/email/sync/route.ts`

**Interfaces:**
- Consumes: `synchroniserCompteEmail`, `CompteASynchroniser` (Task 3), `createServiceRoleClient` (`lib/supabase/service-role.ts`).
- Produces: route `POST /api/email/sync` — consommée par la Schedule QStash (Task 7).

**Pas de test automatisé** (dépend de QStash/Gmail réels — cohérent avec `app/api/dao/traiter/route.ts`, non testé pour la même raison).

- [ ] **Step 1: Créer `app/api/email/sync/route.ts`**

```ts
import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { synchroniserCompteEmail } from "@/lib/email/gmail-sync";
import { construireUrlCallbackSyncEmail } from "@/lib/email/file-attente";

// Même raison que app/api/dao/traiter/route.ts : la limite par défaut de
// Vercel est trop courte pour synchroniser plusieurs comptes avec
// plusieurs messages chacun sans être tuée en cours de route.
export const maxDuration = 60;

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request): Promise<Response> {
  const corpsBrut = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return new Response("Signature manquante", { status: 401 });
  }

  let signatureValide: boolean;
  try {
    signatureValide = await receiver.verify({
      signature,
      body: corpsBrut,
      url: construireUrlCallbackSyncEmail(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: comptes, error } = await supabase
    .from("compte_email_connecte")
    .select("id, utilisateur_id, entreprise_id, refresh_token_chiffre, dernier_sync_le")
    .eq("fournisseur", "gmail")
    .eq("statut", "connecte");

  if (error) {
    return new Response("Échec de la lecture des comptes connectés", { status: 500 });
  }

  for (const compte of comptes ?? []) {
    const resultat = await synchroniserCompteEmail(supabase, compte);

    // Un compte en échec (token révoqué, erreur réseau) ne doit jamais
    // bloquer la synchronisation des autres comptes — chaque compte est
    // indépendant, l'erreur est isolée et marquée sur ce compte précis.
    if ("erreur" in resultat) {
      await supabase
        .from("compte_email_connecte")
        .update({ statut: "erreur" })
        .eq("id", compte.id);
    }
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 2: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 3: Commit**

```bash
git add app/api/email/sync/route.ts
git commit -m "feat: route batch de synchronisation email (Schedule QStash)"
```

---

### Task 5: Server Action manuelle + lecture `dernier_sync_le`

**Files:**
- Modify: `lib/email/actions.ts`
- Modify: `lib/email/queries.ts`

**Interfaces:**
- Consumes: `synchroniserCompteEmail`, `CompteASynchroniser` (Task 3).
- Produces: `export async function synchroniserMaintenant(): Promise<{ erreur: string } | { messagesSynchronises: number }>` ; `obtenirCompteEmailConnecte` renvoie désormais `{ adresseEmail: string; statut: StatutCompteEmail; dernierSyncLe: string | null } | null` — consommées par Task 6.

- [ ] **Step 1: Ajouter `synchroniserMaintenant` à `lib/email/actions.ts`**

Le fichier actuel est :

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

Remplacer l'import de `./gmail-oauth` et ajouter la nouvelle fonction à la fin :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";
import { synchroniserCompteEmail } from "./gmail-sync";

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

export async function synchroniserMaintenant(): Promise<
  { erreur: string } | { messagesSynchronises: number }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data: compte } = await supabase
    .from("compte_email_connecte")
    .select("id, utilisateur_id, entreprise_id, refresh_token_chiffre, dernier_sync_le")
    .eq("utilisateur_id", utilisateur.id)
    .eq("fournisseur", "gmail")
    .maybeSingle();

  if (!compte) return { erreur: "Aucun compte Gmail connecté." };

  const resultat = await synchroniserCompteEmail(supabase, compte);

  if ("erreur" in resultat) {
    await supabase
      .from("compte_email_connecte")
      .update({ statut: "erreur" })
      .eq("id", compte.id);
    return resultat;
  }

  revalidatePath("/parametres");
  return resultat;
}
```

- [ ] **Step 2: Modifier `lib/email/queries.ts`**

Remplacer le fichier entier par :

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

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: erreurs attendues dans `app/(app)/parametres/compte-email-card.tsx` et `app/(app)/parametres/page.tsx` (le type retourné par `obtenirCompteEmailConnecte` a changé, ces fichiers ne sont pas encore mis à jour — corrigés en Task 6). Vérifier que les seules erreurs sont bien dans ces deux fichiers, rien d'autre.

- [ ] **Step 4: Commit**

```bash
git add lib/email/actions.ts lib/email/queries.ts
git commit -m "feat: Server Action synchroniserMaintenant + lecture dernier_sync_le"
```

---

### Task 6: Interface — bouton "Synchroniser maintenant" + date du dernier sync

**Files:**
- Modify: `app/(app)/parametres/compte-email-card.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `synchroniserMaintenant` (Task 5), `obtenirCompteEmailConnecte` (Task 5, type déjà mis à jour — `app/(app)/parametres/page.tsx` n'a besoin d'aucune modification, il transmet déjà `compte` tel quel à `CompteEmailCard`).

- [ ] **Step 1: Ajouter les traductions dans `messages/fr.json`**

Le bloc `"Parametres"` actuel (lignes 209-235, extrait pertinent) :

```json
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
```

Remplacer par (ajout de `jamaisSynchronise`, `dernierSync`, `boutonSynchroniser`, `synchronisationEnCours`, `toastSyncSucces`, `toastSyncErreur`) :

```json
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
      "toastDeconnecte": "Compte Gmail déconnecté",
      "jamaisSynchronise": "Jamais synchronisé",
      "dernierSync": "Dernière synchronisation : {date}",
      "boutonSynchroniser": "Synchroniser maintenant",
      "synchronisationEnCours": "Synchronisation...",
      "toastSyncSucces": "{count, plural, =0 {Aucun nouvel email} one {# email synchronisé} other {# emails synchronisés}}",
      "toastSyncErreur": "Échec de la synchronisation. Réessaie."
    },
```

- [ ] **Step 2: Ajouter les mêmes traductions dans `messages/en.json`**

Le bloc `"Parametres"` actuel (lignes 209-235, extrait pertinent) :

```json
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
```

Remplacer par :

```json
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
      "toastDeconnecte": "Gmail account disconnected",
      "jamaisSynchronise": "Never synced",
      "dernierSync": "Last synced: {date}",
      "boutonSynchroniser": "Sync now",
      "synchronisationEnCours": "Syncing...",
      "toastSyncSucces": "{count, plural, =0 {No new email} one {# email synced} other {# emails synced}}",
      "toastSyncErreur": "Sync failed. Please try again.",
    },
```

**Attention à la virgule** : dans le fichier `en.json` cible, la dernière clé du bloc `gmail` ne doit **pas** avoir de virgule finale avant le `}` fermant — corriger `"toastSyncErreur": "Sync failed. Please try again.",` en `"toastSyncErreur": "Sync failed. Please try again."` (sans virgule) une fois le remplacement fait, sinon le JSON est invalide.

- [ ] **Step 3: Vérifier que les deux fichiers restent du JSON valide**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json', 'utf8')); JSON.parse(require('fs').readFileSync('messages/en.json', 'utf8')); console.log('OK')"`

Expected: `OK`.

- [ ] **Step 4: Modifier `app/(app)/parametres/compte-email-card.tsx`**

Remplacer le fichier entier par :

```tsx
"use client";

import { useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
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
import { deconnecterCompteEmail, synchroniserMaintenant } from "@/lib/email/actions";
import type { StatutCompteEmail } from "@/lib/email/types";

export function CompteEmailCard({
  compte,
}: {
  compte: {
    adresseEmail: string;
    statut: StatutCompteEmail;
    dernierSyncLe: string | null;
  } | null;
}) {
  const t = useTranslations("Parametres.gmail");
  const formatter = useFormatter();
  const [confirmationOuverte, setConfirmationOuverte] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSyncPending, startSyncTransition] = useTransition();

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

  function synchroniser() {
    startSyncTransition(async () => {
      const resultat = await synchroniserMaintenant();
      if ("erreur" in resultat) {
        toast.error(t("toastSyncErreur"));
      } else {
        toast.success(t("toastSyncSucces", { count: resultat.messagesSynchronises }));
      }
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
            <p className="text-sm text-muted-foreground">
              {compte.dernierSyncLe
                ? t("dernierSync", {
                    date: formatter.dateTime(new Date(compte.dernierSyncLe), {
                      dateStyle: "short",
                      timeStyle: "short",
                    }),
                  })
                : t("jamaisSynchronise")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nonConnecte")}</p>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        {compte ? (
          <>
            <Button
              variant="outline"
              onClick={synchroniser}
              disabled={isSyncPending}
            >
              {isSyncPending ? t("synchronisationEnCours") : t("boutonSynchroniser")}
            </Button>
            <Button variant="outline" onClick={() => setConfirmationOuverte(true)}>
              {t("boutonDeconnecter")}
            </Button>
          </>
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

Note pour l'implémenteur : `useFormatter` (`next-intl`) fournit `dateTime()` pour un formatage de date localisé sans dépendance supplémentaire — si le projet n'a jamais utilisé ce hook ailleurs, vérifier qu'il est bien exporté par la version de `next-intl` installée (`grep useFormatter node_modules/next-intl/dist/**/*.d.ts` ou équivalent) avant de l'utiliser ; sinon, replier sur `new Date(compte.dernierSyncLe).toLocaleDateString("fr-FR", { ... })` comme fait ailleurs dans le projet (voir `app/(app)/bibliotheque/document-table.tsx`, `new Date(doc.created_at).toLocaleDateString("fr-FR")`).

- [ ] **Step 5: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur (les deux erreurs de Task 5 Step 3 doivent avoir disparu).

- [ ] **Step 6: Vérifier que la suite complète passe toujours**

Run: `npx vitest run`

Expected: 147/147 tests passent.

- [ ] **Step 7: Vérifier le build de production**

Run: `npx next build`

Expected: build réussi, aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/parametres/compte-email-card.tsx" messages/fr.json messages/en.json
git commit -m "feat: bouton Synchroniser maintenant + date du dernier sync"
```

---

### Task 7: Mise en place de la Schedule QStash + documentation

**Files:**
- Create: `scripts/enregistrer-schedule-sync-email/run.ts`
- Modify: `package.json`
- Modify: `CLAUDE.md`

**Interfaces:**
- Aucune — script autonome, exécuté manuellement, ne fait pas partie du runtime de l'application.

- [ ] **Step 1: Créer `scripts/enregistrer-schedule-sync-email/run.ts`**

```ts
import { Client } from "@upstash/qstash";

async function main() {
  const qstash = new Client({ token: process.env.QSTASH_TOKEN! });
  const appUrl = process.env.APP_URL;

  if (!appUrl) {
    console.error("APP_URL manquante — impossible de construire la destination.");
    process.exit(1);
  }

  const { scheduleId } = await qstash.schedules.create({
    destination: `${appUrl}/api/email/sync`,
    cron: "0 * * * *", // toutes les heures, à l'heure pile
  });

  console.log(`Schedule créée : ${scheduleId}`);
}

main();
```

- [ ] **Step 2: Ajouter le script npm dans `package.json`**

Le bloc `"scripts"` actuel est :

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "dao-spike": "tsx --env-file-if-exists=.env.local scripts/verification-dao/run.ts"
  },
```

Remplacer par :

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run",
    "dao-spike": "tsx --env-file-if-exists=.env.local scripts/verification-dao/run.ts",
    "email-sync-schedule": "tsx --env-file-if-exists=.env.local scripts/enregistrer-schedule-sync-email/run.ts"
  },
```

- [ ] **Step 3: Vérifier que le projet compile**

Run: `npx tsc --noEmit`

Expected: aucune erreur.

- [ ] **Step 4: Documenter l'étape ponctuelle dans `CLAUDE.md`**

Trouver le paragraphe `**`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`**` (section "Variables d'environnement prévues", c'est le dernier paragraphe de cette section). Juste après ce paragraphe et avant le titre `## À ne pas faire`, ajouter :

```markdown

**Schedule QStash de synchronisation email** : contrairement au traitement DAO (déclenché ponctuellement par `mettreEnFileTraitementDao` à chaque upload), la synchronisation email (`app/api/email/sync/route.ts`) est appelée en continu par une **Schedule QStash** (cron horaire), qui n'existe pas tant qu'elle n'a pas été créée explicitement. À exécuter une fois par environnement via `npm run email-sync-schedule` (contre `APP_URL` pointant vers le domaine réellement joignable par QStash — inutile en local, `localhost` n'étant pas accessible depuis QStash) : une fois après le premier déploiement en production, jamais au runtime de l'application. Voir `scripts/enregistrer-schedule-sync-email/run.ts`.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/enregistrer-schedule-sync-email/run.ts package.json CLAUDE.md
git commit -m "feat: script d'enregistrement de la Schedule QStash email + doc"
```

- [ ] **Step 6: Vérification manuelle (bloquée tant que le domaine de production n'est pas déployé avec ce code)**

Cette étape ne peut être exécutée pour de vrai qu'une fois ce sous-projet mergé et déployé sur le domaine `APP_URL` de production (QStash ne peut pas joindre `localhost`) :

1. `npm run email-sync-schedule` avec `APP_URL` pointant vers le domaine de production dans `.env.local` (ou toute autre méthode de passage de variable d'environnement).
2. Vérifier dans le tableau de bord QStash (console Upstash) qu'une Schedule apparaît, ciblant `${APP_URL}/api/email/sync`, cron `0 * * * *`.
3. Attendre la prochaine heure pile (ou déclencher manuellement l'exécution depuis le tableau de bord QStash si l'option existe) et vérifier dans les logs Vercel que `POST /api/email/sync` a bien été appelée et a répondu `200`.
4. Vérifier en base (`select adresse_email, dernier_sync_le from compte_email_connecte;`) que `dernier_sync_le` a été mis à jour pour le compte déjà connecté depuis le sous-projet 1.

---

## Self-Review Notes

- **Couverture du spec** : modèle de données (Task 1), extraction du corps de message + durcissement `chiffrement.ts` (Task 2), fonction cœur de synchronisation (Task 3), route batch (Task 4), Server Action manuelle + lecture `dernier_sync_le` (Task 5), interface (Task 6), Schedule QStash + documentation (Task 7) — chaque section du spec a une tâche correspondante.
- **Cohérence des types** : `CompteASynchroniser` défini une seule fois (Task 3), consommé identiquement par la route batch (Task 4, sélection Supabase avec les mêmes 5 colonnes) et par la Server Action (Task 5, même sélection). Le type de retour de `obtenirCompteEmailConnecte` change une seule fois (Task 5) et toute l'UI qui le consomme (Task 6) est mise à jour dans la même passe — pas de fichier intermédiaire qui resterait sur l'ancien type au-delà de la fenêtre Task 5→6 explicitement documentée (Step 3 de Task 5 anticipe les erreurs `tsc` transitoires).
- **Piège JSON `en.json`** : signalé explicitement dans Task 6 Step 2 (virgule finale à retirer) — erreur facile à faire en copiant le bloc `fr.json` sans ajuster la ponctuation de fin de bloc.
- **Aucun placeholder** : chaque étape contient le code exact ou le texte exact à remplacer, y compris les fixtures de test (base64url réellement encodées et vérifiées, pas des chaînes inventées).
- **Vérification manuelle** : la Task 7 documente explicitement pourquoi elle ne peut pas être vérifiée avant un déploiement réel (QStash ne joint pas `localhost`) — cohérent avec le sous-projet 1 qui avait le même type de blocage (Google Cloud Console).
