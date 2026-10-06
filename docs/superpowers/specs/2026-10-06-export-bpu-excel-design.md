# Export Excel natif du BPU (sous-projet B)

Date : 2026-10-06
Statut : décisions validées avec l'utilisateur (section par section, brainstorming).

## Contexte

Sous-projet B de l'ensemble export BPU — le A (table BPU intégrée dans le
`.docx` existant) a été livré le 2026-09-30 (voir
`docs/superpowers/specs/2026-09-30-export-bpu-word-design.md`). CLAUDE.md
note que le BPU est « souvent transmis en Excel dans les DAO ivoiriens » :
un export Word ne suffit pas pour l'usage réel (certains acheteurs
exigent le classeur natif, et un tableur permet au client de continuer à
ajuster les prix après export). Reporté au 2026-09-30 pour être brainstormé
séparément une fois A validé par le client pilote (voir mémoire
`noubinao_pilote_tests_sorel`).

Aucune dépendance `xlsx`/`exceljs` présente dans `package.json` à ce jour
— seul `docx` (^9.7.1) y figure, pour l'export Word.

## Décisions validées avec l'utilisateur

- **Bouton dans le composant `Bpu`** (`app/(app)/appels-offres/[id]/bpu.tsx`),
  à côté du total général affiché, visible seulement si
  `sectionsTriees.length > 0`. Pas de bouton dans le bloc d'export
  global (Word) en haut de page — l'export Excel est spécifique au BPU,
  pas au dossier narratif complet.
- **Une feuille Excel par section BPU**, plus une feuille "Résumé" en
  première position (total par section + total général + nombre de
  lignes non chiffrées). Correspond à l'usage réel des DAO ivoiriens
  (BPU souvent découpé par lot).
- **Lignes non chiffrées restent éditables dans Excel** : cellule Prix
  unitaire laissée vide, cellule Montant = formule Excel
  (`=quantité*prix_unitaire`, référence de cellule) plutôt qu'une valeur
  figée côté serveur ou un texte "à compléter" (différent du Word, où
  l'export est un document final, pas un outil de travail). Le client
  tape le prix dans Excel et les totaux (section + résumé) se
  recalculent automatiquement.
- **Librairie `exceljs`** (nouvelle dépendance npm) — gère formules,
  mise en forme (gras, bordures), largeurs de colonnes. Choisie plutôt
  que `xlsx` (SheetJS Community) dont l'édition gratuite limite
  l'écriture de styles/formules avancées.
- **Stockage dans Supabase Storage**, même pattern que l'export Word
  (`exporterDossierReponse`) : upload écrasé à chaque export, URL
  signée (60s) retournée au client. Pas de nouvelle colonne ni table —
  cet export n'est **pas** rattaché au cycle de vie `dossier_reponse`
  (`statut_relecture`), qui concerne le dossier narratif final, pas un
  document financier de travail toujours modifiable.
- **Erreur si `plan.bpu === null`** (aucune section BPU créée) — jamais
  de classeur vide généré ; le bouton n'apparaît de toute façon pas dans
  ce cas (garde côté UI), mais la Server Action reste défensive.

## Modèle de données

Aucune nouvelle table/colonne. Réutilise `construirePlanExport`
(`lib/appels-offres/export/plan.ts`, existant depuis le sous-projet A) —
le champ `PlanExport.bpu` est déjà structuré et partagé entre tous les
formats d'export :

```typescript
bpu: {
  sections: Array<{
    titre: string;
    lignes: Array<{
      codeArticle: string | null;
      designation: string;
      unite: string;
      quantite: number;
      prixUnitaire: number | null;
      montant: number | null;
    }>;
    totalSection: number;
  }>;
  totalGeneral: number;
} | null;
```

Aucune modification de `plan.ts` nécessaire pour ce sous-projet.

## Nouveau module `lib/appels-offres/export/xlsx.ts`

```typescript
export async function genererClasseurExcelBpu(plan: PlanExport): Promise<Buffer>
```

Miroir de `genererDocumentWord` dans `docx.ts`, mais :

- Lève une erreur explicite si `plan.bpu === null` (appelant
  responsable de ne jamais atteindre ce cas en pratique — garde UI).
- **Feuille "Résumé"** (première, nom fixe) :
  - En-tête : titre AO (`plan.titre`), acheteur (`plan.acheteur`), date
    d'export (`plan.dateExport`) — mêmes champs que l'en-tête du Word.
  - Tableau : une ligne par section (titre + total section, ce dernier
    en **formule inter-feuilles** référençant la cellule total de la
    feuille de section correspondante — pas une valeur recalculée côté
    serveur, pour rester juste même après édition manuelle dans Excel).
  - Ligne "Total général" en gras = `SUM()` des cellules total-section
    de ce même tableau Résumé (pas un recalcul serveur non plus).
  - Si des lignes non chiffrées existent (toutes sections confondues) :
    ligne informative "X ligne(s) non chiffrée(s)" sous le total
    général — même esprit informationnel que le Word, jamais bloquant.
- **Une feuille par section BPU**, dans l'ordre de `plan.bpu.sections` :
  - Nom de feuille = titre de la section, nettoyé (caractères interdits
    Excel `: \ / ? * [ ]` retirés, tronqué à 31 caractères) et
    dédupliqué si collision après nettoyage (suffixe numérique, ex.
    "Lot 1 (2)") — Excel exige des noms de feuille uniques.
  - Colonnes : [Code] Désignation Unité Quantité Prix unitaire Montant
    — colonne Code omise si aucune ligne de la section n'a de
    `codeArticle` (même logique que `docx.ts`).
  - Ligne chiffrée : Prix unitaire = valeur numérique brute (format
    nombre `#,##0`, pas de texte "FCFA" dans la cellule — reste un
    nombre exploitable). Montant = **formule** `=Quantité*PrixUnitaire`
    par référence de cellule (ex. `=D2*E2`), jamais une valeur figée.
  - Ligne non chiffrée : cellule Prix unitaire vide (pas de "0", pas de
    placeholder), cellule Montant = même formule (s'évalue à 0 jusqu'à
    ce que le client remplisse le prix — comportement Excel natif, pas
    simulé).
  - Ligne "Total section" en gras sous le tableau = `SUM()` de la
    colonne Montant de cette feuille — c'est **cette cellule** que
    référence la feuille Résumé.
  - En-têtes de colonnes en gras, largeurs de colonnes ajustées au
    contenu (Désignation plus large que Quantité).

## Nouvelle Server Action `exporterBpuExcel`

`lib/appels-offres/actions.ts`, calquée sur `exporterDossierReponse` :

```typescript
export async function exporterBpuExcel(
  appelOffresId: string,
): Promise<{ erreur: string } | { url: string }>
```

1. Auth (`obtenirUtilisateurCourant`), 404 logique si AO introuvable —
   identique au reste du fichier.
2. `listerBpu(appelOffresId)` (existant, déjà utilisé par
   `exporterDossierReponse` et `genererContenuFormulaireStandard`).
3. `construirePlanExport(...)` avec les mêmes arguments que
   `exporterDossierReponse` (sections, documentsParExigence, sections
   rédigées ne servent pas ici mais la fonction les attend — réutilisée
   telle quelle, pas de variante allégée pour éviter la duplication).
4. Si `plan.bpu === null` → `{ erreur: "Aucune section BPU à exporter." }`.
5. `genererClasseurExcelBpu(plan)` → `Buffer`.
6. Upload vers `construireCheminStockageExportBpu(entrepriseId, appelOffresId)`,
   `contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`,
   `upsert: true` — même pattern que le Word.
7. `createSignedUrl(cheminStockage, 60)`.
8. **Aucune écriture** sur `dossier_reponse` (contrairement au Word) —
   voir décision ci-dessus.

## `construireCheminStockageExportBpu`

`lib/appels-offres/storage-path.ts`, sur le modèle de
`construireCheminStockageExport` :

```typescript
export function construireCheminStockageExportBpu(
  entrepriseId: string,
  appelOffresId: string,
): string {
  return `${entrepriseId}/appels-offres/exports/${appelOffresId}-bpu.xlsx`;
}
```

## UI — `bpu.tsx`

- Nouveau bouton "Exporter en Excel" (clé i18n
  `AppelsOffres.detail.bpu.boutonExporterExcel`), affiché seulement si
  `sectionsTriees.length > 0`, à côté du total général déjà affiché.
- État local `exportationExcelEnCours` (booléen), même pattern que les
  autres actions async du composant (`ajoutEnCours`).
- `onClick` → appelle `exporterBpuExcel(appelOffresId)`, `toast.error`
  si `erreur`, sinon `window.open(resultat.url, "_blank")` — identique
  au traitement du bouton "Exporter" (Word) dans
  `appel-offres-detail.tsx`.
- Nouvelles clés i18n (`fr.json`/`en.json`, namespace
  `AppelsOffres.detail.bpu`) : `boutonExporterExcel`,
  `exportationExcelEnCours`.

## États et erreurs

- `genererClasseurExcelBpu` : lève si `plan.bpu === null` (défensif,
  normalement jamais atteint car le bouton est masqué sans section) —
  erreur attrapée dans `exporterBpuExcel`, convertie en
  `{ erreur: ... }` générique, jamais une exception non gérée renvoyée
  au client.
- Mêmes erreurs génériques que `exporterDossierReponse` pour l'upload
  Storage et la génération d'URL signée ("Échec de la génération du
  dossier. Réessayez.", "Impossible de générer le lien.").

## Tests

- `xlsx.ts` (nouveau `xlsx.test.ts`) : relecture du buffer généré via
  `exceljs` (la librairie sait relire ce qu'elle écrit) —
  - Formule Montant correcte sur une ligne chiffrée.
  - Cellule Prix unitaire vide + formule Montant présente sur une ligne
    non chiffrée.
  - Total section = somme des montants de la feuille.
  - Feuille Résumé : total général = somme des totaux de section,
    ligne "lignes non chiffrées" présente seulement si au moins une
    ligne non chiffrée existe toutes sections confondues.
  - Noms de feuille dédupliqués quand deux sections partagent le même
    titre nettoyé.
  - Caractères interdits Excel retirés du nom de feuille, troncature à
    31 caractères respectée.
  - Colonne Code omise quand aucune ligne de la section n'a de
    `codeArticle`.
  - Erreur levée si `plan.bpu === null`.
- Pas de test sur `exporterBpuExcel` (Server Action) ni sur le rendu
  bouton dans `bpu.tsx` — cohérent avec le reste du fichier
  (`exporterDossierReponse` n'est pas testé non plus directement).

## Hors périmètre (sous-projet B)

- **Ré-import** du classeur Excel édité par le client vers l'app (pour
  récupérer les prix saisis) — jamais demandé, nécessiterait son propre
  brainstorming (validation, conflits avec les prix déjà en base).
- **Pyramide de coût** (déboursé sec, marge, frais de structure) —
  jamais exportée, même règle que le Word.
- **Personnalisation du format** (colonnes configurables, style,
  logo/en-tête entreprise) — format fixe.
- **Garde-fou anti-doublon de nom de feuille au-delà de la
  déduplication simple** (deux titres de section strictement
  identiques après nettoyage ET au-delà d'un seul doublon) — suffixe
  numérique incrémental suffisant, cas limite jamais rencontré en
  pratique avec le nombre de sections BPU observé chez le pilote.
