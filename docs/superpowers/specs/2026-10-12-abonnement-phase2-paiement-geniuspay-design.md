# Abonnement Phase 2 — paiement mensuel GeniusPay

Date : 2026-10-12
Statut : approuvé par Sorel (brainstorming), prêt pour plan d'implémentation.

## Contexte

Phase 1 ([[noubinao_abonnement_phase1_livree]]) a livré le modèle de données `abonnement` et un quota mensuel réellement appliqué (gate à l'upload de DAO), sans aucun paiement — toute entreprise reste par défaut sur `plan='cabinet'`/`quota_mensuel=60`/`statut='actif'`.

Ce spec couvre la Phase 2, **sous-projet "paiement mensuel"** : permettre à une entreprise de payer réellement un palier via **GeniusPay** (remplace CinetPay dans `CLAUDE.md`, décision du 2026-10-12), avec prélèvement mensuel en libre-service. GeniusPay offre une API Subscriptions native (plans à intervalle, lien de paiement hébergé généré par leur API) — confirmé par recherche web (`geniuspay.ci/docs/api`, `pay.genius.ci/doc`), mais **Sorel n'a pas encore de compte marchand ni de clés API** (ni sandbox, ni live) au moment de l'écriture de ce spec. Ce document peut donc être écrit et le plan d'implémentation préparé, mais toute étape nécessitant un appel réel à l'API GeniusPay (format exact des webhooks, mécanisme de signature, support du pass-through de métadonnées) reste **à vérifier contre la documentation réelle une fois le compte actif**, pas supposée.

**Sous-projets Phase 2 explicitement hors scope ici** (chacun aura son propre spec séparé) : facture annuelle par virement, dépassement facturé à l'AO au-delà du quota, garde-fou anti-abus sur le palier Découverte.

## Décisions de cadrage

- **Checkout hébergé, pas de formulaire maison.** GeniusPay génère un lien de paiement/abonnement hébergé par leurs soins (comme Stripe Checkout) — NoubinAO ne manipule jamais de données de carte ou de mobile money. Rien à construire côté UI de paiement, seulement la redirection et le traitement du webhook de retour.
- **Aucun changement de défaut, ni pour les entreprises existantes ni pour les nouvelles.** Toute entreprise (déjà inscrite ou créée après ce déploiement) reste `cabinet`/60/`actif` tant que personne ne passe explicitement par le flux de paiement ou qu'un changement manuel SQL n'est fait par Sorel. Le vrai palier payant ne s'applique qu'après une conversation commerciale — ce sous-projet active la *possibilité* de payer, il ne force aucune rétrogradation.
- **Changement de palier = nouvelle souscription, jamais de proration.** Changer de palier en cours de mois crée un nouveau paiement GeniusPay qui remplace l'ancien abonnement ; aucun calcul de remboursement ou de crédit partiel. Simplicité délibérée pour la V1 de ce sous-projet, à revoir seulement si un client se plaint concrètement. **Important** : si `geniuspay_subscription_id` existe déjà (l'entreprise change depuis un palier payant vers un autre), l'ancienne souscription doit être annulée via l'API GeniusPay avant ou pendant la création de la nouvelle — sans quoi l'entreprise serait prélevée deux fois en parallèle. L'annulation effective ne doit être actée en base (écraser `geniuspay_subscription_id`) qu'après confirmation du nouveau paiement via webhook, pas avant — pour ne jamais couper l'accès pendant une fenêtre où ni l'ancien ni le nouveau paiement n'est confirmé.
- **Suspension = blocage total, pas de dégradation.** Paiement échoué ou abonnement annulé côté GeniusPay → `abonnement.statut='suspendu'`. Toute tentative d'upload de DAO est alors refusée avec un message dédié ("abonnement suspendu, régularisez le paiement"), **même si le compteur du mois est sous le quota** — distinct du message "quota mensuel atteint".
- **Découverte reste gratuit, jamais de plan GeniusPay associé.** Sélectionner Découverte dans l'UI = mise à jour directe de `abonnement` en base, aucune redirection de paiement.

## Modèle de données

Deux colonnes nouvelles sur `abonnement`, nullables (une entreprise en Découverte ou payée par virement — Phase 2 facture annuelle, hors scope ici — n'a pas de ces identifiants) :

| Colonne | Type | Notes |
|---|---|---|
| `geniuspay_customer_id` | `text`, nullable | Identifiant client côté GeniusPay |
| `geniuspay_subscription_id` | `text`, nullable | Identifiant de la souscription active côté GeniusPay |

Les enums `plan_abonnement`/`statut_abonnement`/`mode_facturation_abonnement` existent déjà depuis la Phase 1 (`actif`/`suspendu`, `mensuel`/`annuel`) — aucune nouvelle valeur requise, seulement le câblage qui les exploite enfin.

### Config statique (variables d'environnement, pas en base)

Le mapping palier NoubinAO ↔ plan GeniusPay est une config d'environnement, pas une donnée métier — un plan GeniusPay est créé une fois par palier payant (Starter/Croissance/Cabinet) dans le dashboard GeniusPay, pas par entreprise :

```
GENIUSPAY_API_KEY=
GENIUSPAY_API_SECRET=
GENIUSPAY_WEBHOOK_SECRET=
GENIUSPAY_PLAN_STARTER_ID=
GENIUSPAY_PLAN_CROISSANCE_ID=
GENIUSPAY_PLAN_CABINET_ID=
```

Toutes vides tant que le compte marchand n'existe pas. Découverte n'a pas d'entrée — gratuit, jamais de plan GeniusPay. `GENIUSPAY_WEBHOOK_SECRET` : nom provisoire, le mécanisme réel de vérification de signature des webhooks GeniusPay (HMAC sur quel champ, header exact) est **à confirmer contre leur documentation** une fois accessible — ne pas implémenter de vérification inventée.

## Flux de paiement

1. Un admin ouvre `/parametres`, clique "Changer de palier" près de la carte `AbonnementCard` existante (Phase 1).
2. Une boîte de dialogue liste les 4 paliers avec leur prix indicatif (déjà documentés dans `CLAUDE.md`).
3. Clic sur **Découverte** → Server Action met à jour `abonnement` directement (`plan='decouverte'`, `quota_mensuel=1`, pas de redirection).
4. Clic sur un palier **payant** → Server Action appelle l'API GeniusPay pour créer/récupérer un lien d'abonnement hébergé (plan GeniusPay correspondant via la config d'environnement, `entreprise_id` passé en métadonnée pour corrélation — **à confirmer que l'API le supporte**), puis redirige le navigateur vers ce lien.
5. Paiement complété côté GeniusPay → webhook `app/api/geniuspay/webhook/route.ts` reçu : met à jour `plan`, `quota_mensuel` (valeur fixe par palier, cohérente avec `CLAUDE.md`), `statut='actif'`, `date_renouvellement`, `mode_facturation='mensuel'`, `geniuspay_customer_id`, `geniuspay_subscription_id`.
6. Paiement échoué ou abonnement annulé (webhook correspondant) → `statut='suspendu'`, le reste des colonnes inchangé (on garde `plan`/`quota_mensuel` pour l'historique/affichage, seul `statut` gouverne le blocage).

## Gate de quota — extension de `verifierQuotaDisponible`

`lib/abonnement/quota.ts` (Phase 1) lit déjà `quota_mensuel` ; ce sous-projet lui fait aussi lire `statut`. Nouvelle forme du retour :

```typescript
export interface VerificationQuota {
  autorise: boolean;
  utilise: number;
  quota: number;
  suspendu: boolean;
}
```

- Si `statut === 'suspendu'` → `{ autorise: false, suspendu: true, utilise, quota }`.
- Sinon, comportement Phase 1 inchangé (`autorise = utilise < quota`, `suspendu: false`).
- Le fail-open existant (aucune ligne `abonnement` → `autorise: true, quota: Infinity`) reste inchangé, `suspendu: false` dans ce cas.

`lib/appels-offres/actions.ts` (les deux points d'appel, `demarrerTeleversementDao` et `finaliserTeleversementDao`, déjà en place depuis la Phase 1) distinguent maintenant les deux refus :
- `quota.suspendu` → `"Abonnement suspendu. Régularisez votre paiement pour continuer à traiter des appels d'offres."`
- `!quota.autorise && !quota.suspendu` → message quota atteint existant, inchangé.

## Interface

- `AbonnementCard` (Phase 1, lecture seule) reste telle quelle pour l'affichage usage/palier.
- Nouveau composant client, admin-only (même garde que `EquipeCard`), bouton "Changer de palier" ouvrant une boîte de dialogue (4 options avec prix), qui déclenche soit la mise à jour directe (Découverte) soit la redirection GeniusPay (palier payant).
- Si `statut === 'suspendu'`, `AbonnementCard` affiche un bandeau d'alerte visible par tous les membres (pas seulement l'admin) — l'information "le service est bloqué" concerne toute l'équipe, même si seul un admin peut agir.

## Hors scope (sous-projets séparés, specs à venir)

- Facture annuelle par virement (`mode_facturation='annuel'` reste posé mais non câblé par ce sous-projet).
- Dépassement facturé à l'AO au-delà du quota.
- Garde-fou anti-abus palier Découverte (vérification RCCM/domaine email).
- Changement de défaut à l'inscription (`creer_entreprise` reste `cabinet`/60 pour l'instant).

## Points à vérifier une fois le compte GeniusPay actif (pas supposés dans ce spec)

- Mécanisme exact de pass-through de métadonnées (`entreprise_id`) à la création d'un lien d'abonnement — nécessaire pour corréler le webhook à la bonne entreprise sans dépendre uniquement de `geniuspay_customer_id`/`geniuspay_subscription_id` déjà connus en base (cas du tout premier paiement, où ces identifiants n'existent pas encore côté NoubinAO).
- Mécanisme de vérification de signature des webhooks (header exact, algorithme).
- Liste exacte des événements webhook disponibles (noms d'événements pour paiement réussi/renouvelé/échoué/abonnement annulé) et leur schéma JSON.
- Comportement de l'API lors d'un changement de plan sur une souscription déjà active (confirmer qu'une "nouvelle souscription" est bien le mécanisme attendu par GeniusPay plutôt qu'un endpoint de mise à jour dédié).

## Tests

- `lib/abonnement/quota.test.ts` : nouveau cas `statut='suspendu'` → `{ autorise: false, suspendu: true, ... }`, y compris le cas où `utilise < quota` (suspendu bloque même sous quota).
- `lib/appels-offres/actions.test.ts` : nouveau cas où `verifierQuotaDisponible` renvoie `suspendu: true` → message de suspension distinct, toujours aucune insertion/aucune création d'URL signée.
- Le flux de création de lien GeniusPay et le traitement du webhook ne sont pas testables en Vitest sans mock de leur API — à couvrir par des tests unitaires sur la logique pure (construction du payload, mapping palier→plan, mapping événement webhook→mise à jour `abonnement`) avec l'appel réseau isolé derrière une interface mockable, jamais testés contre l'API réelle en CI.
