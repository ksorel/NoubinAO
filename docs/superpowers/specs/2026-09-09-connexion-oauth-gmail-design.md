# Connexion OAuth Gmail (Module 6, sous-projet 1)

Date : 2026-09-09
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Premier sous-projet du Module 6 (Intégration email). Précondition du
`CLAUDE.md` remplie : bibliothèque documentaire (Module 2) et extraction de
DAO (Module 3) validées sur cas réels, ainsi que le Module 4 (mapping/
assemblage/rédaction) et le Module 5 (pipeline), tous testés de bout en bout
en session le 2026-09-09.

Découpage complet du module (le moins risqué d'abord, cohérent avec
l'approche déjà suivie pour le Module 4) :

1. Connexion OAuth Gmail + modèle de données (ce spec).
2. Synchronisation des emails (récupération périodique via QStash, stockage
   brut).
3. Rattachement automatique par règles (objet/expéditeur/mots-clés) +
   affichage dans le fil de suivi de l'AO.

Ce spec ne couvre que la connexion : un utilisateur autorise l'accès en
lecture seule à son Gmail, le token est stocké chiffré. **Aucune
synchronisation d'email, aucun rattachement à un AO** — ce n'est pas encore
possible techniquement à ce stade.

## Décisions validées avec l'utilisateur

- **Gmail seul d'abord**, Outlook reporté à un sous-projet ultérieur (le
  champ `fournisseur` est prévu en `enum` dès ce sous-projet pour éviter une
  migration de renommage en V2 — voir Modèle de données).
- **Compte personnel par utilisateur**, pas de boîte partagée au niveau
  entreprise — chaque utilisateur connecte sa propre boîte Gmail
  individuellement.
- **Visibilité future des emails rattachés (sous-projet 3) : toute l'équipe
  de l'entreprise**, pas seulement l'utilisateur qui a connecté le compte —
  décision actée maintenant car elle contraint la conception RLS de ce
  sous-projet (voir RLS ci-dessous : la connexion elle-même reste privée à
  son propriétaire, contrairement aux emails une fois rattachés).
- **Chiffrement applicatif AES-256-GCM**, pas Supabase Vault/pgsodium — clé
  dans une nouvelle variable d'environnement, cohérent avec l'approche
  "gratuit, sans nouveau service" déjà suivie dans le reste du projet.
- **Package `googleapis`** (client officiel Google) plutôt que des appels
  `fetch` bruts vers les endpoints OAuth — gère nativement le rafraîchissement
  de token, réduit le code à écrire et à maintenir. Deviendra également
  nécessaire au sous-projet 2 pour l'API Gmail elle-même.
- **Scope `gmail.readonly` uniquement** — jamais d'écriture, jamais d'envoi.
  Cohérent avec l'objectif produit (centraliser le suivi, pas se substituer à
  la messagerie).
- **Nouvelle page `/parametres`** (pas d'intégration dans le menu
  utilisateur existant) — appelée à grossir avec d'autres réglages plus tard
  (Outlook au sous-projet suivant, éventuellement d'autres intégrations),
  mérite sa propre entrée de sidebar plutôt que de surcharger le menu
  utilisateur qui reste dédié thème/langue/déconnexion.

## Modèle de données

```sql
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

`entreprise_id` dénormalisé (cohérent avec le reste du schéma) mais **non
utilisé dans les policies RLS de ce sous-projet** — la connexion elle-même
reste strictement privée à son propriétaire (`utilisateur_id = auth.uid()`),
même si les emails qu'elle permettra de récupérer seront un jour visibles par
l'équipe une fois rattachés à un AO (sous-projet 3, sur la future table
`email`, pas celle-ci). Un token de connexion Gmail n'a pas de raison d'être
lisible par un collègue.

`unique(utilisateur_id, fournisseur)` : un seul compte Gmail par utilisateur.
Reconnecter après déconnexion réutilise la même ligne (upsert), voir Server
Actions.

`on delete cascade` sur `utilisateur_id` et `entreprise_id` : cohérent avec
le reste du schéma (ex. `document`, `appel_offres`) — pas de ligne
orpheline.

## Chiffrement

Nouveau fichier `lib/email/chiffrement.ts` :

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
  const chiffre = Buffer.concat([cipher.update(texteClair, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, chiffre].map((b) => b.toString("base64")).join(".");
}

export function dechiffrer(texteChiffre: string): string {
  const [ivB64, authTagB64, chiffreB64] = texteChiffre.split(".");
  const decipher = createDecipheriv(ALGORITHME, obtenirCle(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const clair = Buffer.concat([
    decipher.update(Buffer.from(chiffreB64, "base64")),
    decipher.final(),
  ]);
  return clair.toString("utf8");
}
```

`EMAIL_TOKEN_ENCRYPTION_KEY` : 32 octets aléatoires encodés en base64
(`openssl rand -base64 32`), à générer une fois et documenter dans
`CLAUDE.md` comme les autres variables d'environnement. IV aléatoire à
chaque appel (jamais réutilisé) — deux chiffrements du même texte produisent
des sorties différentes, testé explicitement (voir Tests).

Ce module n'est appelé que côté serveur (Server Actions, route handlers) —
le token déchiffré ne transite jamais vers le client.

## Flux OAuth

Nouveau fichier `lib/email/gmail-oauth.ts` :

```ts
import { google } from "googleapis";

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

`APP_URL` (pas `VERCEL_URL`) pour l'URL de callback — même piège déjà
documenté dans `CLAUDE.md` pour QStash, s'applique identiquement ici.

**Route 1** — `app/api/email/gmail/connecter/route.ts` (`GET`) : vérifie
l'utilisateur connecté (`obtenirUtilisateurCourant`), génère un `state`
aléatoire (`crypto.randomUUID()`), le stocke dans un cookie `httpOnly`,
`secure`, durée de vie 10 minutes, puis redirige vers
`genererUrlConsentement(state)`.

**Route 2** — `app/api/email/gmail/callback/route.ts` (`GET`) :

1. Vérifie l'utilisateur connecté.
2. Lit `code`, `state`, `error` depuis les paramètres de requête. Si
   `error` (consentement refusé par l'utilisateur) → redirection vers
   `/parametres?erreur=consentement_refuse`.
3. Compare `state` au cookie posé par la route 1 — rejette et redirige vers
   `/parametres?erreur=state_invalide` si absent ou différent (protection
   CSRF standard du flux OAuth). Supprime le cookie dans tous les cas.
4. Échange `code` contre les tokens (`client.getToken(code)`).
5. Appelle `gmail.users.getProfile({ userId: "me" })` avec le token obtenu
   pour récupérer `emailAddress` — sert à la fois de confirmation que le
   scope fonctionne et de valeur à afficher dans l'UI.
6. Chiffre `refresh_token` et `access_token`, upsert dans
   `compte_email_connecte` sur `(utilisateur_id, fournisseur)`.
7. Redirige vers `/parametres?succes=1`.

Pas de nouvelle Server Action pour ces deux étapes : un flux OAuth a besoin
de rediriger vers une origine externe (Google) puis de recevoir un callback
GET avec des paramètres d'URL, ce qu'une Server Action ne fait pas
nativement — route handlers, cohérent avec `app/api/dao/traiter/route.ts`
déjà présent dans le projet pour une raison similaire (appelant externe).

## Server Actions

Dans un nouveau fichier `lib/email/actions.ts` :

```ts
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

## Lecture

Nouveau type dérivé dans `lib/email/types.ts`, même patron que
`StatutPipelineAo`/`StatutRelectureDossier` (`lib/appels-offres/types.ts`) :

```ts
export const STATUTS_COMPTE_EMAIL = ["connecte", "revoque", "erreur"] as const;
export type StatutCompteEmail = (typeof STATUTS_COMPTE_EMAIL)[number];
```

Nouveau fichier `lib/email/queries.ts` :

```ts
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

Ne renvoie jamais les tokens — même chiffrés, ils n'ont aucune raison de
sortir de la couche serveur qui en a besoin (route de callback,
déconnexion).

## Interface

- Nouvelle entrée sidebar "Réglages" (icône `Settings` de Lucide), après
  "Pipeline" — même pattern que les trois entrées existantes dans
  `components/app-sidebar.tsx`.
- Nouvelle page `app/(app)/parametres/page.tsx` : charge
  `obtenirCompteEmailConnecte`, affiche une section "Comptes email
  connectés" avec une carte Gmail :
  - **Non connecté** : bouton "Connecter Gmail" → lien vers
    `/api/email/gmail/connecter`.
  - **Connecté** : adresse email affichée, bouton "Déconnecter" (appelle
    `deconnecterCompteEmail`, confirmation via `AlertDialog` shadcn avant
    exécution — action qui coupe un accès, cohérent avec le niveau de
    friction déjà appliqué aux actions destructrices ailleurs dans le
    projet).
  - **Statut `erreur`** : message indiquant que la connexion a expiré ou
    échoué, incite à reconnecter (le sous-projet 2 sera responsable de
    positionner ce statut lors d'un rafraîchissement de token en échec —
    hors périmètre ici, mais la colonne et son affichage existent déjà).
- Lit les paramètres `succes`/`erreur` de l'URL (posés par la route de
  callback) pour afficher un toast Sonner de confirmation ou d'erreur au
  chargement de la page.

## États et erreurs

| État | Comportement |
|---|---|
| Chargement de la page réglages | Squelette shadcn, cohérent avec les autres pages du projet |
| Non connecté | Bouton "Connecter Gmail" |
| Connecté | Adresse affichée + bouton "Déconnecter" |
| Consentement refusé par l'utilisateur sur l'écran Google | Toast d'erreur explicite, pas de ligne créée |
| `state` invalide/expiré au callback | Toast d'erreur, pas de ligne créée — protection CSRF, ne doit jamais passer inaperçu |
| Échange de code échoué (Google indisponible, code déjà utilisé) | Toast d'erreur générique, pas de ligne créée |
| Déconnexion | Confirmation préalable, puis suppression même si la révocation côté Google échoue |

## Variables d'environnement

Ajout à la liste déjà documentée dans `CLAUDE.md` :

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_TOKEN_ENCRYPTION_KEY=
```

`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` étaient déjà listées comme
prévues mais jamais renseignées — restent à obtenir depuis Google Cloud
Console (projet + écran de consentement OAuth + identifiants OAuth,
redirect URI `${APP_URL}/api/email/gmail/callback`), étape manuelle que
l'utilisateur doit faire lui-même avant de pouvoir tester ce sous-projet en
conditions réelles.

## Tests

- Vitest pour `chiffrer`/`dechiffrer` (`lib/email/chiffrement.test.ts`) :
  round-trip (`dechiffrer(chiffrer(x)) === x`), deux chiffrements du même
  texte produisent des sorties différentes (IV aléatoire), échec propre si
  `EMAIL_TOKEN_ENCRYPTION_KEY` absente.
- Pas de test automatisé pour les routes OAuth ou les Server Actions
  (dépendent de Google, cohérent avec l'absence de test déjà acceptée sur
  les Server Actions et intégrations externes ailleurs dans le projet) —
  validation manuelle une fois les identifiants Google Cloud Console
  obtenus.

## Hors périmètre

- Toute synchronisation d'email (sous-projet 2).
- Tout rattachement à un AO, toute exposition d'email à l'équipe
  (sous-projet 3) — cette table ne contient que la connexion, jamais de
  contenu d'email.
- Outlook/Microsoft Graph — le type `fournisseur_email` est prêt pour
  l'accueillir mais aucun code Outlook n'est écrit ici.
- Rafraîchissement automatique du token en tâche de fond — `googleapis`
  gère le rafraîchissement à la demande dès qu'un appel API échoue pour
  cause de token expiré (sera exercé pour de vrai au sous-projet 2, quand
  des appels Gmail réels auront lieu).
- Notification à l'utilisateur si sa connexion expire — dépend du
  sous-projet 2 pour détecter cet état.
- Connexion de plusieurs comptes Gmail par utilisateur — non demandé,
  `unique(utilisateur_id, fournisseur)` l'empêche délibérément.
