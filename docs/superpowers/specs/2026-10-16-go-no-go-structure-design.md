# Fiche Go/No-Go structurée — design

Date : 2026-10-16
Remplace : Module 7 sous-projet 2 (évaluation Go/No-Go à 3 critères qualitatifs).
Inchangé : synthèse IA Go/No-Go (`QuestionnaireGoNoGo`), simplement déplacée dans l'onglet.
Source : `Fiche_GO_NO_GO_Appel_Offres.xlsx` fournie par Sorel (4 onglets : Mode d'emploi, Fiche, Exemple, Paramètres).

## Problème

`evaluation_go_no_go` (livré 2026-09-15) capture 3 critères qualitatifs (juridique/faisabilité/rentabilité, oui/non/à évaluer) + note libre, verdict calculé. Trop pauvre : aucune question administrative structurée, aucun calcul financier, aucune note chiffrée, rien de paramétrable par type de marché. La fiche Excel de Sorel, utilisée en réalité pour les décisions Go/No-Go, est bien plus complète et doit devenir la référence du produit.

Tension identifiée avec Sorel en amont : la fiche Excel se présente comme un outil "avant achat du DAO" (`Mode d'emploi` : *"décider... avant d'acheter le DAO"*), mais plusieurs de ses champs (personnel clé exigé, matériel minimum exigé, CA moyen exigé, nombre de références exigé) ne sont normalement connus qu'une fois le DAO complet (IS/DPAO) acheté et lu. Résolu ci-dessous par un flux unique utilisable aux deux moments plutôt que deux fiches séparées.

## Décisions de cadrage (validées avec Sorel)

- **Remplace, ne coexiste pas** avec `evaluation_go_no_go`/`GoNoGo` (3 critères). `QuestionnaireGoNoGo` (synthèse IA, 6 questions fixes, inchangé) reste et sert d'aide à répondre aux nouvelles questions.
- **"Type de marché" est un concept propre au Go/No-Go, distinct de `secteur` (texte libre sur `appel_offres`) et de `SECTEURS_CIBLES`** (`lib/veille/classification-secteur.ts` — btp/ingenierie/environnement/energie_climat, garde-fou de ciblage commercial CLAUDE.md, **ne pas toucher**). Le type de marché Go/No-Go est un outil de scoring interne, géré par l'entreprise, qui peut inclure des types hors ciblage commercial (IT/Informatique, Agro-industrie) sans que ça élargisse le positionnement produit.
- **Liste de types de marché entièrement gérée par l'entreprise** (CRUD), seedée par défaut à la création de l'entreprise avec : BTP/Travaux, Ingénierie/Études, Environnement, Énergie-climat, IT/Informatique, Agro-industrie.
- **Un seul flux Go/No-Go, pas deux fiches.** La même fiche est accessible dès que l'AO existe (y compris avant achat/upload du DAO, cas `fichier_dao_path is null` créé via "Importer" depuis la veille). Les champs non connaissables à ce stade restent simplement vides. Le libellé de la décision finale s'adapte à l'étape (voir plus bas), le reste de la logique est identique.
- **Décision jamais stockée, toujours recalculée** à l'affichage à partir des champs saisis — même principe que `calculerVerdictGoNoGo` aujourd'hui. Pas de colonne `decision`.
- **Pas de champs "Décidé par"/"Date" façon signature papier** (B63/B64 du xls) : `modifie_par`/`modifie_le` (déjà le pattern `evaluation_go_no_go`) jouent ce rôle en continu, pas besoin d'un geste de signature séparé dans cette spec (export/impression avec entête entreprise = sujet séparé, hors scope ici, cf. décision explicite avec Sorel).
- **Export/impression de la fiche (logo, entête, pied de page) : hors scope de cette spec.** Sujet traité séparément (logo entreprise réutilisable sur tous les exports).
- **Auto-suggestion limitée et jamais silencieuse** : seules 2 des 5 questions administratives (agrément, attestations à jour) et le montant de caution sont pré-remplis/suggérés depuis des données déjà en base, toujours comme suggestion modifiable, jamais comme réponse figée — cohérent avec la règle CLAUDE.md de ne jamais laisser une affirmation sans source vérifiable par l'utilisateur.
- **Impact pipeline** : décision "NO GO" ou "NE PAS ACHETER" propose de marquer l'AO `sans_suite` (valeur déjà existante dans `STATUTS_PIPELINE_AO`, aucune migration d'enum nécessaire).

## Modèle de données

### Nouvelles tables

```sql
create table type_marche_go_no_go (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  nom text not null,
  actif boolean not null default true,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

create table question_go_no_go (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  -- null = question générique (administratif ou ouverture_marche) ;
  -- non-null = savoir-faire liée à ce type de marché précis.
  type_marche_id uuid references type_marche_go_no_go(id) on delete cascade,
  categorie text not null check (categorie in ('administratif', 'savoir_faire', 'ouverture_marche')),
  texte text not null,
  ordre integer not null default 0,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  constraint question_go_no_go_type_marche_coherent check (
    (categorie = 'savoir_faire' and type_marche_id is not null)
    or (categorie <> 'savoir_faire' and type_marche_id is null)
  )
);

create table parametre_go_no_go (
  entreprise_id uuid primary key references entreprise(id) on delete cascade,
  note_min_go numeric not null default 14 check (note_min_go >= 0 and note_min_go <= 20),
  marge_min_visee numeric not null default 0.15 check (marge_min_visee >= 0 and marge_min_visee <= 1)
);

create table go_no_go (
  id uuid primary key default gen_random_uuid(),
  appel_offres_id uuid not null unique references appel_offres(id) on delete cascade,
  type_marche_id uuid references type_marche_go_no_go(id) on delete set null,
  -- Section B — montants et pourcentages, tous nullables (saisie progressive)
  montant_marche_estime numeric,
  cout_total_realisation numeric,
  prix_dao numeric,
  caution_soumission numeric,
  frais_preparation numeric,
  avance_pourcentage numeric check (avance_pourcentage is null or (avance_pourcentage >= 0 and avance_pourcentage <= 1)),
  delai_paiement_jours integer,
  argent_disponible_banque numeric,
  -- Section C — notes manuelles (les 2 notes auto ne sont jamais stockées, recalculées)
  note_interet_strategique integer check (note_interet_strategique is null or (note_interet_strategique between 0 and 4)),
  note_client_paie integer check (note_client_paie is null or (note_client_paie between 0 and 3)),
  note_concurrence integer check (note_concurrence is null or (note_concurrence between 0 and 2)),
  note_risques integer check (note_risques is null or (note_risques between 0 and 3)),
  commentaire_global text,
  modifie_par uuid references utilisateur(id) on delete set null,
  modifie_le timestamptz not null default now()
);

create table reponse_go_no_go (
  id uuid primary key default gen_random_uuid(),
  go_no_go_id uuid not null references go_no_go(id) on delete cascade,
  question_id uuid not null references question_go_no_go(id) on delete cascade,
  -- Snapshot du texte au moment de la réponse : traçabilité même si la
  -- question catalogue est renommée/désactivée après coup (même raisonnement
  -- que `source_section` sur exigence_ao).
  texte_question_snapshot text not null,
  reponse text not null check (reponse in ('oui', 'non', 'a_confirmer')),
  commentaire text,
  modifie_le timestamptz not null default now(),
  unique (go_no_go_id, question_id)
);
```

### RLS

Pattern actuel (post multi-entreprise, `est_membre_entreprise`/`est_admin_entreprise` — **pas** le join `utilisateur.id = auth.uid()` devenu faux depuis `20261013150000_utilisateur_auth_id.sql`, cf. `noubinao_multi_entreprise_par_utilisateur`).

- `type_marche_go_no_go`, `question_go_no_go`, `parametre_go_no_go` : `select` via `est_membre_entreprise(entreprise_id)` ; `insert`/`update`/`delete` via `est_membre_entreprise(entreprise_id) and est_admin_entreprise(entreprise_id)` — ce sont des écrans de paramétrage, même garde-fou que `invitation_equipe_insert_admin`.
- `go_no_go`, `reponse_go_no_go` : tout membre peut lire/écrire (comme `evaluation_go_no_go` aujourd'hui, pas de restriction admin — remplir la fiche n'est pas une action de configuration). `select`/`insert` via `exists (select 1 from appel_offres ao where ao.id = go_no_go.appel_offres_id and est_membre_entreprise(ao.entreprise_id))` ; `update` avec le même `using`, et un `with check` qui fixe en plus `modifie_par = auth.uid()`-équivalent (`modifie_par in (select id from utilisateur where auth_id = auth.uid())`) et interdit la réécriture de `appel_offres_id` vers une autre entreprise (même leçon que `evaluation_go_no_go_update_membres`).

### Seed par défaut (à la création d'une entreprise)

6 types de marché (BTP/Travaux, Ingénierie/Études, Environnement, Énergie-climat, IT/Informatique, Agro-industrie) + les 10 questions génériques de la fiche xls (5 administratif, 1 ouverture_marché) + 4 questions savoir-faire par type de marché (24 lignes, textes adaptés par domaine — BTP/Ingénierie/Environnement/Énergie reprennent le texte xls existant ; IT/Informatique reprend le texte déjà utilisé dans `QuestionnaireGoNoGo`/l'onglet Exemple xls ; Agro-industrie à rédiger). Même mécanisme que le seed déjà fait pour `abonnement` à la création entreprise (`creer_entreprise`) — insertion dans la même fonction/transaction, pas un job séparé.

### Suppression

`evaluation_go_no_go` (table + policies) : migration `drop table evaluation_go_no_go` après confirmation qu'aucune donnée pilote n'a de valeur à migrer (3 critères qualitatifs ne mappent pas proprement vers la nouvelle structure — à vérifier avec Sorel avant la migration de suppression, pas supposé automatiquement).

## Calculs et logique de décision (`lib/appels-offres/go-no-go.ts`, remplace le fichier actuel)

Pure functions, zéro I/O, testées Vitest (TDD, même approche que `calculerVerdictGoNoGo` existant) :

```ts
function calculerSectionB(montants: MontantsGoNoGo): ResultatsSectionB {
  const coutPourRepondre = (montants.prixDao ?? 0) + (montants.cautionSoumission ?? 0) + (montants.fraisPreparation ?? 0);
  const beneficeEstime = (montants.montantMarcheEstime ?? 0) - (montants.coutTotalRealisation ?? 0);
  const margeEstimee = (montants.montantMarcheEstime ?? 0) === 0 ? 0 : beneficeEstime / montants.montantMarcheEstime!;
  const avanceRecue = (montants.montantMarcheEstime ?? 0) * (montants.avancePourcentage ?? 0);
  const argentAAvancer = Math.max(0, (montants.coutTotalRealisation ?? 0) - avanceRecue + (montants.cautionSoumission ?? 0));
  const couverture = argentAAvancer === 0 ? 1 : (montants.argentDisponibleBanque ?? 0) / argentAAvancer;
  const moisATenir = (montants.delaiPaiementJours ?? 0) / 30;
  return { coutPourRepondre, beneficeEstime, margeEstimee, avanceRecue, argentAAvancer, couverture, moisATenir };
}

function noteMargeAuto(margeEstimee: number, margeMinVisee: number): number {
  if (margeEstimee >= 0.25) return 4;
  if (margeEstimee >= margeMinVisee) return 3;
  if (margeEstimee >= 0.10) return 2;
  if (margeEstimee >= 0.05) return 1;
  return 0;
}

function noteTresorerieAuto(couverture: number): number {
  if (couverture >= 1) return 4;
  if (couverture >= 0.75) return 3;
  if (couverture >= 0.5) return 2;
  if (couverture >= 0.3) return 1;
  return 0;
}

type DecisionGoNoGo = "go" | "no_go" | "a_completer";

function calculerDecision(params: {
  nombreNon: number;
  questionsNonRepondues: number;
  champsVides: number;
  noteTotale: number;
  noteMinGo: number;
}): DecisionGoNoGo {
  if (params.nombreNon > 0) return "no_go";
  if (params.questionsNonRepondues > 0 || params.champsVides > 0) return "a_completer";
  return params.noteTotale >= params.noteMinGo ? "go" : "no_go";
}
```

Le libellé affiché (`"GO — on répond"` / `"ACHETER LE DAO"`, etc.) est une responsabilité de l'UI/i18n, choisi selon `appelOffres.fichier_dao_path === null`, pas de `calculerDecision`, qui reste agnostique de l'étape pré/post-achat.

`questionsNonRepondues` compte les questions actives pour l'entreprise et le type de marché choisi (générique + savoir-faire du type sélectionné) sans réponse `oui`/`non` enregistrée (`a_confirmer` compte comme non-répondue, cohérent avec le sens du mot). Si `type_marche_id` est `null` sur `go_no_go`, les questions savoir-faire ne sont pas affichées et comptent comme non-répondues (bloque sur "À compléter" tant que le type de marché n'est pas choisi — cohérent avec le xls où la colonne B19/B20/B21/B22 dépend de `C8`).

## Flux UI — page détail AO

Nouvel onglet dédié, 2e position :

```
Vue d'ensemble → Go/No-Go → Offre technique → Offre financière
```

`GoNoGo` (composant actuel, 3 critères) et son action `mettreAJourEvaluationGoNoGo` sont supprimés. Nouveau composant `app/(app)/appels-offres/[id]/go-no-go.tsx` (remplace l'actuel), contenu de haut en bas :

1. Sélecteur type de marché (`Select`, options = `type_marche_go_no_go` actifs de l'entreprise).
2. `QuestionnaireGoNoGo` (déplacé depuis `vue-ensemble`, inchangé) — aide à répondre.
3. Section A : 3 groupes de questions (administratif / savoir-faire du type choisi / ouverture marché), chaque ligne = `Select` oui/non/à confirmer + `Textarea` commentaire optionnel. Compteurs "Nombre de NON" et "Questions non répondues" affichés comme dans le xls.
4. Section B : 8 `Input` montants/pourcentages/jours, résultats calculés affichés en lecture seule juste en dessous (pas de bouton "Calculer" — recalcul à chaque frappe, comme les formules Excel).
5. Section C : 2 notes auto affichées en lecture seule + 4 `Select`/`Input` manuels avec le barème en `title`/texte d'aide (repris du xls). Total /20.
6. Bandeau décision finale (couleur verte/rouge/orange), texte adapté à l'étape, bouton "Marquer sans suite" si NO GO/NE PAS ACHETER.

Sauvegarde : un seul bouton "Enregistrer" en bas de l'onglet (comme l'actuel `GoNoGo`), pas d'autosave par champ — cohérent avec le reste de la fiche détail (`onSubmit` du formulaire principal fonctionne pareil).

## Auto-préremplissage / suggestions

- Caution de soumission ← `appel_offres.montant_caution` (déjà extrait module 3), pré-rempli à la création de `go_no_go`, reste modifiable.
- Question "agrément/qualification exigée" et "attestations à jour" (impôts/CNPS/RCCM) : suggestion `oui`/`non` calculée en cherchant dans la bibliothèque documentaire un `document` du type correspondant avec `statut_validite` valide et `date_expiration` non dépassée. Affiché comme badge "Suggéré : OUI/NON" à côté du `Select`, jamais pré-sélectionné automatiquement — l'utilisateur choisit toujours explicitement.
- Toutes les autres questions et tous les autres montants : saisie manuelle en V1. Automatiser le reste demanderait une extraction DAO de seuils précis (CA minimum exigé, nombre de références exigé, avance %, délai de paiement) non garantie aujourd'hui par le module 3 — noté comme piste V2 si le besoin est confirmé en usage pilote, pas construit par anticipation.

## i18n

Nouvelles clés `AppelsOffres.detail.goNoGo.*` (remplace l'actuel namespace du même nom) : titre onglet, sélecteur type de marché, libellés des 3 groupes de questions, labels section B/C, textes d'aide barème, libellés décision (les 2 variantes pré/post-achat), bouton "Marquer sans suite". Nouvelle page `Parametres.goNoGo.*` pour l'écran de paramétrage (types de marché, questions, seuils).

## Écran de paramétrage (`/parametres`)

Nouvelle carte "Go/No-Go" sur la page `/parametres` existante (même pattern que `taux-frais-structure-card.tsx`) : 2 champs (`note_min_go`, `marge_min_visee`) + lien vers une sous-page `/parametres/go-no-go` listant les types de marché (CRUD) et, par type sélectionné, ses questions savoir-faire (CRUD). Les 5 questions administratives et la question d'ouverture de marché sont éditables aussi (texte seulement, pas de suppression — au moins 1 question par catégorie générique requise, contrainte applicative pas SQL).

## Hors scope (confirmé)

- Export/impression PDF de la fiche, logo et entête/pied de page entreprise — spec séparée.
- Automatisation des questions savoir-faire et des montants autres que la caution.
- Dashboard d'agrégation des décisions Go/No-Go (taux GO/NO GO par secteur, etc.).
- Migration des données `evaluation_go_no_go` existantes vers la nouvelle structure.
- Modification de `SECTEURS_CIBLES`/filtre veille — aucun lien avec le ciblage commercial.

## Tests

- Unitaires (Vitest) : `calculerSectionB` (cas limites montant marché = 0, argent à avancer négatif ramené à 0, délai paiement = 0), `noteMargeAuto`/`noteTresorerieAuto` (bornes de chaque palier), `calculerDecision` (priorité NON > non-répondu/vide > note), schéma zod des nouvelles server actions (montants négatifs refusés, pourcentages hors [0,1] refusés, notes hors barème refusées).
- Vérification manuelle navigateur : créer un AO sans DAO (import veille) → remplir fiche partiellement → vérifier libellé "ACHETER LE DAO" / "À COMPLÉTER" ; uploader le DAO → vérifier que la caution se pré-remplit et que le libellé bascule vers "GO — on répond" / "NO GO" ; changer le type de marché → vérifier que les questions savoir-faire changent et que les réponses de l'ancien type restent en base mais disparaissent de l'écran ; répondre NON à une question administrative → vérifier verdict NO GO immédiat même note/20 élevée ; depuis `/parametres/go-no-go`, désactiver un type de marché utilisé par un AO existant → vérifier que la fiche de cet AO continue de l'afficher (pas de perte de contexte sur une fiche déjà remplie).
