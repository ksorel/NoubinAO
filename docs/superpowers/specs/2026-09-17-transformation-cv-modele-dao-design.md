# Transformation des CV selon le modèle du DAO

Date : 2026-09-17
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Lacune reportée pendant le cadrage du sous-projet "pyramide de coût BPU"
(Module 7, voir `docs/superpowers/specs/2026-09-16-pyramide-cout-bpu-design.md`,
section « Hors périmètre ») : certains DAO ivoiriens imposent un format de
CV strict pour le personnel clé (rubriques précises, ordre imposé, parfois
un tableau normalisé) plutôt que d'accepter le CV « brut » stocké dans la
bibliothèque documentaire de l'entreprise. Demande du Directeur : quand un
DAO impose son propre modèle, NoubinAO doit transformer automatiquement le
CV existant vers ce modèle avant de l'inclure dans le dossier — **mais
seulement quand ce cas se présente**, jamais systématiquement.

**Dépendance bloquante découverte pendant le cadrage, corrigée dans ce même
sous-projet plutôt que différée** : `document.contenu_markdown` (colonne
existante depuis la toute première migration du projet,
`20260822124743_bibliotheque_documentaire.sql`) n'est en réalité **jamais
rempli** par le code actuel — `ajouterDocument`
(`lib/documents/actions.ts`) téléverse le fichier brut sans jamais le
normaliser. Ce trou touche aussi la rédaction assistée par IA déjà en
production (`lib/appels-offres/redaction/generer.ts` lit ce champ pour les
CV/références utilisés comme documents source — toujours vide en
pratique aujourd'hui). La transformation de CV dépend entièrement de ce
contenu texte pour fonctionner : ce sous-projet corrige donc cette dette en
premier lieu (section 1), avant d'ajouter la fonctionnalité elle-même.

## Décisions validées avec l'utilisateur

- **Détection du modèle de CV : saisie manuelle, pas d'extraction
  automatique.** L'utilisateur, en lisant le DAO, téléverse lui-même le
  fichier modèle (Word ou PDF) trouvé dans les pièces du DAO. Une
  extraction automatique par heuristique serait un pari technique risqué
  (un modèle de CV est souvent un tableau à mise en page libre, bien plus
  dur à détecter fiablement qu'une liste de pièces requises) pour un gain
  modeste — contraire au garde-fou de temps du Directeur sur ce projet
  bootstrap.
- **Un seul modèle par AO**, stocké directement sur `appel_offres` (comme
  `fichier_dao_path`) — pas un nouveau type de document dans la
  bibliothèque (qui est partagée au niveau entreprise ; un modèle de CV
  est propre à un DAO donné, jamais réutilisé entre AO).
- **Portée de la transformation** : uniquement les CV déjà **associés à
  une exigence « pièce requise »** de cet AO (liaison `exigence_document`
  existante, filtrée sur les documents de type `cv`) — pas toute la
  bibliothèque. Le bouton « Transformer selon le modèle » n'apparaît
  **que si** un modèle de CV a été téléversé sur cet AO (cohérent avec
  « seulement quand c'est demandé »).
- **Sortie : un fichier Word séparé, téléchargeable**, généré à la
  demande — pas de fusion dans l'export du dossier principal. Le
  sous-projet 3 du Module 4 avait tranché « assemblage = dossier
  structurant, pas de fusion binaire des documents sources » ; cette
  décision reste inchangée pour l'export principal, qui continue de
  simplement lister « CV — Nom ». Le mandataire garde la main pour
  vérifier/insérer le CV transformé où il veut.
- **Résultat persisté**, pas régénéré à chaque clic — un fichier généré +
  son contenu texte sont stockés (table `cv_transforme`), avec un bouton
  « Régénérer » explicite. Évite de refacturer un appel Claude à chaque
  téléchargement, cohérent avec la contrainte CLAUDE.md de contrôle des
  coûts IA. Une régénération **remplace** le résultat précédent (pas
  d'historique de versions — cohérent avec le reste du projet, qui ne
  garde d'historique nulle part ailleurs).
- **Fix de la normalisation bibliothèque : tous les formats actuellement
  acceptés restent acceptés** (PDF, DOC legacy, DOCX, JPEG, PNG) — aucun
  retiré. Chacun doit avoir une vraie voie de normalisation :
  - PDF/DOCX → réutilisation intégrale du pipeline DAO déjà écrit
    (`normaliserDao`), qui gère déjà l'OCR de repli pour un PDF scanné.
  - JPEG/PNG → OCR direct par l'API Claude (`lireImageParClaude`, déjà
    utilisé comme repli PDF), sans étape de rendu de page.
  - DOC legacy (binaire OLE, pas OOXML) → `mammoth` ne le lit pas
    fiablement ; nouvelle dépendance **`word-extractor`** (npm, pur JS,
    aucun binaire externe — compatible avec les fonctions serverless
    Vercel, même contrainte que le reste du pipeline). Texte brut
    seulement, aucune détection de titres possible (aucune métadonnée de
    mise en forme disponible) — acceptable : les pièces bibliothèque sont
    courtes, pas besoin du découpage par section réservé aux DAO
    volumineux.
- **Traitement synchrone**, pas de file QStash — une pièce bibliothèque
  ou un modèle de CV sont petits (max 10 Mo, quelques pages), contrairement
  à un DAO qui nécessite en plus une extraction IA des exigences après
  normalisation. Pas de nouvel état « en cours de traitement » à gérer
  côté UI bibliothèque.
- **Échec de normalisation jamais bloquant** pour l'upload — best-effort,
  cohérent avec le reste du projet (`traiterDao` capture ses erreurs sans
  perdre le fichier déjà stocké). `contenu_markdown` reste `null` si la
  normalisation échoue, le document reste utilisable (téléchargeable).
- **Pas de rattrapage rétroactif** sur les documents déjà en bibliothèque
  — ils restent avec `contenu_markdown: null` tant qu'ils ne sont pas
  re-téléversés. Hors scope de ce sous-projet, à reconsidérer seulement si
  un besoin réel apparaît.
- **Pas de nouveau palier tarifaire** : cohérent avec la facturation au
  nombre d'AO traités/mois — cette fonctionnalité ne change pas le modèle
  économique.

## Modèle de données

### Section 1 — Fix normalisation bibliothèque

Aucune migration : les colonnes `contenu_markdown`/`source_ocr` existent
déjà sur `document` depuis `20260822124743_bibliotheque_documentaire.sql`.
Fix purement applicatif (voir section suivante).

### Sections 2-3 — Modèle de CV et CV transformé

Nouvelle migration `supabase/migrations/20260917140000_transformation_cv.sql` :

```sql
-- Transformation des CV selon le modèle imposé par un DAO (lacune reportée
-- pendant le cadrage du sous-projet BPU du Module 7 — voir
-- docs/superpowers/specs/2026-09-16-pyramide-cout-bpu-design.md). Un seul
-- modèle par AO, saisi manuellement (upload), jamais extrait
-- automatiquement du DAO. Colonnes ajoutées à appel_offres, comme
-- fichier_dao_path : un modèle de CV est propre à un AO, jamais partagé.
alter table appel_offres
  add column modele_cv_path text,
  add column modele_cv_nom_original text,
  add column modele_cv_markdown text;

-- Résultat de transformation d'un CV vers le modèle de l'AO. Une
-- régénération remplace le résultat précédent (contrainte unique, pas
-- d'historique de versions — cohérent avec le reste du projet). document_id
-- référence le CV source (bibliothèque, type 'cv') ; appel_offres_id le
-- modèle utilisé. Les deux restent des FK explicites pour la traçabilité :
-- CV source et modèle restent consultables séparément.
create table cv_transforme (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null references appel_offres(id) on delete cascade,
  document_id uuid not null references document(id) on delete cascade,
  contenu_markdown text not null,
  export_path text not null,
  genere_par uuid references utilisateur(id) on delete set null,
  genere_le timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (appel_offres_id, document_id)
);

create index cv_transforme_appel_offres_id_idx on cv_transforme(appel_offres_id);

alter table cv_transforme enable row level security;

-- Même patron que jalon_retroplanning/evaluation_go_no_go : select/insert
-- scopés par appartenance entreprise via appel_offres, update autorisé à
-- toute l'équipe (une régénération peut être faite par n'importe qui,
-- pas seulement l'auteur de la première génération).
create policy "cv_transforme_select_membres" on cv_transforme
  for select using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_insert_membres" on cv_transforme
  for insert with check (
    genere_par = auth.uid()
    and exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_update_membres" on cv_transforme
  for update
  using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );

create policy "cv_transforme_delete_membres" on cv_transforme
  for delete using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = cv_transforme.appel_offres_id and u.id = auth.uid()
    )
  );
```

Nouveau type dans `lib/appels-offres/types.ts` :

```ts
export interface CvTransforme {
  id: string;
  appel_offres_id: string;
  document_id: string;
  contenu_markdown: string;
  export_path: string;
  genere_par: string | null;
  genere_le: string;
  created_at: string;
}
```

`AppelOffres` s'enrichit de trois champs nullable
(`modele_cv_path`/`modele_cv_nom_original`/`modele_cv_markdown`), insérés
après `fichier_dao_nom_original`.

## Section 1 — Fix normalisation bibliothèque documentaire

Nouvelle dépendance npm : `word-extractor` (extraction de texte brut
depuis un `.doc` binaire OLE — pur JS, pas de binaire externe).

Nouveau fichier `lib/documents/normalisation.ts` :

```ts
import WordExtractor from "word-extractor";
import { normaliserDao, MIME_PDF, MIME_DOCX } from "@/lib/appels-offres/normalisation/normaliser";
import { lireImageParClaude } from "@/lib/appels-offres/normalisation/ocr";

const MIME_DOC_LEGACY = "application/msword";
const MIME_JPEG = "image/jpeg";
const MIME_PNG = "image/png";

export async function normaliserDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<{ markdown: string | null; sourceOcr: boolean }> {
  try {
    if (mimeType === MIME_PDF || mimeType === MIME_DOCX) {
      const resultat = await normaliserDao(buffer, mimeType);
      return { markdown: resultat.markdown, sourceOcr: false };
    }

    if (mimeType === MIME_JPEG || mimeType === MIME_PNG) {
      const texte = await lireImageParClaude(buffer);
      return { markdown: texte.trim().length > 0 ? texte : null, sourceOcr: true };
    }

    if (mimeType === MIME_DOC_LEGACY) {
      const extractor = new WordExtractor();
      const document = await extractor.extract(buffer);
      const texte = document.getBody();
      return { markdown: texte.trim().length > 0 ? texte : null, sourceOcr: false };
    }

    return { markdown: null, sourceOcr: false };
  } catch (erreur) {
    // Best-effort : une erreur de normalisation ne doit jamais faire
    // échouer l'upload — le fichier reste utilisable (téléchargeable)
    // même sans texte extrait.
    console.error("Échec de la normalisation du document :", erreur);
    return { markdown: null, sourceOcr: false };
  }
}
```

`ajouterDocument` (`lib/documents/actions.ts`) appelle cette fonction
juste avant l'insert :

```ts
const buffer = Buffer.from(await fichier.arrayBuffer());
const { markdown, sourceOcr } = await normaliserDocument(buffer, fichier.type);

const { error: erreurInsertion } = await supabase.from("document").insert({
  id: documentId,
  entreprise_id: utilisateur.entreprise_id,
  type,
  nom,
  fichier_path: cheminStockage,
  fichier_nom_original: fichier.name,
  mime_type: fichier.type,
  taille_octets: fichier.size,
  date_expiration: dateExpiration ?? null,
  contenu_markdown: markdown,
  source_ocr: sourceOcr,
  created_by: utilisateur.id,
});
```

## Section 2 — Modèle de CV sur l'AO

Réutilisation intégrale de `televerserDaoSchema`/`MIME_TYPES_DAO_SUPPORTES`
(`lib/appels-offres/schema.ts`) pour valider le fichier modèle (mêmes
contraintes que le DAO : PDF/DOCX, 20 Mo max).

Nouvelle Server Action dans `lib/appels-offres/actions.ts` :

```ts
export async function televerserModeleCv(
  appelOffresId: string,
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({ fichier: formData.get("fichier") });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const cheminStockage = construireCheminStockageModeleCv(
    utilisateur.entreprise_id,
    appelOffresId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const buffer = Buffer.from(await fichier.arrayBuffer());
  const resultat = await normaliserDao(buffer, fichier.type);

  const { error: erreurMiseAJour } = await supabase
    .from("appel_offres")
    .update({
      modele_cv_path: cheminStockage,
      modele_cv_nom_original: fichier.name,
      modele_cv_markdown: resultat.markdown,
    })
    .eq("id", appelOffresId);

  if (erreurMiseAJour) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du modèle. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function retirerModeleCv(
  appelOffresId: string,
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("appel_offres")
    .update({ modele_cv_path: null, modele_cv_nom_original: null, modele_cv_markdown: null })
    .eq("id", appelOffresId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

Contrairement à `televerserDao`, pas de mise en file QStash — la
normalisation d'un seul petit fichier modèle se fait en synchrone dans la
Server Action (Décision validée : traitement synchrone).

Nouvelle fonction dans `lib/appels-offres/storage-path.ts` :

```ts
export function construireCheminStockageModeleCv(
  entrepriseId: string,
  appelOffresId: string,
  nomFichierOriginal: string,
): string {
  const nomNettoye = nomFichierOriginal.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${entrepriseId}/appels-offres/${appelOffresId}-modele-cv-${nomNettoye}`;
}
```

## Section 3 — Génération du CV transformé

Nouveau fichier `lib/appels-offres/cv-transformation.ts` (fonction pure de
construction du prompt, testée — même principe de séparation que
`redaction/generer.ts`) :

```ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ maxRetries: 4 });

export function construirePromptCvTransformation(
  cvSourceMarkdown: string,
  modeleCvMarkdown: string,
): string {
  return `Tu réorganises un CV existant selon la structure d'un modèle imposé par un appel d'offres ivoirien.

CV source (contenu réel à réorganiser) :

${cvSourceMarkdown}

Modèle imposé (structure et rubriques à respecter) :

${modeleCvMarkdown}

Consignes strictes :
- N'invente aucune information absente du CV source : aucun nom, aucune date, aucun diplôme, aucune expérience.
- Reprends uniquement les informations réellement présentes dans le CV source, réorganisées selon les rubriques du modèle.
- Si une rubrique du modèle n'a aucun équivalent dans le CV source, écris "[à compléter]" à cet endroit plutôt que d'inventer.
- Réponds uniquement avec le CV réorganisé, sans préambule ni commentaire sur la tâche elle-même.`;
}

export async function genererContenuCvTransforme(
  cvSourceMarkdown: string,
  modeleCvMarkdown: string,
): Promise<string> {
  const prompt = construirePromptCvTransformation(cvSourceMarkdown, modeleCvMarkdown);

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODELE_REDACTION ?? "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texte = bloc && bloc.type === "text" ? bloc.text : "";

  if (!texte.trim()) {
    throw new Error("Réponse Claude vide.");
  }

  return texte.trim();
}
```

Nouveau fichier `lib/appels-offres/export/cv-docx.ts` (même simplicité que
`export/docx.ts` existant — paragraphes, pas de reproduction fidèle de la
mise en page du modèle) :

```ts
import { Document, Paragraph, Packer } from "docx";

export async function genererDocumentCvTransforme(contenuMarkdown: string): Promise<Buffer> {
  const paragraphes = contenuMarkdown
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => new Paragraph({ text: p }));

  const document = new Document({ sections: [{ children: paragraphes }] });
  return Packer.toBuffer(document);
}
```

Nouvelle Server Action dans `lib/appels-offres/actions.ts` :

```ts
export async function genererCvTransforme(
  appelOffresId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true; cvTransforme: CvTransforme }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: appelOffres, error: erreurAo } = await supabase
    .from("appel_offres")
    .select("modele_cv_markdown")
    .eq("id", appelOffresId)
    .maybeSingle();

  if (erreurAo || !appelOffres?.modele_cv_markdown) {
    return { erreur: "Aucun modèle de CV n'a été téléversé pour cet AO." };
  }

  const { data: document, error: erreurDocument } = await supabase
    .from("document")
    .select("contenu_markdown")
    .eq("id", documentId)
    .maybeSingle();

  if (erreurDocument || !document?.contenu_markdown) {
    return { erreur: "Ce CV n'a pas de contenu extrait. Réessayez de le téléverser." };
  }

  let contenuGenere: string;
  try {
    contenuGenere = await genererContenuCvTransforme(
      document.contenu_markdown,
      appelOffres.modele_cv_markdown,
    );
  } catch {
    return { erreur: "Échec de la génération. Réessayez." };
  }

  const bufferDocx = await genererDocumentCvTransforme(contenuGenere);
  const cheminExport = construireCheminStockageCvTransforme(
    utilisateur.entreprise_id,
    appelOffresId,
    documentId,
  );

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminExport, bufferDocx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de l'enregistrement du fichier généré. Réessayez." };
  }

  const { data, error: erreurUpsert } = await supabase
    .from("cv_transforme")
    .upsert(
      {
        appel_offres_id: appelOffresId,
        document_id: documentId,
        contenu_markdown: contenuGenere,
        export_path: cheminExport,
        genere_par: utilisateur.id,
        genere_le: new Date().toISOString(),
      },
      { onConflict: "appel_offres_id,document_id" },
    )
    .select("*")
    .maybeSingle();

  if (erreurUpsert || !data) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, cvTransforme: data as CvTransforme };
}

export async function genererUrlTelechargementCvTransforme(
  cheminStockage: string,
): Promise<{ erreur: string } | { url: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Impossible de générer le lien." };
  return { url: data.signedUrl };
}
```

`upsert` avec `onConflict` explicite plutôt qu'un
lire-puis-insérer-ou-modifier séparé : plus simple, et la contrainte
unique `(appel_offres_id, document_id)` de la migration rend le conflit
détectable directement par Postgres.

Nouvelle fonction dans `lib/appels-offres/storage-path.ts` :

```ts
export function construireCheminStockageCvTransforme(
  entrepriseId: string,
  appelOffresId: string,
  documentId: string,
): string {
  return `${entrepriseId}/appels-offres/cv-transformes/${appelOffresId}-${documentId}.docx`;
}
```

**Tests** (`lib/appels-offres/cv-transformation.test.ts`) : uniquement sur
`construirePromptCvTransformation` (fonction pure) — vérifie que le CV
source et le modèle apparaissent tous deux dans le prompt, et que les
consignes anti-invention sont présentes. Pas de test sur
`genererContenuCvTransforme` (appel Claude) ni sur les Server Actions,
cohérent avec le reste du projet.

## Section 4 — Interface

**Nouveau bloc dans l'onglet Vue d'ensemble** (`appel-offres-detail.tsx`),
juste après le `<form>` principal et avant `<GoNoGo>` — nouveau composant
`app/(app)/appels-offres/[id]/modele-cv.tsx` (Client Component, même
patron d'upload que le composant existant de téléversement de DAO côté
formulaire, mais autonome) :
- Si `modeleCvPath === null` : `<input type="file">` + bouton "Téléverser
  le modèle de CV", appelle `televerserModeleCv`.
- Si un modèle existe : affiche `modeleCvNomOriginal` + bouton "Retirer",
  appelle `retirerModeleCv`.

**`DocumentsExigence`** (existant) reçoit deux nouvelles props :
`modeleCvDisponible: boolean` et
`cvTransformeParDocument: Record<string, { exportPath: string; genereLe: string }>`.
Pour chaque document associé de type `cv`, si `modeleCvDisponible` :
- Aucune entrée dans `cvTransformeParDocument` pour ce document → bouton
  "Transformer selon le modèle" (appelle `genererCvTransforme`, état
  `isPending` désactive le bouton pendant l'appel — génération IA
  synchrone, peut prendre quelques secondes).
- Une entrée existe → bouton "Télécharger le CV transformé" (appelle
  `genererUrlTelechargementCvTransforme` puis `window.open`, comme
  `exporterDossierReponse`) + texte "Généré le {genereLe}" + bouton
  "Régénérer" (ré-appelle `genererCvTransforme`).

**`page.tsx`** : nouvelle requête `listerCvTransformes(appelOffresId)`
(dans `lib/appels-offres/queries.ts`, retourne
`Record<string, CvTransforme>` indexé par `document_id`), ajoutée au
`Promise.all` existant, transmise en prop jusqu'à `DocumentsExigence` (via
`AppelOffresDetail`). `modeleCvDisponible` dérivé directement de
`appelOffres.modele_cv_path !== null`, pas besoin d'une requête séparée.

**Traductions** : nouvelles clés sous `AppelsOffres.detail.modeleCv`
(bloc upload) et `AppelsOffres.detail.exigences.documents` (boutons
transformer/télécharger/régénérer), fr + en.

## États et erreurs

- Aucun modèle de CV sur l'AO : aucun bouton "Transformer" nulle part
  dans `DocumentsExigence`, cohérent avec "seulement si demandé".
- CV associé sans `contenu_markdown` (échec de normalisation à
  l'upload, ou document téléversé avant le fix de la Section 1) :
  `genererCvTransforme` retourne une erreur explicite, toast affiché,
  aucune tentative de génération avec un contenu vide.
- Échec de l'appel Claude : toast d'erreur générique, aucune ligne
  `cv_transforme` créée ni mise à jour (le `upsert` n'est atteint qu'après
  un appel réussi).
- Régénération : remplace intégralement la ligne existante (`contenu_markdown`,
  `export_path`, `genere_par`, `genere_le`) — pas de conservation de
  l'ancienne version.
- Échec de normalisation d'un document bibliothèque (Section 1) : jamais
  bloquant, `contenu_markdown` reste `null`, le document est quand même
  créé et reste téléchargeable.

## Tests

- `construirePromptCvTransformation` (voir section 3).
- Aucun test sur `normaliserDocument` (Section 1) au-delà de ce qui existe
  déjà pour `normaliserDao`/`lireImageParClaude` — cohérent avec le reste
  du projet (code appelant des services externes non testé
  unitairement).
- Aucun test sur les Server Actions ni les composants UI.

## Hors périmètre

- Extraction automatique du modèle de CV depuis le DAO (décision validée
  en introduction).
- Fusion du CV transformé dans l'export du dossier principal (décision
  validée — reste un fichier séparé).
- Reproduction fidèle de la mise en page/tableau du modèle dans le
  `.docx` généré — paragraphes simples, comme le reste des exports de ce
  projet.
- Historique des versions de CV transformé.
- Rattrapage rétroactif de la normalisation sur les documents bibliothèque
  déjà existants.
- Nouveau palier tarifaire.
