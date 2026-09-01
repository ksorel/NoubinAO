# Upload et orchestration DAO (Module 3, sous-projet 3)

Date : 2026-09-01
Statut : approuvé par l'utilisateur, prêt pour le plan d'implémentation.

## Contexte

Troisième sous-projet du Module 3 (Extraction de DAO), reliant les deux
premiers :

1. **Modèle de données** (`docs/superpowers/specs/2026-08-31-modele-donnees-appel-offres-design.md`) —
   tables `appel_offres`/`exigence_ao` en base, RLS `select`/`insert`/`delete`
   uniquement (pas d'`update`, décision explicitement reportée), types
   TypeScript (`lib/appels-offres/types.ts`), `construireCheminStockageDao`
   (`lib/appels-offres/storage-path.ts`).
2. **Pipeline de normalisation** (`docs/superpowers/specs/2026-08-31-pipeline-normalisation-dao-design.md`) —
   `lib/appels-offres/normalisation/` : `normaliserDao(buffer, mimeType) →
   {markdown, sections}`, `extraireInformationsAo(sections) → ExtractionAo`,
   `MIME_PDF`/`MIME_DOCX`/`MIME_TYPES_DAO_SUPPORTES`. Pure transformation,
   aucun accès base de données.

Ce sous-projet construit le pont entre upload utilisateur et ces deux
briques : une Server Action qui stocke le fichier et crée la ligne
`appel_offres`, puis un traitement en arrière-plan qui normalise, extrait,
et sauvegarde les résultats. Aucune UI, aucune édition manuelle — ce sera
le sous-projet 4.

## Décisions validées avec l'utilisateur

- **Traitement asynchrone via Upstash QStash**, pas synchrone dans la
  Server Action. Un DAO scanné multi-pages peut demander 30-60s (un appel
  Claude par page en repli OCR) — un risque réel de dépassement de la
  limite d'exécution d'une fonction serverless Vercel en plan Hobby.
  QStash est déjà dans la stack documentée par CLAUDE.md, offre des
  retries automatiques, et est gratuit au démarrage.
- **Client Supabase service-role pour le job d'arrière-plan.** QStash
  appelle une route HTTP sans session utilisateur (pas de cookies, pas de
  `auth.uid()`) — le service-role (qui contourne RLS) est la seule option
  techniquement viable. Conséquence directe : la politique RLS `update`
  sur `appel_offres`, dont l'ajout avait été reporté "au sous-projet
  d'orchestration" lors du sous-projet 1, reste **encore non nécessaire**
  ici et est reportée une nouvelle fois, au sous-projet 4 — c'est
  seulement quand un utilisateur éditera les champs extraits sous sa
  propre session que ce besoin deviendra réel.
- **Reprise depuis la phase échouée sur retry**, pas de recommencer à
  zéro. Si `dao_markdown` est déjà rempli en base (normalisation réussie
  lors d'une tentative précédente), le job saute directement à
  l'extraction. Économise des appels Claude inutiles, conforme à la
  consigne de CLAUDE.md de limiter la consommation API.
- **`mimeType` transmis dans le message QStash**, pas stocké en base. Le
  payload QStash est persisté et redélivré identique à chaque tentative,
  donc pas besoin d'une nouvelle colonne sur `appel_offres` juste pour ce
  besoin.
- **Rollback complet si la mise en file QStash échoue** après la création
  de la ligne `appel_offres` : suppression de la ligne et du fichier
  uploadé, erreur retournée à l'utilisateur — pas de ligne orpheline sans
  job de traitement associé.
- **Limitation acceptée, non résolue dans ce sous-projet** : une course
  entre deux livraisons quasi simultanées du même message QStash pourrait
  déclencher un double traitement. Pas de verrouillage optimiste ajouté
  ici — la garde d'idempotence sur `statut_traitement === 'termine'`
  couvre le cas de redélivrance normal (non concurrent), qui est le cas
  réellement fréquent.

## Architecture

### Temps 1 — Server Action `televerserDao` (rapide, sous session utilisateur)

1. Récupère l'utilisateur courant (`obtenirUtilisateurCourant`, relocalisé
   voir "Organisation du code"). Valide le fichier via
   `televerserDaoSchema` (Zod).
2. Génère `appelOffresId = randomUUID()`, construit le chemin de stockage
   via `construireCheminStockageDao`, upload le fichier dans le bucket
   `documents` existant.
3. Insère la ligne `appel_offres` (`id` pré-généré, `statut_traitement:
   'en_attente'`, `statut_pipeline: 'identifie'` par défaut,
   `fichier_dao_path`, `fichier_dao_nom_original`, `created_by`,
   `entreprise_id`).
4. Met en file un message QStash `{ appelOffresId, mimeType }` ciblant
   `app/api/dao/traiter/route.ts`.
5. **Gestion d'erreur** : échec d'upload → pas d'insertion tentée, erreur
   retournée. Échec d'insertion → rollback du fichier uploadé (comme
   `lib/documents/actions.ts::ajouterDocument`), erreur retournée. Échec
   de mise en file QStash après insertion réussie → rollback complet
   (suppression de la ligne ET du fichier), erreur retournée.

### Temps 2 — Route `app/api/dao/traiter/route.ts` (lent, appelée par QStash, sous service-role)

1. Vérifie la signature QStash (`@upstash/qstash/nextjs`, nouvelle
   dépendance) — requête non signée rejetée avant tout traitement.
2. Extrait `{ appelOffresId, mimeType }` du payload.
3. Appelle `traiterDao(supabase, appelOffresId, mimeType)` (client
   service-role injecté).
4. Si `traiterDao` relance une exception, la route répond avec un statut
   d'erreur HTTP (déclenche le retry QStash). Sinon, répond succès.

### `traiterDao(supabase, appelOffresId, mimeType)` (`lib/appels-offres/traitement.ts`)

1. Charge la ligne `appel_offres` par `id`.
2. **Garde d'idempotence** : si `statut_traitement === 'termine'`, retourne
   sans rien faire (gère les livraisons dupliquées).
3. **Reprise** : si `dao_markdown` est déjà non nul, passe directement à
   l'étape 5 (extraction) sans retélécharger le fichier ni rappeler
   `normaliserDao`.
4. **Phase normalisation** (si nécessaire) : `statut_traitement =
   'normalisation'` → télécharge le fichier depuis Storage
   (`fichier_dao_path`) → `normaliserDao(buffer, mimeType)` → sauvegarde
   immédiate de `dao_markdown` en base (traçabilité même si l'extraction
   échoue ensuite).
5. **Phase extraction** : `statut_traitement = 'extraction'` →
   `decouperParSection(dao_markdown)` → `extraireInformationsAo(sections)`
   → met à jour `titre`/`acheteur`/`secteur`/`date_limite`/
   `montant_caution`/`sommaire_attendu` sur `appel_offres` → supprime les
   `exigence_ao` existantes pour cet `appel_offres_id` (idempotence sur
   retry post-extraction-partielle) → insère les nouvelles lignes
   `exigence_ao` → `statut_traitement = 'termine'`.
6. **Sur toute exception** (à n'importe quelle phase) : écrit
   `statut_traitement = 'erreur'` et `erreur_traitement = message` en
   base, puis **relance l'exception** — jamais avalée silencieusement, la
   route HTTP appelante en dépend pour déclencher le retry QStash.

## Organisation du code

- **`lib/supabase/service-role.ts`** *(nouveau)* : `createServiceRoleClient()`,
  client `@supabase/supabase-js` direct (pas `@supabase/ssr`, aucune
  notion de cookies/session) utilisant `SUPABASE_SERVICE_ROLE_KEY`.
  Commentaire explicite en tête de fichier : ne jamais importer depuis du
  code exposé au navigateur.
- **`lib/auth/queries.ts`** *(nouveau, refactor ciblé)* : `obtenirUtilisateurCourant`,
  déplacé depuis `lib/documents/queries.ts` (fonction générique
  d'authentification, pas spécifique aux documents). `lib/documents/queries.ts`
  est mis à jour pour l'importer depuis ce nouvel emplacement — aucun
  changement de comportement.
- **`lib/appels-offres/schema.ts`** : `televerserDaoSchema` (Zod), miroir
  de `lib/documents/schema.ts`.
- **`lib/appels-offres/file-attente.ts`** : `mettreEnFileTraitementDao(appelOffresId,
  mimeType): Promise<void>`, publie le message vers QStash (nouvelle
  dépendance `@upstash/qstash`).
- **`lib/appels-offres/actions.ts`** : `"use server"`, `televerserDao(formData)`.
- **`lib/appels-offres/queries.ts`** : requêtes de lecture propres à ce
  sous-projet (minimal pour l'instant, le sous-projet 4 étoffera).
- **`lib/appels-offres/traitement.ts`** : `traiterDao(supabase, appelOffresId,
  mimeType)`, découplé de la route HTTP — client Supabase injecté en
  paramètre, testable sans QStash ni Next.js.
- **`app/api/dao/traiter/route.ts`** : route fine, vérification de
  signature + appel de `traiterDao` + traduction en réponse HTTP.

## Validation du fichier uploadé

```ts
const TAILLE_MAX_OCTETS = 20 * 1024 * 1024; // 20 Mo — un DAO scanné est plus volumineux qu'une pièce administrative (limite actuelle de lib/documents : 10 Mo)

export const televerserDaoSchema = z.object({
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
      message: "Le fichier doit faire moins de 20 Mo",
    })
    .refine((f) => MIME_TYPES_DAO_SUPPORTES.includes(f.type), {
      message: "Type de fichier non accepté (PDF ou DOCX uniquement)",
    }),
});
```

`MIME_TYPES_DAO_SUPPORTES` importé de `lib/appels-offres/normalisation/normaliser.ts`
— source unique de vérité, pas de duplication de la liste des formats acceptés.

## Tests

- **`schema.ts`** : cas valides/invalides (taille, mimeType), sans mock.
- **`traitement.ts`** : client Supabase injecté (pas importé en dur), donc
  testable avec un client mocké et `normaliserDao`/`extraireInformationsAo`
  mockés (`vi.mock`, en réutilisant le pattern classe-avec-getter validé
  au sous-projet 2 pour contourner le hoisting Vitest). Cas à couvrir :
  premier passage complet, reprise après normalisation déjà réussie
  (`dao_markdown` non nul), idempotence sur `statut_traitement ===
  'termine'`, propagation d'erreur avec écriture de `erreur_traitement`
  avant relance de l'exception.
- **`actions.ts`** et **`app/api/dao/traiter/route.ts`** : pas de test
  automatisé, comme `lib/documents/actions.ts` (jamais testé unitairement
  dans ce projet — dépendances réelles Storage/DB/QStash trop lourdes à
  mocker utilement). Vérification manuelle uniquement.

## Nouvelles variables d'environnement

À ajouter à CLAUDE.md : `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
`QSTASH_NEXT_SIGNING_KEY`. La cible du callback QStash utilise `VERCEL_URL`
en production (fourni automatiquement par la plateforme).

## Hors périmètre

- Toute UI (upload, suivi de statut, revue des exigences) — sous-projet 4.
- Édition manuelle des champs extraits, et donc la politique RLS `update`
  sur `appel_offres` — reportée au sous-projet 4.
- Verrouillage optimiste contre les livraisons QStash concurrentes du
  même message — limitation connue, non résolue ici (voir "Décisions
  validées avec l'utilisateur").
- Test end-to-end réel de la route QStash en local — QStash ne peut pas
  atteindre `localhost` sans tunnel ; non résolu dans ce sous-projet.
- Formats bailleurs (Banque mondiale, BAD) — hors V1 du produit entier.
