# Pyramide de coût par ligne (BPU)

Date : 2026-09-16
Statut : approuvé par l'utilisateur, en attente de relecture finale avant plan d'implémentation.

## Contexte

Sous-projet B du chiffrage (Module 7, lacune 4 de l'ebook générique sur la
réponse aux AO — voir mémoire `noubinao_lacunes_ebook_checklist`), qui
suit le sous-projet A (bordereau des prix unitaires détaillé, livré et
mergé le 2026-09-16 — voir
`docs/superpowers/specs/2026-09-16-bpu-detaille-design.md`). L'ebook décrit
le prix de vente comme une pyramide : Déboursé Sec (main-d'œuvre directe +
fournitures + matériel) + Frais d'Études et de Structure = Coût de Revient
Total, puis + Marge Bénéficiaire = Prix de Vente HT. Le sous-projet A a
livré le bordereau (sections, lignes, prix unitaire, montants, totaux)
sans jamais expliquer *comment* le prix unitaire de chaque ligne a été
construit — c'est ce que ce sous-projet ajoute, en documentation
seulement.

## Décisions validées avec l'utilisateur

- **Le prix unitaire reste toujours saisi directement** par l'utilisateur
  (comportement du sous-projet A inchangé) — la pyramide ne remplace pas
  cette saisie, elle la **documente a posteriori**. Décision explicite :
  ne pas transformer le prix en une sortie calculée à partir de la
  pyramide, pour ne pas complexifier le flux de saisie déjà validé.
- **Répartition des 3 composantes** : l'utilisateur saisit le **déboursé
  sec** (coût direct, par unité — même base que `prix_unitaire`) et un
  **taux de frais de structure** (%) ; la **marge** (montant + %) est
  **calculée automatiquement**, jamais saisie — c'est le résidu entre le
  prix déjà connu et les deux composantes de coût.
- **Le taux de frais de structure s'applique au déboursé sec**, pas au
  prix de vente — convention BTP courante (coefficient appliqué au coût
  direct), pas un raisonnement en % du chiffre d'affaires.
- **Taux par défaut au niveau entreprise, modifiable par ligne.** Un
  réglage `entreprise.taux_frais_structure_defaut` préremplit chaque
  nouvelle ligne ; l'utilisateur peut l'écraser si un poste a des frais
  différents (ex. sous-traitance vs main-d'œuvre propre).
- **`debourse_sec` nullable**, comme `prix_unitaire` — une ligne peut être
  chiffrée sans jamais documenter sa pyramide de coût. Fonctionnalité
  strictement additive, jamais bloquante.
- **Marge négative acceptée comme valeur normale du domaine** (le prix
  saisi ne couvre pas le coût + les frais documentés) — affichée en rouge,
  jamais rejetée par la validation ou le calcul.
- **UI : ligne dépliable**, pas de colonnes supplémentaires dans la table
  du BPU (déjà à 7 colonnes et à défilement horizontal sur mobile — voir
  contrainte mobile-first de CLAUDE.md) ni de boîte de dialogue séparée.
  Un bouton sur chaque ligne déplie une sous-ligne avec les 2 champs de
  saisie et la marge calculée ; repliée par défaut, aucun changement
  visuel pour qui n'utilise pas la fonctionnalité.
- **Hors périmètre (YAGNI)** : pas d'agrégation de la pyramide au niveau
  section/total général (ex. « marge moyenne du bordereau ») — les lignes
  sans `debourse_sec` rendraient un tel total partiel et trompeur ; à
  reconsidérer seulement si un besoin réel apparaît. Pas d'extraction
  automatique de coûts depuis le DAO ou une autre source.

## Modèle de données

Migration `supabase/migrations/20260916150000_pyramide_cout_bpu.sql` :

```sql
-- Pyramide de coût par ligne (Module 7, sous-projet 4b). Documente a
-- posteriori le prix_unitaire déjà saisi (sous-projet 4a) : déboursé sec
-- et taux de frais de structure sont saisis, la marge est calculée côté
-- application (lib/appels-offres/bpu.ts), jamais stockée. Les colonnes de
-- ligne_bpu s'ajoutent à une table déjà couverte par les policies du
-- sous-projet 4a (20260916120000_bpu.sql) : rien à faire côté RLS pour
-- elles. entreprise en revanche n'avait jusqu'ici qu'une policy select —
-- nouvelle policy update ci-dessous, nécessaire pour ce sous-projet.
alter table ligne_bpu
  add column debourse_sec numeric,
  add column taux_frais_structure numeric;

alter table entreprise
  add column taux_frais_structure_defaut numeric;

-- entreprise n'a aujourd'hui qu'une policy select (entreprise_select_membres)
-- — vérifié par lecture directe de pg_policies avant d'écrire cette spec,
-- pas supposé. Sans policy update, modifierTauxFraisStructureDefaut
-- échouerait silencieusement (0 ligne affectée). with check répété
-- explicitement (leçon déjà rencontrée sur ce projet : une policy update
-- sans with check réutilise using, voir mémoire
-- noubinao_rls_with_check_gotcha).
create policy "entreprise_update_membres" on entreprise
  for update
  using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = entreprise.id and u.id = auth.uid()
    )
  );
```

Types dans `lib/appels-offres/types.ts` — `LigneBpu` s'enrichit de deux
champs (insérés après `prix_unitaire`, avant `ordre`) :

```ts
export interface LigneBpu {
  id: string;
  section_bpu_id: string;
  code_article: string | null;
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number | null;
  debourse_sec: number | null;
  taux_frais_structure: number | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}
```

Aucun type TypeScript `Entreprise` n'existe actuellement dans le projet
(vérifié — `obtenirUtilisateurCourant` ne sélectionne que
`id, entreprise_id, nom`, jamais la ligne `entreprise` complète). Ce
sous-projet n'en crée pas non plus : `obtenirTauxFraisStructureDefaut`
(voir section Intégration dans la lecture existante) retourne directement
`number | null`, sans passer par un type `Entreprise` dédié — cohérent
avec le YAGNI de ce sous-projet, à ne pas créer avant qu'un besoin réel de
manipuler la ligne `entreprise` complète apparaisse.

## Calculs (fonction pure)

Ajout dans `lib/appels-offres/bpu.ts` (fichier existant du sous-projet A,
à côté de `calculerMontantLigne`) :

```ts
type LigneAvecPyramide = Pick<
  LigneBpu,
  "prix_unitaire" | "debourse_sec" | "taux_frais_structure"
>;

export interface PyramideCout {
  fraisDeStructure: number;
  marge: number;
  margePourcentage: number;
}

export function calculerPyramideCout(
  ligne: LigneAvecPyramide,
): PyramideCout | null {
  if (ligne.prix_unitaire === null || ligne.debourse_sec === null) {
    return null;
  }
  const taux = ligne.taux_frais_structure ?? 0;
  const fraisDeStructure = ligne.debourse_sec * (taux / 100);
  const marge = ligne.prix_unitaire - ligne.debourse_sec - fraisDeStructure;
  const margePourcentage =
    ligne.prix_unitaire === 0 ? 0 : (marge / ligne.prix_unitaire) * 100;
  return { fraisDeStructure, marge, margePourcentage };
}
```

`margePourcentage` se garde explicitement contre la division par zéro
quand `prix_unitaire === 0` (cas valide : ligne « pour information », prix
nul mais déboursé sec documenté) — retourne `0` plutôt que `NaN`/`Infinity`.

**Tests** (`lib/appels-offres/bpu.test.ts`, à côté des tests existants de
`calculerMontantLigne`) — cas à couvrir :
- `prix_unitaire` et `debourse_sec` renseignés, `taux_frais_structure`
  renseigné → calcul complet correct (frais, marge, marge %).
- `debourse_sec === null` → retourne `null` (peu importe les autres
  champs).
- `prix_unitaire === null` → retourne `null`.
- `taux_frais_structure === null` → traité comme `0` (frais de structure
  nuls, marge = prix − déboursé sec).
- `taux_frais_structure === 0` (explicite, pas null) → même résultat que
  null, confirmant que `0` est une valeur valide et non confondue avec
  l'absence de taux.
- Marge négative (déboursé sec + frais > prix unitaire) → `marge < 0`,
  fonction ne lève pas d'erreur.
- `prix_unitaire === 0` avec `debourse_sec` renseigné → `margePourcentage
  === 0`, pas `NaN`.

## Validation (Zod)

`ligneBpuSchema` (existant dans `lib/appels-offres/schema.ts`) s'enrichit
de deux champs optionnels, avec la même forme que `prixUnitaire` (chaîne
nullable, vide/absente → `null`, sinon un nombre positif ou nul validé par
regex avant conversion) :

```ts
export const ligneBpuSchema = z.object({
  // ... champs existants (codeArticle, designation, unite, quantite,
  // prixUnitaire) inchangés ...
  debourseSec: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Déboursé sec invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Déboursé sec invalide",
    }),
  tauxFraisStructure: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Taux de frais de structure invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le taux doit être compris entre 0 et 100",
    }),
});
```

`tauxFraisStructure` est borné à `[0, 100]` (contrairement à
`prixUnitaire`/`debourseSec`, sans borne haute) — un taux de frais de
structure au-delà de 100% du déboursé sec n'a pas de sens métier dans ce
modèle additif.

Nouveau schéma pour le réglage entreprise, dans `lib/appels-offres/schema.ts`
(ou le fichier de schémas déjà utilisé pour les réglages entreprise s'il en
existe un distinct) :

```ts
export const tauxFraisStructureDefautSchema = z.object({
  taux: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Taux invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le taux doit être compris entre 0 et 100",
    }),
});
```

## Server Actions

`creerLigneBpu`/`modifierLigneBpu` (existantes, `lib/appels-offres/actions.ts`)
— leur paramètre `input` s'enrichit de `debourseSec: string | null` et
`tauxFraisStructure: string | null`, tous deux passés tels quels à
`ligneBpuSchema.safeParse`. Les `insert`/`update` Supabase incluent
`debourse_sec: parsed.data.debourseSec` et
`taux_frais_structure: parsed.data.tauxFraisStructure`. Aucun autre
changement de comportement (auth, `{ erreur }` sur échec, `revalidatePath`
— tout inchangé).

Nouvelle Server Action :

```ts
export async function modifierTauxFraisStructureDefaut(
  taux: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = tauxFraisStructureDefautSchema.safeParse({ taux });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Taux invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({ taux_frais_structure_defaut: parsed.data.taux })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

RLS : `entreprise` n'avait jusqu'ici qu'une policy `select`
(`entreprise_select_membres`, vérifié par lecture directe de
`pg_policies`) — la nouvelle policy `entreprise_update_membres` (voir
section Modèle de données) est un prérequis de cette Server Action, pas
une simple précaution.

## Intégration dans la lecture existante

`listerBpu` (existant, `lib/appels-offres/queries.ts`) ne change pas : il
fait déjà `select("*")` sur `ligne_bpu`, donc les deux nouvelles colonnes
remontent automatiquement une fois la migration appliquée.

Aucune requête existante ne charge la ligne `entreprise` complète
aujourd'hui : `obtenirUtilisateurCourant` (`lib/utilisateur/queries.ts`)
ne sélectionne que `id, entreprise_id, nom`, et aucune fonction
`obtenirEntreprise` n'existe. Nouvelle fonction dans
`lib/utilisateur/queries.ts` (ou un nouveau fichier
`lib/entreprise/queries.ts` si le premier ne semble pas le bon endroit au
moment de l'implémentation) :

```ts
export async function obtenirTauxFraisStructureDefaut(
  entrepriseId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("entreprise")
    .select("taux_frais_structure_defaut")
    .eq("id", entrepriseId)
    .maybeSingle();
  return data?.taux_frais_structure_defaut ?? null;
}
```

Appelée depuis `app/(app)/appels-offres/[id]/page.tsx`, ajoutée au
`Promise.all` existant, transmise en prop jusqu'à `bpu-section.tsx`
(formulaire d'ajout de ligne, qui préremplit `tauxFraisStructure` avec
cette valeur) et jusqu'à `bpu.tsx`/`appel-offres-detail.tsx` pour le
relais de prop. Même fonction réutilisée par `app/(app)/parametres/page.tsx`
pour charger la valeur initiale de `TauxFraisStructureCard`.

## Interface

**`bpu-ligne-row.tsx`** (existant, sous-projet A) :
- Un bouton chevron (icône `ChevronDown`/`ChevronRight` de `lucide-react`,
  `variant="ghost" size="sm"`, même style que les boutons ↑/↓) ajouté dans
  la cellule d'actions, avant ↑/↓/Supprimer. État local
  `const [deplie, setDeplie] = useState(false)`.
- Deux nouveaux champs d'état local : `debourseSec` et
  `tauxFraisStructure` (même patron que les 5 champs existants —
  initialisés depuis `ligne.debourse_sec`/`ligne.taux_frais_structure`,
  réinitialisés dans `reinitialiser()`, inclus dans l'objet `input` de
  `enregistrer()`).
- Quand `deplie === true`, une seconde `<TableRow>` (une seule
  `<TableCell colSpan={7}>`) rendue juste après la ligne principale,
  contenant :
  - `<Input>` Déboursé sec (`aria-label`, `onBlur={enregistrer}`, même
    style que les champs existants).
  - `<Input>` Taux de frais de structure (`aria-label`, `onBlur={enregistrer}`,
    suffixe `%` visuel à côté du champ).
  - Affichage lecture seule du résultat de `calculerPyramideCout(ligne)` :
    Frais de structure (montant), Marge (montant + pourcentage,
    `text-red-600`/équivalent thème sombre si `marge < 0`, sinon couleur
    neutre), ou `—` si la fonction retourne `null` (pas de déboursé sec
    saisi).
- Aucun `disabled` sur ces deux nouveaux `Input` pendant leur propre
  sauvegarde — même contrainte que les champs existants du sous-projet A.

**Réglages (`/parametres`)** : `app/(app)/parametres/page.tsx` ne contient
aujourd'hui qu'une carte `CompteEmailCard` — aucune carte « Entreprise »
n'existe encore. Nouvelle carte `TauxFraisStructureCard` (nouveau fichier
`app/(app)/parametres/taux-frais-structure-card.tsx`, même patron que
`compte-email-card.tsx` : Client Component recevant la valeur initiale en
prop depuis `page.tsx`), rendue sous `CompteEmailCard`. Un seul champ, un
seul `<Input>` avec `onBlur` appelant `modifierTauxFraisStructureDefaut`
directement (même patron `onBlur` que le reste du formulaire BPU), pas de
bouton « Enregistrer » séparé.

## États et erreurs

- Ligne repliée (état par défaut) : comportement strictement identique au
  sous-projet A, aucune régression visuelle pour qui n'ouvre jamais la
  pyramide.
- Ligne dépliée, `debourse_sec` vide : champs vides, section résultat
  affiche `—` pour frais de structure et marge.
- Ligne dépliée, `debourse_sec` renseigné mais `taux_frais_structure`
  vide : traité comme un taux de `0` (voir section Calculs) — résultat
  affiché normalement, pas de `—`.
- Marge négative : affichée en rouge, jamais bloquante, jamais signalée
  comme une erreur de validation (c'est une information sur la
  rentabilité de la ligne, pas une saisie invalide).
- Échec de `modifierLigneBpu` sur les nouveaux champs : même toast
  d'erreur générique et même revert ciblé (`reinitialiser()`) que pour les
  champs existants — pas de traitement spécial pour ces deux champs.
- Échec de `modifierTauxFraisStructureDefaut` : toast d'erreur, valeur du
  champ réglages revert à sa valeur précédente.

## Tests

- TDD sur `calculerPyramideCout` (voir cas listés en section Calculs).
- Pas de nouveau test sur les Server Actions ni sur les composants UI —
  cohérent avec le reste du projet (Supabase-calling code et composants
  interactifs non testés unitairement, seule la logique pure l'est).

## Hors périmètre

- Agrégation de la pyramide au niveau section/total général du BPU (voir
  décision validée ci-dessus).
- Extraction automatique de coûts depuis le DAO ou une bibliothèque de
  prix.
- Historique/audit des modifications de taux (qui a changé quoi, quand) —
  non demandé, cohérent avec l'absence d'un tel historique ailleurs dans
  le produit.
- La question du modèle de CV imposé par certains DAO, soulevée pendant le
  cadrage de ce sous-projet, est une lacune distincte (6ᵉ lacune,
  Module 4) à brainstormer séparément — non traitée ici.
