# Abonnement/quota — Phase 1 (modèle de données + compteur, sans paiement)

Date : 2026-10-12
Statut : approuvé par Sorel (brainstorming), prêt pour plan d'implémentation.

## Contexte

Dernière brique de la feuille de route "Le Cap NoubinAO" ([[noubinao_roadmap_le_cap]]). Le modèle économique (paliers Découverte/Starter/Croissance/Cabinet, CinetPay, facture annuelle) est déjà documenté dans `CLAUDE.md`, mais les prix restent une hypothèse de travail non validée avec de vrais prospects. Décision antérieure ([[noubinao_abonnement_dernier_last]]) : mode gratuit illimité pendant les tests pilotes, rien codé encore.

Ce spec couvre uniquement la **Phase 1** : poser l'objet `abonnement` et faire respecter un quota mensuel réel, sans aucune intégration de paiement. La Phase 2 (CinetPay, facture annuelle, dépassement facturé, garde-fou anti-abus palier Découverte, UI de changement de palier) est explicitement hors scope et sera un spec séparé une fois les prix validés avec de vrais prospects.

## Objectif

Permettre de faire respecter un quota d'AO traités par mois par entreprise, avec un palier par défaut (`cabinet`, quota 60) qui n'ajoute aucune friction aux pilotes actuels, tout en posant la structure de données correcte dès maintenant plutôt que de la rajouter après coup une fois la logique de pipeline en place.

## Modèle de données

Nouvelle table `abonnement`, relation 1-1 avec `entreprise` (une ligne par entreprise, clé primaire = `entreprise_id`) :

| Colonne | Type | Notes |
|---|---|---|
| `entreprise_id` | `uuid`, PK, FK → `entreprise.id` | |
| `plan` | enum `plan_abonnement` (`decouverte`, `starter`, `croissance`, `cabinet`) | |
| `quota_mensuel` | `integer` | Nombre d'AO traités autorisés par mois calendaire |
| `statut` | enum `statut_abonnement` (`actif`, `suspendu`) | Seule la valeur `actif` est utilisée en Phase 1 ; `suspendu` posé pour la Phase 2 (impayé CinetPay), jamais écrit par le code actuel |
| `date_renouvellement` | `timestamptz`, nullable | Inutilisé en Phase 1, posé pour la Phase 2 |
| `mode_facturation` | enum `mode_facturation_abonnement` (`mensuel`, `annuel`), nullable | Inutilisé en Phase 1, posé pour la Phase 2 |
| `created_at` | `timestamptz default now()` | |

**Pas de colonne compteur stockée.** L'usage du mois en cours est toujours calculé à la volée par comptage de `appel_offres`, jamais mis en cache — élimine tout besoin de job de reset mensuel (cron pg_cron ou QStash) et tout risque de dérive entre un compteur stocké et la réalité.

**Valeurs par défaut Phase 1** : `plan='cabinet'`, `quota_mensuel=60`, `statut='actif'`, `date_renouvellement=null`, `mode_facturation=null` — choisi pour ne bloquer aucun pilote actuel (60 AO/mois dépasse largement l'usage réel pendant les tests).

### Migration

- Créer les 3 enums, la table `abonnement`, les policies RLS (lecture par tout membre de l'entreprise via le helper existant `utilisateur_entreprise_id` ; aucune policy d'écriture cliente — seule une connexion `service role` ou une requête SQL directe de Sorel peut modifier une ligne).
- Backfill : insérer une ligne `abonnement` par défaut pour chaque `entreprise` existante.
- Étendre la RPC `creer_entreprise` (security definer, même patron que `rejoindre_entreprise`) pour insérer aussi la ligne `abonnement` par défaut à la création d'une nouvelle entreprise, dans la même transaction.

## Logique de quota

Nouveau module `lib/abonnement/quota.ts` :

```
compterAoTraitesCeMois(supabase, entrepriseId): Promise<number>
```
→ `count` sur `appel_offres` où `entreprise_id = X` et `created_at >= début du mois calendaire courant (UTC)`.

```
verifierQuotaDisponible(supabase, entrepriseId): Promise<{ autorise: boolean; utilise: number; quota: number }>
```
→ lit `abonnement.quota_mensuel`, appelle `compterAoTraitesCeMois`, compare.

### Point d'application

Dans la Server Action d'upload de DAO (`lib/appels-offres/actions.ts`, avant l'insertion de la ligne `appel_offres`) : appeler `verifierQuotaDisponible`. Si `autorise === false`, retourner immédiatement `{ erreur: "Quota mensuel atteint (X/Y AO traités), contactez-nous pour augmenter votre palier." }` sans insérer ni toucher au stockage.

**Limite connue acceptée** : deux uploads strictement concurrents de la même entreprise pourraient tous deux passer la vérification avant qu'aucun des deux ne soit compté (pas de verrou transactionnel). Risque négligeable à l'échelle pilote actuelle (quelques entreprises, usage non simultané en pratique) — à durcir seulement si ça devient un problème réel.

## Interface

Nouvelle carte `AbonnementCard` dans `/parametres`, à côté de `EquipeCard`/`profil-entreprise-card` :
- Lecture seule, visible par tous les membres (pas admin-only — c'est de l'information, pas une action).
- Affiche : libellé du palier (traduit via i18n) + "X/Y AO traités ce mois".
- Aucun bouton de changement de palier (SQL direct par Sorel en Phase 1).

## Hors scope (Phase 2, spec séparé)

- Intégration CinetPay (prélèvement mensuel, Wave/Orange Money/MTN MoMo/carte).
- Facture annuelle par virement.
- Dépassement facturé à l'AO supplémentaire au lieu d'un blocage.
- Garde-fou anti-abus sur le palier Découverte (vérification RCCM/domaine email).
- UI de changement de palier en self-service.
- Statuts `suspendu`, `date_renouvellement`, `mode_facturation` : colonnes posées mais non exploitées par aucun code avant la Phase 2.

## Tests

- `lib/abonnement/quota.test.ts` : `compterAoTraitesCeMois` (filtre correct par mois calendaire, entreprise isolée), `verifierQuotaDisponible` (autorisé sous quota, refusé à quota atteint, limite exacte au dernier AO autorisé).
- Test d'intégration léger sur la Server Action d'upload : quota atteint → pas d'insertion `appel_offres`, message d'erreur renvoyé.
- Vérification RLS : un membre ne peut pas écrire sur `abonnement` (policy refuse l'insert/update direct depuis le client).
