# Export BPU dans le Word (sous-projet A)

Date : 2026-09-30
Statut : décisions validées avec l'utilisateur (section par section, brainstorming).

## Contexte

Premier sous-projet d'un ensemble à deux volets sur l'export du BPU
(Bordereau des Prix Unitaires, offre financière) : le BPU se construit et
se remplit entièrement dans l'app (`lib/appels-offres/bpu.ts`,
`app/(app)/appels-offres/[id]/bpu.tsx`/`bpu-section.tsx`/
`bpu-ligne-row.tsx` — sections, lignes avec désignation/unité/quantité/
prix_unitaire, montant recalculé côté serveur, suggestion de prix
historique livrée le 2026-09-28) mais n'a **aucun export** : le `.docx`
généré par `exporterDossierReponse` (`lib/appels-offres/actions.ts`) ne
couvre que sommaire attendu, sections rédigées, pièces requises et
critères d'évaluation (`lib/appels-offres/export/plan.ts`,
`lib/appels-offres/export/docx.ts`). Seul le montant total calculé
apparaît en texte dans la lettre de soumission
(`genererLettreSoumission`, `lib/appels-offres/formulaires-standards.ts`)
si ce formulaire a été généré.

Découvert suite à une question du Directeur, elle-même issue d'une
question du client pilote (manque de personnel dédié, Sorel teste
désormais avec lui en direct — voir mémoire
`noubinao_pilote_tests_sorel`) qui demandait si l'app pouvait générer un
document de réponse technique **et** financière : la partie technique
existe déjà (export Word), la partie financière (BPU) non.

**Second sous-projet (B), reporté.** CLAUDE.md note que le BPU est
« souvent transmis en Excel dans les DAO ivoiriens » — un export Excel
natif est donc une vraie valeur, mais un sous-système indépendant
(nouvelle dépendance, nouveau code de rendu). Décomposé en sous-projet B,
à brainstormer et spécifier séparément une fois A validé avec le client
pilote.

## Décisions validées avec l'utilisateur

- **Sous-projet A : table BPU intégrée au Word existant.** Un seul
  bouton, un seul fichier — aucun changement UI, aucune nouvelle
  dépendance (le paquet `docx` gère déjà les tables).
- **Ligne non chiffrée (`prix_unitaire === null`)** : cellules Prix
  unitaire et Montant affichent le texte **« à compléter »**, jamais un
  nombre (0 ou vide) — évite qu'un montant erroné parte chez l'acheteur.
  Cohérent avec le texte déjà utilisé dans `genererLettreSoumission`.
- **Aucun blocage à l'export** si des lignes restent non chiffrées —
  informationnel seulement, même philosophie que la lettre de
  soumission (qui affiche `[montant à compléter]` sans bloquer).
- **Section BPU omise du document si `plan.bpu === null`** (aucune
  section BPU créée) — différent des pièces requises (qui viennent du
  DAO et sont donc toujours présentes) : pas de titre vide, pas de
  placeholder « aucune ligne ».
- **Pyramide de coût (déboursé sec, marge, frais de structure) jamais
  exportée** — info interne de calcul de prix, jamais destinée à
  l'acheteur.

## Modèle de données

Aucune nouvelle table. Réutilise `section_bpu`/`ligne_bpu` existants via
`listerBpu(appelOffresId)` (`lib/appels-offres/queries.ts`, déjà utilisée
par `genererContenuFormulaireStandard`) :

```typescript
listerBpu(appelOffresId: string): Promise<{
  sections: SectionBpu[];
  lignesParSection: Record<string, LigneBpu[]>;
}>
```

## `PlanExport` étendu

`lib/appels-offres/export/plan.ts` :

```typescript
export interface PlanExport {
  // ... champs existants inchangés ...
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
  } | null; // null si aucune section BPU créée
}
```

`construirePlanExport` reçoit deux paramètres supplémentaires
(`sectionsBpu: SectionBpu[]`, `lignesParSectionBpu: Record<string,
LigneBpu[]>` — même shape que le retour de `listerBpu`) et construit ce
champ :

- `bpu === null` si `sectionsBpu.length === 0`.
- Sinon, une entrée par section (dans l'ordre déjà géré par
  `listerBpu`/`ordre`), chaque ligne mappée depuis `LigneBpu`, montant
  via `calculerMontantLigne` (`lib/appels-offres/bpu.ts`, existant),
  `totalSection` via `sommerMontants` (existant) sur les lignes de la
  section.
- `totalGeneral` = somme des `totalSection` (équivalent à
  `sommerMontants` sur l'ensemble des lignes toutes sections confondues
  — même calcul que `genererLettreSoumission` utilise déjà pour le
  montant total du BPU).

Fonction pure, testée — même patron que le reste de `plan.ts`.

## Rendu dans le Word

`lib/appels-offres/export/docx.ts`, `genererDocumentWord` — nouveau bloc
ajouté **après** la section "Critères d'évaluation" (l'offre financière
vient après l'offre technique), seulement si `plan.bpu !== null` :

- Titre « Bordereau des prix unitaires » en `HEADING_1`.
- Pour chaque section BPU :
  - Titre de section en `HEADING_2`.
  - Table (`docx` `Table`/`TableRow`/`TableCell`, déjà disponible dans
    le paquet) avec en-têtes : Code (colonne omise si aucune ligne de la
    section n'a de `codeArticle`), Désignation, Unité, Quantité, Prix
    unitaire, Montant.
    - Ligne chiffrée : Prix unitaire et Montant formatés via
      `formaterMontant` (voir ci-dessous) + suffixe « FCFA ».
    - Ligne non chiffrée : Prix unitaire et Montant affichent
      **« à compléter »**.
  - Sous-total de section : paragraphe en gras juste après la table,
    « Total section : {formaterMontant(totalSection)} FCFA ».
- Après toutes les sections : paragraphe en gras, seul,
  « Total général : {formaterMontant(totalGeneral)} FCFA ».

## `formaterMontant` — déplacement, pas de duplication

Actuellement dupliquée localement dans
`lib/appels-offres/formulaires-standards.ts` :

```typescript
function formaterMontant(montant: number): string {
  return montant.toLocaleString("fr-FR").replace(/[  ]/g, " ");
}
```

Déplacée vers `lib/appels-offres/bpu.ts` (module domaine déjà partagé
pour les calculs BPU), exportée, puis importée par
`formulaires-standards.ts` (remplace sa copie locale) et par `docx.ts`
(nouvel usage). Aucune duplication introduite ; petit nettoyage inclus
dans ce sous-projet plutôt que différé.

## Branchement dans `exporterDossierReponse`

`lib/appels-offres/actions.ts` : ajoute l'appel à `listerBpu(appelOffresId)`
(même patron que `genererContenuFormulaireStandard`), passe le résultat
(`sections`, `lignesParSection`) à `construirePlanExport`. Aucun
changement de signature de retour, aucun changement UI — le bouton
« Exporter » existant produit désormais un document qui inclut le BPU.

## États et erreurs

- `construirePlanExport` : fonction pure, aucun échec possible avec le
  champ `bpu` en plus.
- `listerBpu` dans `exporterDossierReponse` : appelée sans wrapper
  d'erreur dédié, même comportement que son usage existant dans
  `genererContenuFormulaireStandard` — pas de nouveau traitement ajouté.
- `genererDocumentWord` : usage standard de l'API `Table` du paquet
  `docx`, aucun nouveau mode d'échec.

## Tests

- `construirePlanExport` (`plan.test.ts`) : cas étendus — aucune section
  BPU (`bpu` → `null`), une section avec lignes toutes chiffrées (total
  section + total général corrects), ligne non chiffrée incluse dans
  `lignes` mais exclue du total, plusieurs sections (total général =
  somme des totaux de section).
- `formaterMontant`, une fois déplacée dans `bpu.ts` : tests ajoutés
  dans `bpu.test.ts` (formatage séparateur de milliers fr-FR) —
  n'existaient nulle part avant ce sous-projet.
- Pas de test sur `genererDocumentWord` (rendu table) — cohérent avec le
  reste du fichier, jamais testé directement.

## Hors périmètre (sous-projet A)

- **Export Excel** — sous-projet B, brainstormé et spécifié séparément
  une fois A validé avec le client pilote.
- **Blocage/garde-fou sur lignes non chiffrées** — informationnel
  seulement, pas de blocage à l'export.
- **Pyramide de coût** (déboursé sec, marge, frais de structure) —
  jamais exposée à l'acheteur, absente de l'export.
- **Personnalisation du format de table** (colonnes configurables,
  style) — format fixe.
