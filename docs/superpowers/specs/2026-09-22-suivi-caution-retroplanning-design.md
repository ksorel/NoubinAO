# Suivi de la caution de soumission comme tâche

Date : 2026-09-22
Statut : approuvé par l'utilisateur.

## Contexte

Priorité P1 de la feuille de route stratégique (artefact "Le Cap
NoubinAO", tier P1 — « ce qui fait gagner, pas seulement soumettre »).

`appel_offres.montant_caution` (nullable number) est déjà capturé — un
champ simple dans le formulaire de la vue d'ensemble AO
(`app/(app)/appels-offres/[id]/appel-offres-detail.tsx`, champ
`montantCaution`). Mais rien ne suit la démarche pour l'obtenir
(garantie bancaire, dépôt) — une démarche avec son propre délai, souvent
sous-estimé, distinct du calendrier de préparation du dossier.

Le module Rétroplanning existe déjà et fonctionne :
`genererJalonsParDefaut(dateLimite, maintenant)`
(`lib/appels-offres/retroplanning.ts`) génère 5 jalons proportionnels
par défaut (Analyse Go/No-Go à 10 %, Constitution du dossier à 40 %,
Revue interne à 65 %, Relecture finale à 85 %, Dépôt à J-1) sur clic
explicite d'un bouton (`genererJalonsRetroplanning`,
`lib/appels-offres/actions.ts:705-742`) — aucun jalon caution
aujourd'hui. La table `jalon_retroplanning`
(`lib/appels-offres/types.ts:131-141`) porte déjà tout ce qu'il faut :
`libelle`, `date_cible`, `coche` (booléen), `ordre`, `coche_par`,
`coche_le`, `created_by`. Un jalon peut aussi être créé manuellement
(Server Action `creerJalon`, `lib/appels-offres/actions.ts:744+`) en
plus des jalons par défaut générés en lot.

## Décisions validées avec l'utilisateur

- **Statut simple coché/décoché**, pas de cycle de vie à plusieurs
  étapes (demandée → obtenue). Réutilise exactement le mécanisme
  existant — zéro nouveau modèle de données, cohérent avec YAGNI et
  avec le fait qu'aucun autre jalon du module n'a de statut plus riche.
- **Génération automatique, conditionnelle** : le jalon caution
  s'ajoute aux jalons par défaut **uniquement si `montant_caution` est
  déjà renseigné** au moment du clic sur "Générer le rétroplanning" —
  jamais un jalon caution sur un AO sans montant de caution connu.
- **Position par défaut : tôt, à la même fraction que l'analyse
  Go/No-Go (10 %)**, juste après elle dans l'ordre d'affichage — la
  démarche bancaire pour obtenir une garantie prend souvent plusieurs
  jours, elle doit démarrer dès la décision de répondre, en parallèle
  de la constitution du dossier, pas attendre la fin du délai.
- **Pas de régénération/automatisation rétroactive** : si
  `montant_caution` est renseigné *après* que les jalons par défaut ont
  déjà été générés, l'utilisateur ajoute le jalon caution lui-même via
  le mécanisme manuel déjà existant (`creerJalon`) — comme n'importe
  quel jalon personnalisé. Pas de déclencheur automatique à la
  sauvegarde du montant.
- **Aucun changement d'interface** : `Retroplanning`
  (`app/(app)/appels-offres/[id]/retroplanning.tsx`) affiche déjà tout
  jalon renvoyé par `genererJalonsRetroplanning`, peu importe son
  origine — le nouveau jalon apparaît automatiquement, coché/décoché et
  réordonnable comme les autres.
- **Jamais bloquant** — cohérent avec Go/No-Go et la Checklist de
  soumission : un jalon caution non coché n'empêche ni la préparation
  du dossier ni l'export.

## Modèle de données

Aucun changement de schéma. `jalon_retroplanning` (créée au sous-projet
Rétroplanning) est réutilisée sans modification.

## Changement 1 — `lib/appels-offres/retroplanning.ts`

`genererJalonsParDefaut` gagne un 3ᵉ paramètre optionnel
`montantCaution?: number | null` :

```ts
export function genererJalonsParDefaut(
  dateLimite: Date,
  maintenant: Date = new Date(),
  montantCaution?: number | null,
): JalonGenere[] {
  const dureeMs = dateLimite.getTime() - maintenant.getTime();

  const jalons = PHASES_PROPORTIONNELLES.map(({ libelle, fraction }) => ({
    libelle,
    dateCible: formatDateISO(new Date(maintenant.getTime() + fraction * dureeMs)),
  }));

  // Insérée juste après l'analyse Go/No-Go (même fraction, 10 %) : la
  // démarche bancaire pour obtenir la garantie prend souvent plusieurs
  // jours, elle doit démarrer dès la décision de répondre, pas attendre.
  // Générée seulement si un montant de caution est déjà connu — aucun
  // jalon caution sur un AO qui n'en a pas (ou pas encore).
  if (montantCaution !== null && montantCaution !== undefined && montantCaution > 0) {
    jalons.splice(1, 0, {
      libelle: "Obtenir la caution de soumission",
      dateCible: formatDateISO(new Date(maintenant.getTime() + 0.1 * dureeMs)),
    });
  }

  jalons.push({
    libelle: "Dépôt du dossier",
    dateCible: formatDateISO(new Date(dateLimite.getTime() - JOUR_MS)),
  });

  return jalons;
}
```

(`jalons.splice(1, 0, ...)` insère juste après "Analyse du DAO et
décision Go/No-Go", qui reste toujours le premier élément de
`PHASES_PROPORTIONNELLES`.)

## Changement 2 — `lib/appels-offres/actions.ts`

`genererJalonsRetroplanning` (lignes 705-742) sélectionne aussi
`montant_caution` et le transmet :

Avant :

```ts
  const { data: appelOffres, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("date_limite")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (erreurLecture || !appelOffres) return { erreur: "Appel d'offres introuvable." };
  if (!appelOffres.date_limite) return { erreur: "Date limite non renseignée." };

  const jalons = genererJalonsParDefaut(new Date(appelOffres.date_limite));
```

Après :

```ts
  const { data: appelOffres, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("date_limite, montant_caution")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (erreurLecture || !appelOffres) return { erreur: "Appel d'offres introuvable." };
  if (!appelOffres.date_limite) return { erreur: "Date limite non renseignée." };

  const jalons = genererJalonsParDefaut(
    new Date(appelOffres.date_limite),
    new Date(),
    appelOffres.montant_caution,
  );
```

## Interface

Aucun changement. `Retroplanning` et sa Server Action de rendu
consomment déjà la liste de jalons telle qu'elle revient de la base —
le jalon caution, quand il existe, s'affiche, se coche/décoche et se
réordonne exactement comme les 5 autres.

## États et erreurs

- **Montant de caution non renseigné à la génération** : aucun jalon
  caution créé, comportement strictement identique à aujourd'hui.
- **Montant renseigné après coup** : aucun rattrapage automatique —
  ajout manuel via `creerJalon`, déjà disponible dans l'UI.
- **Régénération** (si l'utilisateur re-clique "Générer le
  rétroplanning" sur un AO qui a déjà des jalons) : comportement
  hérité, inchangé par ce sous-projet — hors périmètre d'y toucher ici.

## Tests

- `genererJalonsParDefaut` (TDD, `lib/appels-offres/retroplanning.test.ts`) :
  - Avec `montantCaution` positif : le jalon "Obtenir la caution de
    soumission" est présent, en 2ᵉ position (juste après l'analyse
    Go/No-Go), à la même date cible que celle-ci (fraction 0.1).
  - Avec `montantCaution` à `null`, `undefined`, ou `0` : comportement
    identique à l'appel sans 3ᵉ argument — aucun jalon caution, mêmes 5
    jalons qu'aujourd'hui.
  - Régression : les tests existants (appel à 2 arguments, sans 3ᵉ)
    continuent de passer tels quels — paramètre strictement additif et
    optionnel.
- Aucun test sur la Server Action ni sur l'UI, cohérent avec le reste
  du module Rétroplanning.

## Hors périmètre

- Statut multi-étapes de la caution (demandée/obtenue/restituée).
- Régénération/rattrapage automatique si le montant est renseigné après
  la génération initiale des jalons.
- Tout changement au comportement de régénération des jalons par
  défaut sur un AO qui en a déjà.
- Rappel/notification à l'approche de ce jalon — hors périmètre de ce
  sous-projet (rejoint le gap P2 "Notifications proactives" de la
  feuille de route, non traité ici).
