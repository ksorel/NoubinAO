# Synchronisation des emails (Module 6, sous-projet 2)

Date : 2026-09-14
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Deuxième sous-projet du Module 6 (Intégration email), après le sous-projet 1
(connexion OAuth Gmail, mergé sur `main`, commits `4150364..3455fdc`, validé
en conditions réelles le 2026-09-10). Rappel du découpage complet du module :

1. Connexion OAuth Gmail — **complété**.
2. Synchronisation des emails (ce spec).
3. Rattachement automatique par règles + fil de suivi de l'AO — reporté.

Ce spec ne couvre que la récupération et le stockage brut des messages
Gmail des comptes connectés. **Aucun rattachement à un AO, aucune
exposition à l'équipe** — chaque email synchronisé reste privé à
l'utilisateur qui a connecté le compte, jusqu'à ce que le sous-projet 3 le
rattache explicitement à un AO (c'est ce rattachement, pas la
synchronisation elle-même, qui déclenchera la visibilité "toute l'équipe"
actée au sous-projet 1).

## Décisions validées avec l'utilisateur

- **Fenêtre de synchronisation : 30 jours glissants au premier sync**, puis
  uniquement les messages reçus depuis le dernier sync réussi. Limite le
  volume et l'intrusion dans une boîte personnelle — cohérent avec le délai
  légal minimum de dépôt d'un AO national (30 jours, voir `CLAUDE.md`) :
  au-delà, un email n'a plus de chance d'être lié à un AO encore actif.
- **Fréquence : toutes les heures**, via une Schedule QStash (cron) — pas
  de course contre la montre pour ce produit (même rappel de délai légal),
  une fraîcheur à l'heure près est largement suffisante.
- **Bouton "Synchroniser maintenant" en plus de l'automatique**, pour ne pas
  attendre une heure en test et donner à l'utilisateur un contrôle direct.
- **Pièces jointes : métadonnées seulement (nom, taille, type MIME)**, pas
  de téléchargement ni de stockage du fichier dans ce sous-projet — évite
  d'ajouter Supabase Storage + gestion de taille/type à un sous-projet déjà
  chargé (sync périodique + nouveau modèle de données). Le fichier pourra
  être téléchargé à la demande dans un incrément futur si le besoin se
  confirme.
- **Corps complet du message (pas juste le snippet Gmail ~200 caractères)**
  — nécessaire pour que le rattachement par mots-clés du sous-projet 3 soit
  fiable ; un extrait trop court manquerait souvent la référence à l'AO,
  qui peut apparaître n'importe où dans le message.

## Modèle de données

```sql
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

`appel_offres_id` nullable dès maintenant : toujours `null` à l'issue de ce
sous-projet, rempli par le sous-projet 3. `entreprise_id` dénormalisé
(cohérent avec le reste du schéma) mais **pas utilisé dans les policies
RLS de ce sous-projet**, même raisonnement que `compte_email_connecte` —
un email non rattaché reste strictement privé à son propriétaire ; c'est
le sous-projet 3 qui ajoutera la policy élargie ("visible par l'équipe si
`appel_offres_id` n'est pas null"), pas celui-ci.

Seules `select`/`insert` sont exercées par ce sous-projet (aucune mise à
jour ni suppression d'un email déjà synchronisé) — pas de policy
`update`/`delete` ajoutée maintenant, même précédent que
`utilisateur_select_membres` (Module 5) : ajouter une policy quand le
besoin réel apparaît, pas par anticipation.

`unique(compte_email_connecte_id, message_id_gmail)` : anti-doublon — un
même message Gmail ne peut être inséré deux fois pour un compte donné,
même si les fenêtres `after:` de deux exécutions se chevauchent legèrement.

## Durcissement mineur au passage

`lib/email/chiffrement.ts` (sous-projet 1) n'a pas `import "server-only"`
en tête de fichier — relevé comme Minor différé par la revue finale du
sous-projet 1 (`lib/supabase/service-role.ts` a ce garde-fou, pas
`chiffrement.ts`). Puisque ce sous-projet importe directement ce module
dans `gmail-sync.ts`, autant fermer cette note maintenant plutôt que de la
reporter encore : ajouter `import "server-only";` en première ligne de
`lib/email/chiffrement.ts`. Changement d'une ligne, aucun risque.

## Fonction cœur de synchronisation

Nouveau fichier `lib/email/gmail-sync.ts` :

```ts
import "server-only";
import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creerClientOAuth } from "./gmail-oauth";
import { dechiffrer } from "./chiffrement";
import { extraireCorpsTexte } from "./extraction-message";

const TRENTE_JOURS_MS = 30 * 24 * 60 * 60 * 1000;

interface CompteASynchroniser {
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

        const piecesJointes = collecterPiecesJointes(message.payload);

        const { error: erreurInsertion } = await supabase.from("email").insert({
          entreprise_id: compte.entreprise_id,
          utilisateur_id: compte.utilisateur_id,
          compte_email_connecte_id: compte.id,
          message_id_gmail: messageId,
          expediteur: lireEnTete("From"),
          destinataires: lireEnTete("To"),
          objet: lireEnTete("Subject"),
          contenu: extraireCorpsTexte(message.payload) ?? message.snippet ?? null,
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

function collecterPiecesJointes(
  payload: { parts?: unknown[] } | undefined,
): { nom: string; tailleOctets: number; typeMime: string }[] {
  const resultat: { nom: string; tailleOctets: number; typeMime: string }[] = [];

  function parcourir(partie: {
    filename?: string | null;
    mimeType?: string | null;
    body?: { size?: number | null } | null;
    parts?: unknown[];
  }) {
    if (partie.filename) {
      resultat.push({
        nom: partie.filename,
        tailleOctets: partie.body?.size ?? 0,
        typeMime: partie.mimeType ?? "application/octet-stream",
      });
    }
    for (const sousPartie of partie.parts ?? []) {
      parcourir(sousPartie as typeof partie);
    }
  }

  if (payload) parcourir(payload as Parameters<typeof parcourir>[0]);
  return resultat;
}
```

**Point à valider tôt** (comme les autres hypothèses sur des API externes
dans ce projet, ex. la conversion de tableaux DAO au Module 3) : le
filtre `after:<epoch_secondes>` de la recherche Gmail est un usage courant
mais pas le format le plus documenté officiellement par Google (qui met en
avant `after:AAAA/MM/JJ`, à la granularité du jour). À vérifier sur un
vrai compte dès l'implémentation — si le format epoch ne filtre pas
correctement, replier sur une comparaison de date faite côté application
(récupérer une fenêtre un peu large avec la syntaxe `AAAA/MM/JJ`, puis
filtrer précisément sur `internalDate` avant insertion).

## Extraction du corps du message

Nouveau fichier `lib/email/extraction-message.ts` :

```ts
interface PartieMessage {
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

Fonctions pures, testées unitairement (voir Tests) : `trouverPartie` et
`decoderBase64Url` ne font aucun appel réseau, `extraireCorpsTexte` prend
un objet `payload` déjà récupéré en entrée. Repli en cascade
`text/plain` → `text/html` (tags retirés grossièrement) → `null` (auquel
cas `gmail-sync.ts` reprend le `snippet` Gmail comme dernier repli).

## Route batch (déclenchée par la Schedule QStash)

Nouveau fichier `app/api/email/sync/route.ts` — même pattern de
vérification de signature que `app/api/dao/traiter/route.ts` (déjà en
place), avec `createServiceRoleClient()` puisqu'il n'y a pas de session
utilisateur (appelant externe, QStash) :

```ts
import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { synchroniserCompteEmail } from "@/lib/email/gmail-sync";
import { construireUrlCallbackSyncEmail } from "@/lib/email/file-attente";

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

`construireUrlCallbackSyncEmail()` : nouvelle fonction dans
`lib/email/file-attente.ts`, même patron que
`construireUrlCallback()` (`lib/appels-offres/file-attente.ts`) déjà en
place pour le traitement DAO — `APP_URL` (jamais `VERCEL_URL`, piège déjà
documenté), suffixé par `/api/email/sync`.

## Server Action manuelle ("Synchroniser maintenant")

Dans `lib/email/actions.ts` (fichier existant, sous-projet 1) :

```ts
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

Utilise le client SSR habituel (pas service-role) : l'utilisateur est
authentifié, la policy `email_insert_self` (RLS) autorise l'insertion pour
son propre `utilisateur_id` — cohérent avec le principe déjà appliqué au
sous-projet 1 (défense en profondeur RLS même quand la Server Action
filtre déjà correctement).

## Lecture pour l'UI

Ajout dans `lib/email/queries.ts` (fichier existant) :

```ts
export async function obtenirCompteEmailConnecte(
  utilisateurId: string,
): Promise<{ adresseEmail: string; statut: StatutCompteEmail; dernierSyncLe: string | null } | null> {
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

Modifie la fonction existante du sous-projet 1 (ajout de `dernierSyncLe`
au type de retour) plutôt que d'en créer une nouvelle — un seul point de
lecture du compte connecté.

## Interface

Dans `app/(app)/parametres/compte-email-card.tsx` (fichier existant,
sous-projet 1) :

- Affiche la date du dernier sync (`dernierSyncLe`) sous l'adresse email,
  formatée en `jj/mm/aaaa hh:mm` — ou "Jamais synchronisé" si `null`
  (compte qui vient d'être connecté, avant le premier passage de la
  Schedule ou un premier clic manuel).
- Bouton **"Synchroniser maintenant"** à côté de "Déconnecter", appelle
  `synchroniserMaintenant()`. État `isPending` pendant l'appel (peut
  prendre plusieurs secondes selon le volume). Toast de succès
  (`"N email(s) synchronisé(s)"`, `N` = `messagesSynchronises`) ou
  d'erreur.

## Mise en place de la Schedule QStash

Nouveau script `scripts/enregistrer-schedule-sync-email/run.ts`, même
patron d'exécution que `scripts/verification-dao/run.ts` (`tsx
--env-file-if-exists=.env.local`) — **exécuté une fois manuellement par
environnement (dev, puis prod)**, pas au runtime de l'application :

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

Nouveau script npm dans `package.json` :
`"email-sync-schedule": "tsx --env-file-if-exists=.env.local scripts/enregistrer-schedule-sync-email/run.ts"`

À exécuter une fois en local (contre `APP_URL=http://localhost:3000` —
QStash ne pourra pas réellement joindre localhost, donc surtout utile pour
valider que le script s'exécute sans erreur) puis une fois en production
une fois déployé, avec `APP_URL` pointant vers le domaine de production.
Documenté dans `CLAUDE.md` (nouvelle sous-section sous "Variables
d'environnement prévues" ou une note dédiée) pour qu'un futur
développeur/agent sache que cette étape ponctuelle existe et n'est pas
automatique.

## États et erreurs

| État | Comportement |
|---|---|
| Compte jamais synchronisé (`dernier_sync_le` null) | "Jamais synchronisé" affiché ; premier sync couvre 30 jours |
| Sync manuelle en cours | Bouton désactivé, libellé "Synchronisation..." |
| Sync manuelle réussie | Toast "N email(s) synchronisé(s)", date de dernier sync mise à jour |
| Sync manuelle échouée (token révoqué, erreur réseau/API) | Toast d'erreur, `statut` du compte passe à `erreur` (repris par la carte existante du sous-projet 1, qui affiche déjà un message pour cet état) |
| Sync automatique (Schedule) échouée pour un compte | N'affecte pas les autres comptes du batch ; `statut` de ce compte passe à `erreur`, visible au prochain chargement de `/parametres` par l'utilisateur concerné |
| Message déjà synchronisé (chevauchement de fenêtre) | Ignoré silencieusement (contrainte unique, code Postgres 23505), compté comme non nouveau |

## Tests

- Vitest pour `extraireCorpsTexte`/`trouverPartie`/`decoderBase64Url`
  (`lib/email/extraction-message.test.ts`) : message `text/plain` simple,
  message multipart avec `text/plain` + `text/html` (doit préférer
  `text/plain`), message `text/html` seul (tags retirés), message sans
  partie textuelle (retourne `null`).
- Pas de test automatisé pour `synchroniserCompteEmail`, la route batch, ou
  la Server Action (dépendent de l'API Gmail réelle — cohérent avec la
  décision déjà prise au sous-projet 1 de ne pas tester le code dépendant
  de Google) — validation manuelle une fois implémenté, avec le compte
  Gmail déjà connecté en conditions réelles depuis le sous-projet 1.

## Hors périmètre

- Tout rattachement à un AO, toute règle de correspondance par
  objet/expéditeur/mots-clés, toute exposition à l'équipe — sous-projet 3.
- Téléchargement et stockage des fichiers en pièce jointe — métadonnées
  seulement (voir Décisions validées) ; à ajouter dans un incrément futur
  si confirmé nécessaire.
- Synchronisation Outlook — reste hors périmètre tant que le sous-projet
  Outlook équivalent au sous-projet 1 n'existe pas.
- API Gmail History (synchronisation incrémentale par `historyId`, plus
  efficace que "lister tout depuis une date") — l'approche par date
  couvre le besoin pour un volume d'AO raisonnable par entreprise ; à
  reconsidérer seulement si le volume d'appels API devient un problème
  réel en usage.
- **Curseur de pagination persisté entre exécutions.** L'implémentation
  finale (revue finale + trois cycles de correction, voir le journal
  d'implémentation) plafonne le travail par exécution à
  `MAX_MESSAGES_PAR_SYNC` messages et fige `dernier_sync_le` de façon à ne
  **jamais exclure silencieusement** un message (propriété vérifiée et
  garantie). Mais sans curseur de pagination (`pageToken`) persisté en
  base entre deux exécutions, ce mécanisme seul ne garantit pas de
  *progresser* vers les messages plus anciens si le flux de nouveaux
  messages ne repousse pas naturellement les plus récents hors de la
  fenêtre plafonnée — un compte dont la fenêtre de 30 jours dépasse
  durablement `MAX_MESSAGES_PAR_SYNC` (~200-300) messages peut ne jamais
  terminer son rattrapage initial. Pas rare : plausible pour une boîte
  professionnelle active. Accepté comme limite pour ce sous-projet
  (aucune perte de données, seulement une incomplétude possible) ; à
  corriger dans un incrément futur si constaté en usage réel, en
  persistant un curseur de pagination (nouvelle colonne sur
  `compte_email_connecte`).
