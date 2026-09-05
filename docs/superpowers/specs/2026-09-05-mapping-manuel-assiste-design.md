# Mapping manuel assisté (Module 4, sous-projet 2)

Date : 2026-09-05
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Deuxième sous-projet du Module 4 (Mapping et assemblage), après le sous-projet 1
(modèle de données `dossier_reponse`/`exigence_document`, fusionné sur `main`,
commit `6c1d55b`). Rappel du découpage complet du module (voir
[[noubinao_module4_mapping_assemblage]]) :

1. Modèle de données — **complété**.
2. Mapping manuel assisté (ce spec).
3. Assemblage mécanique + export Word.
4. Rédaction assistée par IA — reporté.

Ce spec ne couvre que le mapping lui-même : associer chaque exigence de type
`piece_requise` à un ou plusieurs documents de la bibliothèque. Aucune
génération de contenu, aucun export.

## Point d'attention hérité du sous-projet 1

La revue finale du sous-projet 1 a explicitement identifié une fenêtre où
l'insertion best-effort de `dossier_reponse` (dans `traitement.ts`) peut ne
jamais se produire (fonction serverless tuée par le timeout Vercel juste après
`statut_traitement='termine'` mais avant l'insertion — un retry ultérieur ne
la rattrape pas). **La première lecture de `dossier_reponse` de ce sous-projet
doit donc faire un get-or-create**, jamais un simple `select` — voir section
dédiée ci-dessous.

## Décisions validées avec l'utilisateur

- **Get-or-create intégré à `obtenirAppelOffres` existant**, pas une nouvelle
  fonction séparée. La page de détail d'un AO reste alimentée par un seul
  point de lecture, comme aujourd'hui (`{ appelOffres, exigences }` devient
  `{ appelOffres, exigences, dossierReponse, documentsParExigence }`).
- **Suggestions par filtre de type de document, avec une petite heuristique
  sur le libellé de l'exigence** — pas de recherche vectorielle pgvector, pas
  de recherche texte sur le nom/contenu des documents. Une fonction pure
  classe chaque exigence dans le type de document le plus probable (`cv`,
  `reference_projet`, `agrement`, ou `piece_administrative` par défaut) ; le
  combobox affiche ce type en premier, le reste de la bibliothèque reste
  accessible en dessous.
- **Interaction : combobox multi-sélection par exigence**, pas de modal de
  recherche dédiée — cohérent avec le mobile-first de CLAUDE.md et avec les
  composants déjà utilisés dans le projet (`StatutPipelineSelect`).
- **Périmètre limité aux `piece_requise`** — les `critere_evaluation` ne sont
  pas mappés à des documents dans ce sous-projet (leur lien avec la
  bibliothèque est plus flou ; `exigence_document` n'a aucune contrainte sur
  `type_exigence`, donc étendre plus tard ne demande aucun changement de
  schéma).
- **Documents expirés autorisés mais visuellement signalés** (réutilisation
  du composant `ExpirationBadge` existant), jamais exclus du combobox —
  cohérent avec l'esprit CLAUDE.md ("alertes d'expiration", pas de blocage).
- **Intégration UI dans la liste d'exigences existante**, pas de section
  séparée dupliquant la liste des pièces requises — sous chaque exigence
  affichée dans `appel-offres-detail.tsx`, les documents déjà associés puis
  le combobox pour en ajouter un nouveau.

## Get-or-create de `dossier_reponse`

Dans `lib/appels-offres/queries.ts::obtenirAppelOffres`, après la lecture de
l'AO et avant celle des exigences :

```ts
let dossierReponse = (
  await supabase
    .from("dossier_reponse")
    .select("*")
    .eq("appel_offres_id", id)
    .maybeSingle()
).data;

if (!dossierReponse) {
  const { data: cree, error } = await supabase
    .from("dossier_reponse")
    .insert({ appel_offres_id: id })
    .select("*")
    .maybeSingle();

  if (error) {
    // Course possible avec une autre requête concurrente (ex. deux onglets
    // ouverts sur le même AO au même instant) : la contrainte unique sur
    // appel_offres_id a été violée parce que l'autre requête a inséré la
    // ligne entre notre SELECT et notre INSERT. Non fatal — la ligne existe
    // forcément à ce stade, on la relit.
    dossierReponse = (
      await supabase
        .from("dossier_reponse")
        .select("*")
        .eq("appel_offres_id", id)
        .maybeSingle()
    ).data;
  } else {
    dossierReponse = cree;
  }
}

if (!dossierReponse) {
  throw new Error("Échec de la création du dossier de réponse.");
}
```

Différence explicite avec l'insertion best-effort de `traitement.ts` : ici,
l'échec **doit** remonter une vraie erreur (la page de détail a besoin de
cette ligne pour fonctionner), alors que `traitement.ts` avale l'erreur pour
ne jamais faire échouer un traitement par ailleurs réussi. Les deux mécanismes
coexistent délibérément — best-effort à l'écriture en tâche de fond,
garantie forte à la lecture côté utilisateur.

## Lecture des mappings existants

Toujours dans `obtenirAppelOffres`, après la lecture des exigences :

```ts
const { data: liens, error: erreurLiens } = await supabase
  .from("exigence_document")
  .select("exigence_ao_id, document(*)")
  .in("exigence_ao_id", exigences.map((e) => e.id));

if (erreurLiens) throw erreurLiens;

const documentsParExigence: Record<string, Document[]> = {};
for (const lien of liens ?? []) {
  const exigenceId = lien.exigence_ao_id;
  documentsParExigence[exigenceId] ??= [];
  documentsParExigence[exigenceId].push(lien.document as unknown as Document);
}
```

Repose sur la relation embarquée PostgREST (`document(*)`) via la clé
étrangère `exigence_document.document_id → document.id`, déjà en place
depuis le sous-projet 1 — pas de jointure manuelle à écrire.

## Heuristique de type de document préféré

Nouveau fichier `lib/appels-offres/suggestion-document.ts` :

```ts
import type { TypeDocument } from "@/lib/documents/types";

export function deviserTypeDocumentPrefere(libelle: string): TypeDocument {
  const l = libelle.toLowerCase();
  if (l.includes("cv")) return "cv";
  if (l.includes("référence") || l.includes("reference") || l.includes("projet similaire")) {
    return "reference_projet";
  }
  if (l.includes("agrément") || l.includes("agrement")) return "agrement";
  return "piece_administrative";
}
```

Fonction pure, testée unitairement (un cas par type retourné, plus le cas par
défaut). Utilisée uniquement pour ordonner l'affichage du combobox — ne
filtre jamais définitivement, le reste de la bibliothèque reste toujours
accessible.

## Server Actions

Dans `lib/appels-offres/actions.ts` (fichier existant) :

```ts
export async function associerDocumentAExigence(
  appelOffresId: string,
  exigenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("exigence_document").insert({
    exigence_ao_id: exigenceId,
    document_id: documentId,
    created_by: utilisateur.id,
  });

  // Code Postgres 23505 = violation de contrainte unique : l'association
  // existe déjà (ex. double-clic, ou déjà associée dans un autre onglet).
  // Traité comme un succès idempotent, pas une erreur utilisateur.
  if (error && error.code !== "23505") {
    return { erreur: "Échec de l'association. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function dissocierDocumentAExigence(
  appelOffresId: string,
  exigenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // supprimées — même défense en profondeur qu'appliquée à
  // modifierStatutPipeline (lib/appels-offres/actions.ts) : sans elle, un
  // couple exigence/document qui ne correspond à aucune ligne (ids périmés,
  // déjà dissocié dans un autre onglet) renverrait {succes: true} sans
  // qu'aucune ligne n'ait été supprimée.
  const { data, error } = await supabase
    .from("exigence_document")
    .delete()
    .eq("exigence_ao_id", exigenceId)
    .eq("document_id", documentId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la dissociation. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Association introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}
```

## UI

Dans `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, sous chaque
`<li>` de la liste `piecesRequises` existante :

1. Liste des documents déjà associés (`documentsParExigence[exigence.id]`) :
   nom du document, `ExpirationBadge` si `date_expiration` est dépassée ou
   proche, bouton pour dissocier.
2. Un `Combobox`/`Select` (shadcn) listant d'abord les documents de la
   bibliothèque dont `type === deviserTypeDocumentPrefere(exigence.libelle)`,
   puis le reste de la bibliothèque en dessous (ex. sous un séparateur ou un
   groupe "Autres documents"). Sélectionner un document appelle
   `associerDocumentAExigence`.

La bibliothèque complète (`listerDocuments`) doit être chargée par `page.tsx`
et transmise à `AppelOffresDetail` en plus des données déjà passées
aujourd'hui.

## Tests

- Vitest pour `deviserTypeDocumentPrefere` (fonction pure) : un cas par type
  reconnu (cv, référence, agrément) et le cas par défaut.
- Pas de test automatisé pour le get-or-create ou la lecture jointe
  (`obtenirAppelOffres`) au-delà de la vérification manuelle via
  `npm run dev` — la logique de course est simple à relire mais peu fiable à
  tester sans une vraie base concurrente ; cohérent avec l'absence de test
  automatisé déjà acceptée pour les migrations et lectures Supabase directes
  ailleurs dans le projet.
- Pas de test dédié aux Server Actions (cohérent avec l'absence de tests sur
  les Server Actions existantes du fichier, ex. `modifierStatutPipeline`).

## Hors périmètre

- Mapping des `critere_evaluation` — reporté, aucun changement de schéma
  nécessaire pour l'ajouter plus tard.
- Recherche texte ou vectorielle (pgvector) sur les documents — reportée.
- Toute génération de contenu, tout export — sous-projets 3 et 4.
- Modification de `statut_relecture` — reste `'brouillon'` pendant tout ce
  sous-projet ; la transition vers `'relu'` appartient à un sous-projet
  ultérieur (pas encore spécifié à quel moment exact ce statut change).
