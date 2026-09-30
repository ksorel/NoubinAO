# Page d'accueil / Dashboard (Accueil)

Date : 2026-09-30
Statut : décisions validées avec l'utilisateur (section par section, brainstorming).

## Contexte

NoubinAO n'a aujourd'hui aucune page d'accueil dédiée pour un utilisateur
authentifié : `app/(app)/layout.tsx` redirige vers `/onboarding` si
l'utilisateur n'a pas d'entreprise, mais il n'existe aucune route `/` à
l'intérieur du groupe `(app)` — le logo de la sidebar (`components/app-
sidebar.tsx`) pointe vers `/bibliotheque`, qui sert de point de retour de
fait. Chaque section (bibliothèque, appels d'offres, veille, pipeline,
paramètres) n'a donc aucun point de retour central, et aucune vue
d'ensemble agrégée n'existe nulle part dans l'app.

Idée proposée par le Directeur suite à une réflexion sur la navigation
(pas une demande du client pilote — voir `noubinao_pilote_tests_sorel`
pour le contexte du pilote en cours, sans lien direct avec ce sous-projet).

## Décisions validées avec l'utilisateur

- **Contenu : KPI + listes courtes + graphique**, pas seulement des
  chiffres — la page doit rester un point de départ d'action, pas
  seulement un résumé passif.
- **Route `/accueil`**, nouvelle entrée sidebar "Accueil" (icône `Home`
  lucide) en première position, avant "Bibliothèque". Le logo de la
  sidebar pointe désormais vers `/accueil` au lieu de `/bibliotheque`.
- **Seuils échéance/expiration réutilisés tels quels** depuis
  `lib/appels-offres/echeance.ts` (`calculerStatutEcheance`) et
  `lib/documents/expiration.ts` (`calculerStatutExpiration`) — seuil
  "rouge" à moins de 30 jours, déjà utilisé sur `/pipeline` et
  `/bibliotheque`. Aucun nouveau seuil introduit, pour éviter qu'un AO
  apparaisse "urgent" sur une page et pas sur l'accueil.
- **Graphique : recharts + composant shadcn `Chart`** (nouvelle
  dépendance) plutôt que des barres CSS maison — accepté malgré le
  surdimensionnement pour un seul graphique, l'utilisateur a préféré la
  voie standard/extensible.
- **Zéro nouvelle requête SQL** : réutilise les fetches déjà existants
  (`listerAppelsOffres`, `listerDocuments`, `listerNotifications`) et
  calcule les agrégats côté serveur en mémoire — cohérent avec l'échelle
  actuelle (client pilote unique) et le patron déjà utilisé par
  `pipeline/page.tsx`.

## Données et agrégation

Nouveau module pur `lib/accueil/kpi.ts` (testé, aucun accès réseau/DB) :

```typescript
import type { AppelOffres } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";
import { calculerStatutEcheance } from "@/lib/appels-offres/echeance";
import { calculerStatutExpiration } from "@/lib/documents/expiration";
import type { StatutPipelineAo } from "@/lib/appels-offres/types";

export const STATUTS_PIPELINE_FERMES: readonly StatutPipelineAo[] = [
  "gagne",
  "perdu",
  "sans_suite",
];

export interface KpiAccueil {
  aoEnCours: number;
  aoEcheanceProche: number;
  documentsExpirant: number;
  notificationsNonLues: number;
}

export interface RepartitionStatut {
  statut: StatutPipelineAo;
  nombre: number;
}

export interface AoEcheanceProche {
  id: string;
  titre: string | null;
  dateLimite: string;
}

export interface DocumentExpirant {
  id: string;
  nom: string;
  dateExpiration: string;
}

export function calculerKpiAccueil(
  appelsOffres: AppelOffres[],
  documents: Document[],
  notificationsNonLues: number,
  maintenant?: Date,
): KpiAccueil;

export function calculerRepartitionPipeline(
  appelsOffres: AppelOffres[],
): RepartitionStatut[];

export function listerAoEcheanceProche(
  appelsOffres: AppelOffres[],
  maintenant?: Date,
  limite?: number,
): AoEcheanceProche[];

export function listerDocumentsExpirant(
  documents: Document[],
  maintenant?: Date,
  limite?: number,
): DocumentExpirant[];
```

- `calculerKpiAccueil` :
  - `aoEnCours` = compte des AO dont `statut_pipeline` n'est pas dans
    `STATUTS_PIPELINE_FERMES`.
  - `aoEcheanceProche` = parmi les AO en cours (même filtre que
    `aoEnCours`), compte de ceux dont `calculerStatutEcheance(date_limite,
    maintenant)` vaut `"rouge"` ou `"depassee"`.
  - `documentsExpirant` = compte des documents dont
    `calculerStatutExpiration(date_expiration, maintenant)` vaut
    `"rouge"`.
  - `notificationsNonLues` = passé tel quel (déjà calculé par
    `listerNotifications`).
- `calculerRepartitionPipeline` : regroupe tous les AO (y compris fermés —
  le graphique montre l'ensemble du pipeline, pas seulement les AO en
  cours) par `statut_pipeline`, une entrée par valeur de l'enum
  **présente dans les données** (pas d'entrée à zéro forcée pour un
  statut absent — évite un graphique à 7 barres dont 5 vides sur un
  compte neuf). Ordre : celui de l'enum Postgres (`identifie`,
  `en_preparation`, `soumis`, `en_attente`, `gagne`, `perdu`,
  `sans_suite`).
- `listerAoEcheanceProche` : parmi les AO en cours avec
  `calculerStatutEcheance` = `"rouge"` ou `"depassee"`, trie par
  `date_limite` croissant (les AO dépassées remontent en premier —
  cohérent avec "le plus urgent d'abord"), tronque à `limite` (défaut 5).
  Exclut les AO sans `date_limite` (rien à trier, `calculerStatutEcheance`
  renvoie déjà `null` dans ce cas donc ils sont déjà hors du filtre rouge/
  dépassée).
- `listerDocumentsExpirant` : même logique sur `calculerStatutExpiration`
  = `"rouge"`, trié par `date_expiration` croissant, tronqué à `limite`
  (défaut 5).

Toutes pures, testées unitairement avec un `maintenant` injecté (même
patron que `calculerStatutEcheance`/`calculerStatutExpiration`) — aucun
`new Date()` non injectable dans le code testé.

## Page et composants

`app/(app)/accueil/page.tsx` (server component) :

1. `obtenirUtilisateurCourant()` (redirect `/auth/login` si absent, même
   patron que `/pipeline`).
2. Fetch parallèle : `listerAppelsOffres(entrepriseId)`,
   `listerDocuments(entrepriseId)`, `listerNotifications()`.
3. Appelle les 4 fonctions de `lib/accueil/kpi.ts`.
4. Rendu :
   - Fil d'Ariane (`AnnoncerFilAriane`, item unique "Accueil").
   - 4 `Card` shadcn en grille responsive (1 colonne mobile, 4 colonnes
     desktop) — chiffre + libellé, chaque carte est un `Link` :
     - AO en cours → `/pipeline`
     - AO échéance proche → `/pipeline`
     - Documents expirant → `/bibliotheque`
     - Notifications non lues → `/veille`
   - `components/accueil/repartition-pipeline-chart.tsx` (client
     component, seul composant qui a besoin de recharts) : `BarChart`
     horizontal, une barre par statut présent, couleur via
     `obtenirCouleurStatutPipeline` mappée aux variables CSS déjà
     définies pour les badges pipeline (`--status-*`), libellé du statut
     via le namespace i18n `Pipeline.badge` (clés `identifie`,
     `enPreparation`, `soumis`, `enAttente`, `gagne`, `perdu`,
     `sansSuite` — déjà existantes, voir `messages/fr.json:453-459`).
     Mapping `statut_pipeline` (snake_case) → clé `badge.xxx` (camelCase)
     via une constante locale au composant, même patron littéral que
     `STATUT_LABELS` déjà dupliqué dans `pipeline-table.tsx` et
     `statut-pipeline-select.tsx` — une troisième copie ponctuelle plutôt
     qu'une extraction commune, hors scope de ce sous-projet.
   - Deux listes côte à côte (`grid-cols-1 md:grid-cols-2`) : "AO
     échéance proche" et "Documents expirant bientôt", chacune une
     `Card` avec jusqu'à 5 lignes cliquables (`Link` vers
     `/appels-offres/[id]` ou `/bibliotheque`). Date relative via
     `Intl.RelativeTimeFormat(locale, { numeric: "auto" })`
     (natif JS, zéro dépendance, s'accorde automatiquement fr/en) —
     `format(joursRestants, "day")` où `joursRestants` vient du même
     calcul que `calculerStatutEcheance`/`calculerStatutExpiration`
     (différence en jours entre la date et `maintenant`, déjà exposée
     par les champs `dateLimite`/`dateExpiration` de
     `AoEcheanceProche`/`DocumentExpirant` — le composant recalcule la
     différence en jours côté client à l'affichage, pas besoin de
     l'exposer séparément dans le type).

## Sidebar et navigation

`components/app-sidebar.tsx` :
- Nouvel item `SidebarMenuItem` en première position (avant
  "Bibliothèque"), icône `Home` (lucide), libellé `t("accueil")` —
  nouvelle clé dans le namespace `Sidebar` (`messages/fr.json`/`en.json`).
- Le `Link` du logo (`SidebarHeader`) change de `href="/bibliotheque"` à
  `href="/accueil"`.

## États et erreurs

- **Vide (compte neuf, aucun AO/document)** : les 4 cartes affichent 0,
  le graphique de répartition est omis entièrement (pas de graphique à
  zéro barre) remplacé par un message neutre dans le nouveau namespace
  i18n `Accueil` (`aucunAo`), les deux listes affichent chacune leur
  propre message vide (`Accueil.aucunAoEcheanceProche`,
  `Accueil.aucunDocumentExpirant`) — même convention de copie que
  l'existant ("Aucun X pour l'instant.", voir `messages/fr.json:153`),
  pas de clé partagée entre namespaces (le projet ne le fait déjà nulle
  part ailleurs, chaque namespace a ses propres clés même pour un texte
  similaire).
- **Erreur** : `error.tsx` standard du groupe `(app)/accueil/error.tsx`,
  même patron que `pipeline/error.tsx`/`appels-offres/error.tsx`.
- **Chargement** : `loading.tsx` standard, même patron que les autres
  pages du groupe.

## Tests

- `lib/accueil/kpi.test.ts` : les 4 fonctions pures, cas couverts —
  aucun AO/document (zéros, listes vides), AO en cours vs fermés (exclus
  du compte "en cours" mais inclus dans la répartition), échéance
  dépassée vs rouge vs orange/vert (limite exacte des seuils), document
  sans `date_expiration` (exclu, pas de crash), troncature à `limite`
  avec plus de 5 éléments éligibles, tri correct (le plus urgent
  d'abord).
- Pas de test sur le rendu du graphique recharts (composant client, pas
  de logique — cohérent avec le reste du projet qui ne teste pas le
  rendu JSX directement, voir `docx.ts` jamais testé au rendu non plus).

## Hors périmètre

- Filtrage au clic sur une carte (ex. clic "AO en cours" → `/pipeline`
  pré-filtré) — lien simple vers la page, pas de query param.
- Drill-down par secteur d'activité sur le graphique.
- Tendance mensuelle / historique (aucun champ de date fiable pour une
  série temporelle exploitable aujourd'hui).
- KPI lié au post-mortem gagné/perdu (module non livré).
- Personnalisation du dashboard (cartes réordonnables, masquables).
