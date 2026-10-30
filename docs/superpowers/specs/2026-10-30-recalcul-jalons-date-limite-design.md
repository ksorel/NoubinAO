# Recalcul automatique des jalons du rétroplanning à la modification de la date limite

Date : 2026-10-30
Statut : approuvé par Sorel (brainstorming), prêt pour plan d'implémentation.

## Contexte

La date limite de dépôt d'un AO peut être reportée après extraction initiale (addendum, décalage acheteur, erreur de saisie). Aujourd'hui, modifier et enregistrer `date_limite` dans l'onglet Radar (`modifierAppelOffres`, `lib/appels-offres/actions.ts`) met à jour uniquement la colonne `appel_offres.date_limite` — aucune répercussion ailleurs.

Recherche faite en amont du brainstorming : la plupart des endroits qui affichent une information dérivée de `date_limite` la recalculent déjà en direct à chaque rendu (contrôle croisé "validité des pièces" dans `appel-offres-detail.tsx`, badge d'échéance du pipeline) — rien à faire là, ils restent corrects automatiquement. Le seul endroit identifié avec un **état dérivé stocké et figé** est `jalon_retroplanning` : ses dates (`date_cible`) sont calculées une fois, au moment où l'utilisateur clique "Générer le rétroplanning" (`genererJalonsRetroplanning`), puis jamais revues. Un report de la date limite laisse ces dates fausses jusqu'à ce que l'utilisateur régénère tout manuellement — ce qui écraserait aussi les jalons ajoutés à la main et perdrait l'état "coché" des jalons déjà traités.

## Objectif

Quand `date_limite` change et est enregistrée, recalculer automatiquement la position des jalons **système** (les 6 jalons générés par `genererJalonsParDefaut`) qui ne sont pas encore cochés, sans jamais toucher aux jalons ajoutés manuellement par l'utilisateur ni aux jalons déjà cochés (marqués faits).

## Identification des jalons système (sans migration)

Pas de nouvelle colonne pour distinguer "généré par le système" / "ajouté à la main" : `jalon_retroplanning` n'a aujourd'hui aucun discriminant, et `creerJalon` (ajout manuel) comme `genererJalonsRetroplanning` (génération initiale) insèrent dans la même table sans marqueur. Ajouter une colonne serait la solution robuste mais plus lourde qu'un recalcul par libellé — jugé disproportionné : les 6 libellés système forment un ensemble fermé et stable (déjà la seule source de vérité utilisée par `genererJalonsParDefaut`).

Un jalon est "système" si son `libelle` correspond **exactement** à l'un des 6 suivants :
- "Analyse du DAO et décision Go/No-Go"
- "Obtenir la caution de soumission"
- "Constitution du dossier (pièces, mapping, rédaction)"
- "Revue interne de l'offre"
- "Relecture finale et vérifications"
- "Dépôt du dossier"

Risque accepté : un utilisateur qui renomme un jalon ajouté à la main avec l'un de ces libellés exacts le ferait entrer par erreur dans le recalcul automatique. Négligeable (coïncidence peu probable) et sans conséquence grave (au pire, une date de jalon personnalisé se retrouve recalculée une fois).

## Refactor de `retroplanning.ts` (source de vérité unique)

`genererJalonsParDefaut` encode aujourd'hui les fractions (0.1 / 0.4 / 0.65 / 0.85, caution à 0.1, dépôt à `date_limite - 1 jour`) directement dans son corps. Pour que génération initiale et recalcul ne puissent jamais diverger, extraire une structure partagée :

```ts
interface RegleJalonSysteme {
  libelle: string;
  calculerDate: (dateLimite: Date, maintenant: Date) => Date;
}
```

`PHASES_PROPORTIONNELLES` et le jalon "Dépôt du dossier" deviennent des entrées de cette liste (le jalon caution reste conditionnel à `montantCaution`, géré à part comme aujourd'hui). `genererJalonsParDefaut` et la nouvelle fonction de recalcul consomment toutes les deux cette même liste.

## Nouvelle fonction de recalcul

```ts
export function recalculerDatesJalonsSysteme(
  jalonsExistants: { id: string; libelle: string; coche: boolean }[],
  nouvelleDateLimite: Date,
  maintenant: Date,
  montantCaution: number | null,
): { id: string; nouvelleDateCible: string }[]
```

Pour chaque jalon existant non coché dont le `libelle` correspond à une règle système : calcule la nouvelle `date_cible` via `calculerDate(nouvelleDateLimite, maintenant)`. Le jalon caution n'est recalculé que s'il existe déjà (jamais ajouté rétroactivement ici — si `montant_caution` passe de vide à renseigné, ça reste le rôle de la génération initiale, pas de ce recalcul). Retourne la liste des `{id, nouvelleDateCible}` à appliquer ; ne modifie rien elle-même (fonction pure, testable sans DB).

## Branchement dans `modifierAppelOffres`

Dans `lib/appels-offres/actions.ts`, avant l'update de `appel_offres` :
1. Lire la `date_limite` actuelle en base (`select date_limite from appel_offres where id = ...`).
2. Procéder à l'update comme aujourd'hui.
3. Si l'update réussit, que `dateLimiteIso !== null`, et que `dateLimiteIso` diffère de l'ancienne valeur lue à l'étape 1 : charger les jalons existants de cet AO (`id, libelle, coche`) depuis `jalon_retroplanning`, appeler `recalculerDatesJalonsSysteme`, et appliquer les mises à jour retournées (une requête `update` par jalon concerné, ou un `upsert` ciblé — pas de nouvelle requête si la liste retournée est vide, ni si aucun jalon n'existe encore pour cet AO).
4. `revalidatePath` déjà appelé en fin de fonction couvre l'affichage mis à jour — aucun changement requis côté UI.

Si l'update de `appel_offres` échoue, aucun recalcul n'est tenté (comportement déjà garanti par l'ordre séquentiel : le recalcul est après le `if (error) return`).

## Hors scope

- Aucune migration de schéma (pas de colonne "origine" sur `jalon_retroplanning`).
- Pas de génération rétroactive du jalon caution si `montant_caution` est renseigné après coup sans que le jalon caution n'existe déjà.
- Pas de notification ni de bandeau visuel annonçant le recalcul — le tableau des jalons se met simplement à jour au rechargement de la page, comme pour toute autre modification du formulaire Radar.
- Aucun changement aux autres endroits qui dépendent de `date_limite` (déjà corrects, recalculés en direct).

## Tests

- `retroplanning.test.ts` : `recalculerDatesJalonsSysteme` — jalon système non coché recalculé à la bonne fraction de la nouvelle date ; jalon système coché jamais modifié ; jalon à libellé non reconnu (ajouté à la main) jamais modifié ; jalon caution recalculé seulement s'il existe déjà parmi les jalons existants ; liste vide en entrée → liste vide en sortie ; régression — `genererJalonsParDefaut` produit toujours les mêmes dates qu'avant le refactor (mêmes fractions, via la structure partagée).
- Test d'intégration léger sur `modifierAppelOffres` (ou vérification manuelle) : changer `date_limite` sur un AO avec des jalons déjà générés, dont un coché et un ajouté à la main → seuls les jalons système non cochés voient leur date changer.
