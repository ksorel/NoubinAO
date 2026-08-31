# Pipeline de normalisation DAO intégré à l'app (Module 3, sous-projet 2)

Date : 2026-08-31
Statut : approuvé par l'utilisateur, prêt pour le plan d'implémentation.

## Contexte

Deuxième sous-projet du Module 3 (Extraction de DAO), après le modèle de
données (`docs/superpowers/specs/2026-08-31-modele-donnees-appel-offres-design.md`,
tables `appel_offres`/`exigence_ao` en base, `lib/appels-offres/types.ts`/
`storage-path.ts`).

Le spike de validation (`docs/superpowers/specs/2026-08-25-spike-extraction-dao-design.md`,
`scripts/dao-spike/`) a confirmé que l'approche normalisation → découpage
par section → OCR de repli → extraction Claude fonctionne de façon fiable
sur des DAO ivoiriens réalistes en PDF (3 fixtures, dont une page
scannée), mais elle vit uniquement comme script autonome, sans tests
formels, séparée de l'app Next.js.

Ce sous-projet migre cette logique vers du code `lib/` réutilisable et
testé, en l'étendant sur deux points que le spike n'a pas couverts :
l'extraction des champs `titre`/`acheteur`/`secteur`/`montant_caution` de
`appel_offres` (le spike n'extrayait que pièces/critères/sommaire/délai),
et le support du format DOCX en plus du PDF.

Il ne couvre ni upload, ni Server Action, ni écriture en base, ni UI —
ces sujets appartiennent aux sous-projets 3 et 4.

## Décisions validées avec l'utilisateur

- **Extraction étendue** : le prompt Claude et le schéma Zod couvrent
  désormais `titre`, `acheteur`, `secteur`, `montant_caution` en plus de
  ce que le spike validait. Ces 4 champs n'ont jamais été testés en
  extraction réelle — un point de risque à vérifier qualitativement
  pendant l'implémentation (voir "Tests").
- **Date limite au format ISO 8601** : le prompt demande directement une
  date structurée (`date_limite`) plutôt que le texte libre `delai_depot`
  du spike, pour correspondre au type `timestamptz` de la colonne
  `appel_offres.date_limite` sans logique de parsing séparée.
- **Schéma d'extraction aligné sur le modèle de données** : `schema.ts`
  utilise directement les noms de champs de `AppelOffres`/`ExigenceAo`
  (`lib/appels-offres/types.ts`), avec un seul tableau `exigences` plat
  discriminé par `type_exigence`, au lieu des deux tableaux séparés
  `pieces_requises`/`criteres_evaluation` du spike. Le sous-projet 3 pourra
  insérer les objets retournés quasiment tels quels, sans conversion.
- **Pandoc retiré** : le chemin `pandoc` en CLI (essayé en premier dans le
  spike, avec repli heuristique) est supprimé du code migré. Pandoc n'est
  pas installé sur les fonctions serverless Vercel — ce chemin ne
  s'exécuterait jamais en production. Seule l'heuristique de détection de
  titres connus est conservée.
- **Support DOCX ajouté** : en plus du PDF (seul format testé par le
  spike), ce sous-projet ajoute la conversion DOCX → Markdown via
  `mammoth` (DOCX→HTML) + `turndown` (HTML→MD), conformément à CLAUDE.md.
  Limité au format `.docx` moderne — le `.doc` binaire legacy n'est pas
  supporté par `mammoth`.
- **Emplacement du code** : `lib/appels-offres/normalisation/`, sous-dossier
  du domaine `appels-offres` déjà créé au sous-projet 1, plutôt qu'un
  nouveau dossier racine `lib/dao/`.
- **`scripts/dao-spike/` supprimé en fin de sous-projet** : sa logique est
  absorbée dans `lib/`, il devient une copie divergente à ne pas garder.
  Son historique reste consultable via Git.

## Architecture et structure de fichiers

Nouveau dossier `lib/appels-offres/normalisation/` :

- **`pdf.ts`** — extraction texte par page PDF (`pdf-parse`), avec repli
  OCR par page (délégué à `ocr.ts`) quand le texte extrait est insuffisant
  (seuil repris du spike : moins de 20 caractères après `trim()`). Reprend
  `scripts/dao-spike/pdf-texte.ts`, y compris la garde symétrique contre la
  collision de version `pdfjs-dist` documentée dans ce fichier (deux copies
  du paquet partagent `globalThis.pdfjsWorker` dans le même process).

- **`ocr.ts`** — rendu d'une page PDF en image (`pdfjs-dist/legacy` +
  `@napi-rs/canvas`) puis lecture de cette image par Claude Haiku
  (`claude-haiku-4-5-20251001`, lecture d'image native). Repris de
  `scripts/dao-spike/ocr.ts` avec sa garde `workerSrc`/`globalThis.pdfjsWorker`
  symétrique à celle de `pdf.ts`.

- **`docx.ts`** *(nouveau)* — `extraireMarkdownDocx(buffer: Buffer): Promise<string>` :
  conversion DOCX → HTML (`mammoth.convertToHtml`) → Markdown (`turndown`).
  Pas de pagination (contrairement au PDF), pas de repli OCR (un DOCX
  contient toujours du texte natif).

- **`markdown.ts`** — détection des titres de sections connus (`AVIS
  D'APPEL D'OFFRES`, `INSTRUCTIONS AUX SOUMISSIONNAIRES`, `DONNÉES
  PARTICULIÈRES DE L'APPEL D'OFFRES`, `CAHIER DES CLAUSES ADMINISTRATIVES
  GÉNÉRALES`, `CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES`,
  `SOMMAIRE ATTENDU DE L'OFFRE`) et insertion de marqueurs `##` devant
  chaque occurrence — appliqué au texte des deux formats (PDF et DOCX).
  `decouperParSection(markdown): SectionMarkdown[]` reprise telle quelle du
  spike. La fonction `structurerEnMarkdownPandoc` du spike n'est pas
  migrée.

- **`normaliser.ts`** — point d'entrée du module :

  ```ts
  export async function normaliserDao(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ markdown: string; sections: SectionMarkdown[] }>
  ```

  Bascule vers `pdf.ts` (`mimeType === "application/pdf"`) ou `docx.ts`
  (`mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"`).
  Tout autre `mimeType` lève une erreur explicite — ce module ne connaît
  pas l'upload/HTTP et suppose que l'appelant (sous-projet 3) a déjà
  validé le type de fichier en amont.

- **`schema.ts`** — schéma Zod de sortie de l'extraction :

  ```ts
  import { z } from "zod";
  import { TYPES_EXIGENCE_AO } from "../types";

  export const ExigenceExtraiteSchema = z.object({
    type_exigence: z.enum(TYPES_EXIGENCE_AO),
    libelle: z.string(),
    description: z.string().nullable(),
    ponderation: z.number().nullable(),
    source_section: z.string(),
  });

  export const ExtractionAoSchema = z.object({
    titre: z.string().nullable(),
    acheteur: z.string().nullable(),
    secteur: z.string().nullable(),
    date_limite: z.string().datetime().nullable(),
    montant_caution: z.number().nullable(),
    sommaire_attendu: z.array(z.string()),
    exigences: z.array(ExigenceExtraiteSchema),
  });

  export type ExtractionAo = z.infer<typeof ExtractionAoSchema>;
  ```

- **`extraire.ts`** — `extraireInformationsAo(sections: SectionMarkdown[]): Promise<ExtractionAo>`.
  Reprend la logique du spike (sélection des sections AAO + DPAO + Sommaire
  attendu, appel Claude Haiku, parsing JSON, validation Zod), avec le
  prompt étendu pour demander `titre`/`acheteur`/`secteur`/`montant_caution`
  et une date ISO 8601, et la consigne explicite de ne rien inventer
  (retourner `null` plutôt qu'une valeur inventée), conformément à
  l'exigence de traçabilité de CLAUDE.md.

Ce module est une pure transformation `buffer + mimeType → données
extraites`. Il ne fait ni upload, ni écriture en base, ni Server Action.

## Tests

**Fonctions pures, testées sans mock ni réseau (Vitest)** :
- `decouperParSection` (`markdown.ts`) — cas déjà couverts par le spike à
  reprendre en tests formels, plus les cas limites (aucun titre trouvé,
  titre en début de document).
- Insertion des marqueurs de titres connus (`markdown.ts`).
- `ExtractionAoSchema` (`schema.ts`) — cas valides et invalides (champ
  manquant, `ponderation` non numérique, `type_exigence` hors énum).

**Conversion DOCX (`docx.ts`)** : testée avec une vraie fixture `.docx`
générée via le skill `docx` — déterministe, sans appel réseau (`mammoth`
et `turndown` tournent en local). Complète les 3 fixtures PDF du spike.

**Code appelant Claude (`ocr.ts`, `extraire.ts`)** : le client
`@anthropic-ai/sdk` est mocké pour tester la construction du prompt, le
parsing de la réponse JSON, et la gestion d'une réponse malformée (JSON
invalide, échec de validation Zod) — sans coût ni dépendance réseau.

**Validation qualitative manuelle (hors CI, comme le spike)** : un script
rejouable, `npm run dao-spike` mis à jour pour pointer vers
`lib/appels-offres/normalisation/` au lieu de `scripts/dao-spike/`, étendu
avec un cas DOCX et les 4 nouveaux champs extraits. Nécessite un vrai
appel API (coût, crédit Anthropic) — à rejouer manuellement pour vérifier
que `titre`/`acheteur`/`secteur`/`montant_caution` sont exacts sur les
fixtures existantes et la nouvelle fixture DOCX, exactement comme le
sommaire l'a été au sous-projet du spike.

## Hors périmètre

- Toute Server Action, upload réel, écriture en base de données — sous-projet 3.
- UI de revue/correction des exigences extraites — sous-projet 4.
- Formats bailleurs (Banque mondiale, BAD) — hors V1 du produit entier.
- `.doc` legacy (binaire, pré-2007) — non supporté par `mammoth`.
- Hiérarchie critère/sous-critère dans `exigence_ao` — déjà tranché (structure
  plate) au sous-projet 1.

## Nettoyage

`scripts/dao-spike/` (script, fixtures `.pdf`, sorties `.md`/`.json`) est
supprimé à la fin de ce sous-projet — sa logique est absorbée dans
`lib/appels-offres/normalisation/`. L'historique Git du spike reste
consultable ; le README du spike n'est pas dupliqué mais ses conclusions
utiles sont reprises dans ce spec.
