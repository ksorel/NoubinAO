# Assemblage mécanique + export Word (Module 4, sous-projet 3)

Date : 2026-09-05
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Troisième sous-projet du Module 4 (Mapping et assemblage), après le sous-projet 2
(mapping manuel assisté, fusionné sur `main`, commit `8e15c12`). Rappel du
découpage complet du module (voir [[noubinao_module4_mapping_assemblage]]) :

1. Modèle de données — **complété**.
2. Mapping manuel assisté — **complété**.
3. Assemblage mécanique + export Word (ce spec).
4. Rédaction assistée par IA — reporté.

Ce spec couvre la génération d'un fichier `.docx` téléchargeable qui assemble
le dossier de réponse à partir des documents déjà associés aux exigences.
**Aucune génération de texte par IA** : insertion mécanique des noms/types de
documents existants, pas de rédaction de contenu (c'est le sous-projet 4).

## Précision technique actée avant le brainstorming

Le skill Claude `docx` mentionné dans `CLAUDE.md` sert à produire des
documents Word comme livrable de conversation Claude — il n'est pas conçu
pour être embarqué comme dépendance runtime d'une Server Action Next.js.
Ce sous-projet utilise le paquet **npm `docx`** (bibliothèque de
construction OOXML programmatique, gratuite, MIT), une dépendance normale
de l'application, pas le skill Claude.

## Décisions validées avec l'utilisateur

- **Sens de l'"assemblage"** : un dossier structurant, pas une fusion binaire.
  Les documents sources associés (PDF/DOCX/images scannées) ne sont jamais
  fusionnés dans le `.docx` généré. Celui-ci sert de page de garde + sommaire
  + une section par exigence listant les documents associés (nom et type
  seulement) — l'utilisateur assemble ou imprime le dossier physique final en
  dehors de NoubinAO à partir de cette structure.
- **Déclencheur** : un bouton explicite "Exporter le dossier" sur la page de
  détail de l'AO, visible uniquement quand `statut_traitement === 'termine'`.
  Chaque export réussi régénère le `.docx` (écrase le précédent au même
  chemin), met à jour `export_path`/`exporte_le`, et fait passer
  `statut_relecture` à `'exporte'`.
- **Exigences non mappées** : jamais bloquant. Une exigence "pièce requise"
  sans document associé apparaît dans le `.docx` avec la mention "Aucun
  document associé — à compléter" — cohérent avec l'esprit CLAUDE.md de ne
  jamais bloquer l'utilisateur ; le dossier reste réexportable après
  complétion du mapping.
- **Pas de lien de téléchargement dans le `.docx`** : les URLs signées
  existantes expirent en 60s (`genererUrlTelechargementDao`), beaucoup trop
  court pour un lien dans un document réouvert plusieurs jours après. Le
  `.docx` liste seulement nom + type de chaque document associé ; le
  téléchargement réel du fichier se fait séparément depuis la Bibliothèque ou
  la page de l'AO (mécanisme déjà existant).
- **Critères d'évaluation inclus, en lecture seule** : une section liste
  libellé + pondération de chaque `critere_evaluation`, sans document associé
  (hors périmètre du mapping) — cohérent avec l'affichage déjà présent sur la
  page de détail, rend le `.docx` utile comme rappel complet du DAO.
- **Génération technique : paquet npm `docx`**, pas de template
  `.docx` + docxtemplater (pas de besoin exprimé de personnalisation visuelle
  par un non-développeur, YAGNI), pas de conversion HTML intermédiaire
  (couche d'indirection sans bénéfice ici).

## Point bloquant découvert pendant le brainstorming — migration requise

La migration du sous-projet 1
(`supabase/migrations/20260905141600_dossier_reponse.sql`) n'a créé
**aucune policy RLS `UPDATE`** sur `dossier_reponse` (seulement
select/insert/delete, voir le fichier). Or l'export doit écrire
`export_path`, `exporte_le` et `statut_relecture` sur cette table — sans
nouvelle policy, la mise à jour serait silencieusement rejetée par RLS
(0 ligne affectée, pas d'exception levée par défaut côté PostgREST/Supabase
sur un `.update()` qui ne matche aucune ligne visible).

Nouvelle migration à ajouter dans ce sous-projet, policy strictement au même
patron que les policies existantes de la table :

```sql
-- Module 4, sous-projet 3 : policy UPDATE manquante sur dossier_reponse,
-- nécessaire pour que l'export puisse écrire export_path/exporte_le/statut_relecture.
create policy "dossier_reponse_update_membres" on dossier_reponse
  for update using (
    exists (
      select 1 from appel_offres ao
      join utilisateur u on u.entreprise_id = ao.entreprise_id
      where ao.id = dossier_reponse.appel_offres_id and u.id = auth.uid()
    )
  );
```

## Architecture

Nouveau dossier `lib/appels-offres/export/`, séparant la logique testable de
la dépendance à la bibliothèque `docx`, sur le même principe que
`lib/appels-offres/normalisation/` (séparer préparation de données et appel à
une librairie externe) :

- **`lib/appels-offres/export/plan.ts`** — fonction pure
  `construirePlanExport(appelOffres, exigences, documentsParExigence): PlanExport`
  qui transforme les données déjà chargées en une structure JS simple
  décrivant le contenu du document. Aucune dépendance à `docx` — entièrement
  testable en Vitest.
- **`lib/appels-offres/export/docx.ts`** — fonction fine
  `genererDocumentWord(plan: PlanExport): Promise<Buffer>` qui traduit ce
  plan en document Word via le paquet npm `docx`. Pas de test unitaire dédié
  (cohérent avec l'absence de test sur `queries.ts` et sur les autres appels
  à des bibliothèques externes du projet) — vérifiée manuellement.

### Type `PlanExport`

```ts
export interface PlanExport {
  titre: string;
  acheteur: string | null;
  secteur: string | null;
  dateExport: string; // ISO, formatée à l'affichage
  sommaireAttendu: string[] | null;
  piecesRequises: Array<{
    libelle: string;
    documents: Array<{ nom: string; type: string }>; // type = libellé français, voir note ci-dessous
  }>;
  criteresEvaluation: Array<{
    libelle: string;
    ponderation: number | null;
  }>;
}
```

**Note sur la traduction du type de document** : `construirePlanExport` est une
fonction pure sans accès à `next-intl` (ni `useTranslations` ni
`getTranslations` — aucune Server Action de `lib/appels-offres/actions.ts`
n'utilise `getTranslations` aujourd'hui, leurs messages d'erreur sont déjà en
français en dur, ex. `"Non authentifié"`). Pour rester cohérent avec cette
convention existante plutôt que d'introduire un nouveau mécanisme de
résolution de locale côté serveur, `plan.ts` définit une constante locale :

```ts
const LIBELLES_TYPE_DOCUMENT: Record<TypeDocument, string> = {
  piece_administrative: "Pièce administrative",
  reference_projet: "Référence de projet",
  cv: "CV",
  agrement: "Agrément",
};
```

Le `.docx` généré est donc en français quel que soit le paramètre de langue
de l'interface — cohérent avec la priorité affirmée dans `CLAUDE.md`
("le français doit être complet et soigné en priorité, l'anglais peut être
complété progressivement") et avec le fait que les messages d'erreur des
Server Actions existantes ne sont eux-mêmes jamais traduits.

## Composants et flux

1. **Nouvelle Server Action** `exporterDossierReponse(appelOffresId: string)`
   dans `lib/appels-offres/actions.ts` :
   - Vérifie l'authentification via `obtenirUtilisateurCourant()`.
   - Recharge `appelOffres` + `exigences` + `documentsParExigence` via
     `obtenirAppelOffres` (déjà tout ce qu'il faut, aucune nouvelle requête
     de lecture à inventer).
   - Appelle `construirePlanExport` puis `genererDocumentWord`.
   - Upload le buffer dans Supabase Storage, bucket `documents`, chemin
     déterministe produit par une nouvelle fonction
     `construireCheminStockageExport(entrepriseId, appelOffresId)` dans
     `lib/appels-offres/storage-path.ts`, avec `upsert: true` pour écraser un
     export précédent au même chemin.
   - Met à jour `dossier_reponse` : `export_path`, `exporte_le = now()`,
     `statut_relecture = 'exporte'`.
   - Retourne une URL signée (même mécanisme que
     `genererUrlTelechargementDao`, 60s) pour déclencher le téléchargement
     immédiat côté client.
2. **Bouton "Exporter le dossier"** dans
   `app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, visible seulement
   quand `pret` (comme le bouton "Télécharger le DAO" déjà présent), suit
   exactement le pattern du `telecharger()` existant : état de chargement
   local (`useState`), appel de la Server Action, `window.open(url, "_blank")`
   sur succès, `toast.error` sur échec.

## Contenu du document généré

Reprend la structure déjà affichée à l'écran sur la page de détail, sans
invention d'une nouvelle hiérarchie :

1. **Page de garde** : titre de l'AO, acheteur, secteur, date d'export.
2. **"Sommaire attendu"** : liste à puces de `appelOffres.sommaire_attendu`,
   si présent — purement informatif, pas la structure de jointure avec les
   documents (il n'existe aucune clé reliant ces chaînes de texte libres aux
   lignes `exigence_ao`).
3. **"Pièces requises"** : une sous-section par exigence de type
   `piece_requise` — libellé, puis liste des documents associés (nom + type
   traduit) ou la mention "Aucun document associé — à compléter" si vide.
4. **"Critères d'évaluation"** : libellé + pondération (si non nulle) de
   chaque exigence de type `critere_evaluation`, lecture seule, sans
   document.

## Chemin de stockage

```ts
export function construireCheminStockageExport(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-dossier-reponse.docx`;
}
```

Chemin déterministe (pas de nom de fichier original à nettoyer, contrairement
à `construireCheminStockageDao`) — un seul export actif par AO à la fois,
cohérent avec la décision "chaque export écrase le précédent".

## Gestion d'erreurs

- Échec de génération ou d'upload : la Server Action retourne
  `{ erreur: string }`, `dossier_reponse` n'est **pas** modifié (pas de mise
  à jour partielle — la mise à jour de `dossier_reponse` n'a lieu qu'après
  upload réussi) — toast d'erreur côté client, aucun changement d'état
  silencieux.
- Ré-export : toujours autorisé, à tout moment, écrase le fichier précédent
  et réinitialise `exporte_le` — pas de versionnement des exports dans ce
  sous-projet (YAGNI, non demandé).
- Si la mise à jour de `dossier_reponse` échoue après un upload par ailleurs
  réussi (cas rare) : la Server Action retourne quand même `{ erreur }` — le
  fichier reste dans le storage (écrasé au prochain export réussi), aucune
  incohérence durable côté utilisateur puisque `export_path`/`statut_relecture`
  n'ont pas changé et l'UI ne montre donc pas un export qui n'a pas abouti.

## Tests

- Vitest sur `construirePlanExport` (fonction pure) : cas avec pièces
  mappées, pièces non mappées ("à compléter"), critères présents/absents,
  `sommaire_attendu` présent/absent (`null`).
- Pas de test sur `genererDocumentWord` ni sur la Server Action `exporterDossierReponse`
  (cohérent avec l'absence de test sur `queries.ts` et sur les Server Actions
  existantes du fichier) — vérification manuelle du `.docx` produit (ouverture
  réelle dans Word/LibreOffice) à faire par Sorel après implémentation, en
  plus de la vérification de la nouvelle policy RLS via `npm run dev`.

## Hors périmètre

- Fusion réelle du contenu des documents sources (texte extrait inséré dans
  le `.docx`, ou incorporation de pages PDF) — reporté, aucune décision prise
  qui l'empêcherait techniquement plus tard.
- Génération ou rédaction de texte par IA — sous-projet 4.
- Export PDF (mentionné comme possibilité dans `CLAUDE.md`) — seul le `.docx`
  est traité dans ce sous-projet.
- Versionnement des exports (historique des fichiers générés) — un seul
  export actif par AO, écrasé à chaque nouvel export.
- Transition automatique de `statut_relecture` vers `'relu'` — reste piloté
  manuellement ou par un sous-projet ultérieur ; ce sous-projet ajoute
  seulement la transition vers `'exporte'`.
- Liens hypertexte vers les documents dans le `.docx` — délibérément exclus
  (URLs signées trop courtes pour un usage différé).
- Statut d'expiration des documents (équivalent `ExpirationBadge`) dans le
  `.docx` généré — la conception approuvée ne liste que nom + type ; ajouter
  un signal d'expiration serait une amélioration naturelle mais n'a pas été
  discutée ni approuvée, à traiter dans une itération future si le besoin est
  exprimé.
