# Historique de prix par ligne BPU (suggestion active)

Date : 2026-09-25
Statut : approuvé par l'utilisateur.

## Contexte

Priorité P1 de la feuille de route stratégique (artefact "Le Cap
NoubinAO", tier P1 — « ce qui fait gagner, pas seulement soumettre »),
jamais commencée jusqu'ici.

Le BPU (bordereau des prix unitaires) vit dans son propre onglet de la
page détail AO (`app/(app)/appels-offres/[id]/appel-offres-detail.tsx`,
onglet « BPU », voir mémoire du sous-projet BPU du Module 7). Chaque
ligne (`ligne_bpu` : `code_article`, `designation`, `unite`, `quantite`,
`prix_unitaire`, `debourse_sec`, `taux_frais_structure`) appartient à une
`section_bpu`, elle-même rattachée à un `appel_offres`
(`supabase/migrations/20260916120000_bpu.sql`,
`supabase/migrations/20260916150000_pyramide_cout_bpu.sql`). RLS déjà en
place scope toute lecture/écriture à l'entreprise du membre connecté.

Le gap : aucune mémoire des prix déjà pratiqués sur les AO précédents.
Une entreprise qui a déjà chiffré « Fourniture et pose de béton armé
dosé à 350 kg/m³ » à 45 000 FCFA/m³ sur un AO passé ressaisit ce prix à
l'aveugle sur chaque nouvel AO, alors que la donnée existe déjà dans
`ligne_bpu`.

Patron déjà existant pour ce type de rapprochement texte↔texte :
`extraireMotsCles` (`lib/texte/mots-cles.ts`) et `classerCvParPertinence`
(`lib/appels-offres/suggestion-document.ts`, sous-projet suggestion CV) —
chevauchement de mots-clés, aucun appel IA. Réutilisé ici plutôt que
réinventé.

## Décisions validées avec l'utilisateur

- **Suggestion active**, pas seulement une vue de consultation séparée —
  au moment de saisir une ligne BPU, NoubinAO propose le prix déjà
  pratiqué pour une désignation proche, comme la suggestion CV déjà
  livrée.
- **Matching par mots-clés + unité** :
  - **Unité = filtre dur.** Une ligne historique n'est candidate que si
    son `unite` est strictement identique (comparaison
    trim + lowercase) à celle de la ligne en cours. Jamais de prix
    suggéré d'une unité différente — risque de donnée trompeuse trop
    élevé sur une donnée qui engage un montant d'offre financière.
  - **Score par chevauchement de mots-clés** (`extraireMotsCles`) sur la
    désignation, parmi les lignes qui passent le filtre unité. Aucun mot-
    clé commun → aucune suggestion (pas de tri hasardeux sans signal
    réel, même principe que `classerCvParPertinence`).
- **Périmètre historique : toute ligne chiffrée (`prix_unitaire` non
  nul), sur tout AO différent de l'AO courant, quel que soit le statut
  pipeline** — maximise le volume disponible dès le départ plutôt que de
  se limiter aux AO gagnés (l'historique resterait vide trop longtemps
  pour une PME qui démarre avec NoubinAO).
- **Une seule suggestion affichée : la meilleure.** En cas d'égalité de
  score, la ligne historique la plus récente
  (`appel_offres.created_at` desc) l'emporte.
- **Affichage : bandeau automatique sous la ligne BPU**, pas de bouton
  de déclenchement manuel. Dès que la désignation est saisie (au blur) et
  que `prix_unitaire` est vide, le bandeau apparaît si une suggestion
  existe — silencieux sinon, jamais bloquant. Bouton « Utiliser » pour
  accepter, bouton de fermeture pour ignorer sans agir.
- **Provenance éphémère, pas persistée.** Le bandeau affiche la source
  (désignation d'origine, titre AO, date) au moment de la suggestion,
  mais une fois acceptée, `prix_unitaire` redevient un simple nombre —
  aucune nouvelle colonne de lien vers la ligne d'origine. Ce n'est pas
  un contenu généré par IA (le garde-fou de traçabilité CLAUDE.md vise la
  génération IA), juste une aide de saisie déterministe ; le lien perdu
  après acceptation est un compromis assumé plutôt qu'un oubli.

## Modèle de données

Aucune migration. Toutes les données nécessaires existent déjà dans
`appel_offres`, `section_bpu`, `ligne_bpu`.

## Changement 1 — nouveau module pur `lib/appels-offres/suggestion-prix-bpu.ts`

```ts
import { extraireMotsCles } from "@/lib/texte/mots-cles";

export interface LigneBpuHistorique {
  designation: string;
  unite: string;
  prixUnitaire: number;
  appelOffresId: string;
  appelOffresTitre: string | null;
  appelOffresCreatedAt: string;
}

export interface SuggestionPrixBpu {
  prixUnitaire: number;
  designationOrigine: string;
  appelOffresTitre: string | null;
  appelOffresCreatedAt: string;
}

// Parmi les lignes BPU historiques déjà filtrées à la même unité (filtre
// dur appliqué en amont, côté requête — voir obtenirSuggestionPrixBpu),
// retient celle dont la désignation partage le plus de mots-clés avec la
// désignation en cours. Aucun chevauchement : aucune suggestion, plutôt
// que proposer un prix sans rapport. Égalité de score : la plus récente.
export function trouverMeilleureSuggestionPrix(
  designation: string,
  lignesHistoriques: LigneBpuHistorique[],
): SuggestionPrixBpu | null {
  const motsRecherches = extraireMotsCles(designation);
  if (motsRecherches.length === 0) return null;

  let meilleure: LigneBpuHistorique | null = null;
  let meilleurScore = 0;

  for (const ligne of lignesHistoriques) {
    const motsLigne = new Set(extraireMotsCles(ligne.designation));
    const score = motsRecherches.filter((mot) => motsLigne.has(mot)).length;
    if (score === 0) continue;

    if (
      meilleure === null ||
      score > meilleurScore ||
      (score === meilleurScore && ligne.appelOffresCreatedAt > meilleure.appelOffresCreatedAt)
    ) {
      meilleure = ligne;
      meilleurScore = score;
    }
  }

  if (meilleure === null) return null;
  return {
    prixUnitaire: meilleure.prixUnitaire,
    designationOrigine: meilleure.designation,
    appelOffresTitre: meilleure.appelOffresTitre,
    appelOffresCreatedAt: meilleure.appelOffresCreatedAt,
  };
}
```

Fonction pure, aucun accès réseau — le filtre unité et le périmètre
entreprise/AO courant sont appliqués en amont par l'appelant (Server
Action, changement 2), pas ici. Sépare la logique testable (scoring) de
l'accès aux données, même découpage que `classerCvParPertinence` vs son
appelant `documents-exigence.tsx`.

## Changement 2 — nouvelle Server Action `obtenirSuggestionPrixBpu` (`lib/appels-offres/actions.ts`)

```ts
export async function obtenirSuggestionPrixBpu(
  appelOffresId: string,
  designation: string,
  unite: string,
): Promise<SuggestionPrixBpu | null> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return null;

  const uniteNormalisee = unite.trim().toLowerCase();
  if (designation.trim().length === 0 || uniteNormalisee.length === 0) return null;

  const supabase = await createClient();

  const { data: autresAppelsOffres } = await supabase
    .from("appel_offres")
    .select("id, titre, fichier_dao_nom_original, created_at")
    .eq("entreprise_id", utilisateur.entreprise_id)
    .neq("id", appelOffresId);

  if (!autresAppelsOffres || autresAppelsOffres.length === 0) return null;

  const { data: sections } = await supabase
    .from("section_bpu")
    .select("id, appel_offres_id")
    .in(
      "appel_offres_id",
      autresAppelsOffres.map((ao) => ao.id),
    );

  if (!sections || sections.length === 0) return null;

  const { data: lignes } = await supabase
    .from("ligne_bpu")
    .select("designation, unite, prix_unitaire, section_bpu_id")
    .in(
      "section_bpu_id",
      sections.map((s) => s.id),
    )
    .not("prix_unitaire", "is", null);

  if (!lignes || lignes.length === 0) return null;

  const aoParSection = new Map(sections.map((s) => [s.id, s.appel_offres_id]));
  const aoParId = new Map(autresAppelsOffres.map((ao) => [ao.id, ao]));

  const lignesHistoriques: LigneBpuHistorique[] = lignes
    .filter((l) => l.unite.trim().toLowerCase() === uniteNormalisee)
    .map((l) => {
      const appelOffresId = aoParSection.get(l.section_bpu_id)!;
      const ao = aoParId.get(appelOffresId)!;
      return {
        designation: l.designation,
        unite: l.unite,
        prixUnitaire: l.prix_unitaire as number,
        appelOffresId,
        appelOffresTitre: ao.titre ?? ao.fichier_dao_nom_original,
        appelOffresCreatedAt: ao.created_at,
      };
    });

  return trouverMeilleureSuggestionPrix(designation, lignesHistoriques);
}
```

Trois requêtes séquentielles (AO de l'entreprise → sections de ces AO →
lignes chiffrées de ces sections), même style multi-étapes que
`listerBpu` dans `lib/appels-offres/queries.ts` — pas de jointure
imbriquée supabase-js, cohérent avec le reste du fichier. Filtre entreprise
explicite (`entreprise_id`) en plus de la RLS, même défense en profondeur
que le reste du fichier (ex. `obtenirAppelOffres`). Aucune écriture,
aucun `revalidatePath` — simple lecture appelée depuis le client.

## Changement 3 — Interface (`bpu-ligne-row.tsx`)

Nouveaux états locaux :

```tsx
const [suggestion, setSuggestion] = useState<SuggestionPrixBpu | null>(null);
```

Nouveau handler dédié au blur de la désignation (remplace
`onBlur={enregistrer}` sur ce champ uniquement — les autres champs
gardent `onBlur={enregistrer}`) :

```tsx
async function surBlurDesignation() {
  await enregistrer();
  if (prixUnitaire.trim().length > 0) {
    setSuggestion(null);
    return;
  }
  const resultat = await obtenirSuggestionPrixBpu(appelOffresId, designation, unite);
  setSuggestion(resultat);
}
```

`setSuggestion(null)` aussi :
- dans `onChange` du champ prix unitaire dès que l'utilisateur tape une
  valeur (la suggestion n'a plus lieu d'être une fois un prix saisi
  manuellement) ;
- au clic sur le bouton de fermeture du bandeau ;
- au clic sur « Utiliser » (après avoir rempli et sauvegardé le prix).

Bandeau, sous la ligne existante, affiché seulement si
`suggestion !== null` :

```tsx
{suggestion && (
  <TableRow>
    <TableCell colSpan={7} className="bg-muted/50 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>
          {t("suggestionPrix", {
            prix: suggestion.prixUnitaire.toLocaleString("fr-FR"),
            designationOrigine: suggestion.designationOrigine,
            aoTitre: suggestion.appelOffresTitre ?? t("suggestionPrixAoSansTitre"),
            date: new Date(suggestion.appelOffresCreatedAt).toLocaleDateString("fr-FR"),
          })}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              const prix = String(suggestion.prixUnitaire);
              setPrixUnitaire(prix);
              await enregistrer(prix);
              setSuggestion(null);
            }}
          >
            {t("suggestionPrixUtiliser")}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
            {t("suggestionPrixIgnorer")}
          </Button>
        </div>
      </div>
    </TableCell>
  </TableRow>
)}
```

`setPrixUnitaire(...)` suivi immédiatement de `enregistrer()` ne marche
pas : `enregistrer` lit `prixUnitaire` par closure, qui pointe encore sur
l'ancienne valeur tant que React n'a pas re-rendu (même piège que la
mémoire [[noubinao_functional_state_updates]]). `enregistrer` prend donc
un paramètre optionnel `prixOverride?: string`, utilisé à la place de
l'état local quand fourni, pour que le bouton « Utiliser » sauvegarde la
bonne valeur sans dépendre du timing de render :

```tsx
async function enregistrer(prixOverride?: string) {
  const input = {
    // ...
    prixUnitaire: (prixOverride ?? prixUnitaire).trim().length > 0
      ? (prixOverride ?? prixUnitaire)
      : null,
    // ...
  };
  // ...
}
```

Nouvel import :
`import { obtenirSuggestionPrixBpu } from "@/lib/appels-offres/actions";`
et le type `SuggestionPrixBpu` depuis
`@/lib/appels-offres/suggestion-prix-bpu`.

## Changement 4 — Traductions (`messages/fr.json`, `messages/en.json`)

Sous `AppelsOffres.detail.bpu` :

```json
"suggestionPrix": "Prix suggéré : {prix} FCFA ({designationOrigine} — {aoTitre}, {date})",
"suggestionPrixAoSansTitre": "AO sans titre",
"suggestionPrixUtiliser": "Utiliser",
"suggestionPrixIgnorer": "Ignorer"
```

Équivalent anglais dans `en.json` (moins prioritaire, cohérent avec la
politique de traduction progressive du projet).

## États et erreurs

- Désignation vide, ou unité vide au moment du blur : `obtenirSuggestionPrixBpu`
  retourne `null` immédiatement, aucune requête inutile.
- Aucun autre AO dans l'entreprise, ou aucune ligne chiffrée ailleurs :
  `null`, aucun bandeau — comportement identique à aujourd'hui.
- Aucune ligne historique ne partage ni l'unité ni un mot-clé : `null`.
- `prix_unitaire` déjà renseigné sur la ligne courante au moment du blur
  désignation : aucun appel réseau (court-circuité côté client), la
  suggestion ne doit jamais tenter de remplacer une valeur déjà saisie.
- Échec réseau/serveur sur `obtenirSuggestionPrixBpu` : pas de `toast`
  d'erreur (suggestion best-effort, non bloquante) — le bandeau reste
  simplement absent, comportement indiscernable d'« aucune suggestion
  trouvée ».

## Tests

- `trouverMeilleureSuggestionPrix` (TDD, nouveau fichier
  `lib/appels-offres/suggestion-prix-bpu.test.ts`) :
  - Aucun mot-clé commun entre la désignation recherchée et l'historique :
    retourne `null`.
  - Une ligne historique partage des mots-clés : elle est retournée avec
    son prix.
  - Deux lignes historiques, scores différents : la plus pertinente
    l'emporte.
  - Deux lignes à score égal, dates différentes : la plus récente
    (`appelOffresCreatedAt` le plus grand) l'emporte.
  - Désignation recherchée sans aucun mot-clé exploitable (ex. texte trop
    court, uniquement des mots vides) : retourne `null` sans exception.
  - Liste historique vide : retourne `null`.
- Aucun test sur `obtenirSuggestionPrixBpu` (Server Action, dépend de
  Supabase) ni sur `bpu-ligne-row.tsx`, cohérent avec le reste du
  fichier `actions.ts`/composants UI, jamais testés directement dans ce
  projet.

## Hors périmètre

- Persistance de la provenance (lien `ligne_bpu` → ligne d'origine) —
  éphémère assumé, voir décisions validées.
- Affichage de plusieurs suggestions classées — une seule, la meilleure.
- Vue de consultation/recherche libre dans l'historique, indépendante de
  la saisie d'une ligne — pas demandée pour ce sous-projet.
- Filtrage par statut pipeline (ex. limiter aux AO gagnés) — tout AO
  chiffré compte, à reconsidérer seulement si le signal s'avère trop
  bruité en usage réel.
- pgvector/embeddings pour un matching sémantique plus robuste aux
  synonymes — mots-clés jugés suffisants pour ce sous-projet, à
  reconsidérer seulement si jugé insuffisant sur un cas réel.
