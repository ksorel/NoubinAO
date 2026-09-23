# Contacter l'acheteur depuis la veille (mailto pré-rempli)

Date : 2026-09-23
Statut : approuvé par l'utilisateur (design section par section).

## Contexte

En testant `/veille` sur un vrai BOMP (46 avis réels), l'utilisateur a
demandé la possibilité de contacter directement l'initiateur d'un AO —
en s'appuyant sur `contact_retrait` (texte libre déjà extrait par l'IA,
contient souvent une adresse email, ex. observé en production :
`"Mairie de Ouragahio, Cel. : 07 99 22 87 98, sekassaba@gmail.com"`).

**Approche écartée après investigation, pas retenue dès le départ** :
envoyer réellement l'email depuis l'application, via le compte Gmail/
Outlook déjà connecté du client (Module 6). Deux obstacles concrets ont
fait abandonner cette voie :

- `gmail.send` est un scope OAuth sensible — l'ajouter à la demande de
  consentement redéclenche/aggrave la vérification de sécurité Google
  déjà documentée dans CLAUDE.md pour `gmail.readonly` (plusieurs
  semaines, audit tiers possible), et **tout compte Gmail déjà connecté
  devrait être reconnecté** (l'ancien token n'a pas ce droit).
- **Outlook n'existe pas du tout** dans le code — seulement comme
  valeur de l'ENUM `fournisseur_email` en base. Aucun flux OAuth
  Microsoft, aucune synchronisation. L'envoi "des deux côtés dès le
  départ" aurait exigé de construire toute l'intégration Microsoft
  Graph (lecture + envoi) en plus de l'ajout d'envoi Gmail — vérifié en
  lisant `lib/email/` (seuls `gmail-oauth.ts`/`gmail-sync.ts` existent,
  aucun fichier `outlook-*`/`microsoft-*`).

**Approche retenue** : un lien `mailto:` pré-rempli (destinataire,
copie, objet, corps) qui ouvre le client mail par défaut du navigateur/
OS du client — Gmail web, Outlook, Mail app, peu importe. L'email part
réellement de sa propre adresse, sans que NoubinAO n'ait besoin d'aucun
scope d'envoi, d'aucune intégration Microsoft, ni d'aucune reconnexion
des comptes déjà en place.

## Décisions validées avec l'utilisateur

- **Bouton "Contacter" visible dès `/veille`, avant import** — le
  client peut solliciter l'acheteur pour clarifier avant même de
  décider d'importer l'avis dans son pipeline.
- **Extraction de TOUS les emails présents dans `contact_retrait`**
  (texte libre déjà stocké, pas de nouveau champ IA) : le premier email
  trouvé devient le destinataire principal, les suivants partent en
  copie conforme.
- **Aucune saisie manuelle si zéro email détecté** — le bouton est
  simplement absent pour cet avis (pas de bouton désactivé qui ne fait
  rien).
- **Contenu pré-rempli, pas de composeur dans l'application** — le
  lien `mailto:` porte déjà un objet et un corps de message modèles ;
  le client les ajuste directement dans son propre client mail avant
  d'envoyer, comportement standard de tout lien `mailto:`.
- **Traçabilité minimale, pas une garantie d'envoi** : un seul
  horodatage `contact_initie_le` sur l'avis, mis à jour au clic sur le
  lien (best-effort — on sait qu'un contact a été *tenté*, pas qu'il a
  été *envoyé*, la limite est assumée). Pas d'historique multi-contacts
  en V1, pas de nouvelle table.

## Modèle de données

Une seule colonne ajoutée à `avis_ao_national` (nouvelle migration,
aucune table supplémentaire) :

```sql
alter table avis_ao_national add column contact_initie_le timestamptz;
```

## Extraction des emails

Nouveau module `lib/veille/extraction-email.ts`, fonction pure :

```ts
export function extraireEmails(texte: string): string[]
```

Regex email standard, dédoublonnée, ordre de première apparition dans
le texte préservé (déterminisme : le même texte donne toujours le même
"premier email" comme destinataire).

## Construction du lien mailto

Même module, fonction pure séparée :

```ts
export function construireLienMailto(input: {
  emails: string[];
  objet: string;
  corps: string;
}): string | null
```

Retourne `null` si `emails` est vide (signal pour masquer le bouton
côté UI), sinon une URL `mailto:` avec le premier email comme
destinataire principal, le reste en paramètre `cc` (séparés par
virgule), `subject`/`body` encodés (`encodeURIComponent`).

## Modèle de contenu (objet/corps)

Texte simple avec placeholders, traduit FR/EN (`Veille.contact.*` dans
`messages/fr.json`/`messages/en.json`) :

- Objet : référence de l'avis + objet de l'AO.
- Corps : identification de l'entreprise (nom, depuis
  `obtenirNomEntreprise` déjà existant dans
  `lib/utilisateur/queries.ts`) + demande de clarification/dossier
  courte.

`app/(app)/veille/page.tsx` récupère le nom d'entreprise en plus des
données déjà chargées et le transmet à `VeilleTable` en prop.

## Server Action de traçabilité

`lib/veille/actions.ts`, nouvelle fonction :

```ts
export async function marquerContactInitie(avisId: string): Promise<void>
```

Met à jour `contact_initie_le = now()`. Appelée en fire-and-forget côté
client au clic sur le lien (ne bloque jamais l'ouverture du `mailto:`,
et une erreur ici ne doit jamais empêcher le lien de s'ouvrir — c'est
une trace secondaire, pas le chemin critique).

## Interface

`veille-table.tsx` : à côté du bouton "Importer", un lien `<a>` stylé
bouton (`href={lienMailto}`, `target="_blank"`) visible seulement si
`construireLienMailto` retourne une URL non nulle pour cet avis ; son
`onClick` déclenche `marquerContactInitie` sans attendre le résultat.
Si `contact_initie_le` est déjà renseigné, un petit badge "Contacté
le..." apparaît sur la ligne (texte discret, ne remplace pas le lien —
le client peut recontacter).

## États et erreurs

- Aucun email dans `contact_retrait` : lien absent, rien d'autre à
  gérer.
- `marquerContactInitie` échoue (réseau, session expirée) : échec
  silencieux côté UI — le lien `mailto:` s'est déjà ouvert dans un
  nouvel onglet au moment de l'échec, l'action de l'utilisateur a
  réussi de son point de vue ; pas de toast d'erreur pour un
  enregistrement secondaire.

## Tests

- `extraireEmails` (TDD) : zéro email, un email, plusieurs emails,
  doublons dans le texte, email au milieu d'un texte avec numéros de
  téléphone et adresses (cas réel `contact_retrait`).
- `construireLienMailto` (TDD) : `emails` vide → `null` ; un email →
  pas de paramètre `cc` ; plusieurs → `cc` correctement joint ;
  encodage correct des caractères spéciaux (accents, espaces,
  esperluette) dans `subject`/`body`.
- Pas de test sur `veille-table.tsx` (composant UI, convention déjà
  établie dans ce projet).

## Hors périmètre

- Envoi réel via API Gmail/Outlook — écarté explicitement (coût de
  vérification Google/construction Microsoft Graph disproportionné par
  rapport au bénéfice pour ce besoin).
- Saisie manuelle d'un email si aucun n'est détecté automatiquement.
- Historique multi-contacts (plusieurs tentatives datées par avis) — un
  seul horodatage suffit en V1.
- Éditeur de contenu dans l'application avant ouverture du `mailto:` —
  l'édition se fait dans le client mail natif du client, pas dans
  NoubinAO.
