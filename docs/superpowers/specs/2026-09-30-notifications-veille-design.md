# Notifications AO pertinents (sous-projet B)

Date : 2026-09-30
Statut : décisions validées avec l'utilisateur (section par section, brainstorming).

## Contexte

Second sous-projet d'un ensemble à deux volets annoncé dans la spec
`2026-09-29-secteurs-activite-filtre-veille-design.md` (sous-projet A,
livré et mergé le 2026-09-30). A a posé la classification déterministe
par secteur des avis (`classifierSecteur`) et le filtre serveur de
`/veille`. B consomme cette classification pour notifier proactivement
les entreprises d'un nouvel avis correspondant à leurs secteurs
configurés, sans que l'utilisateur ait à revenir consulter `/veille`.

**Contrainte découverte en amont de ce brainstorming** : Resend n'est
jamais câblé dans le projet (`RESEND_API_KEY` prévu dans les variables
d'environnement mais aucun code ne le référence), et aucun domaine
n'est encore acheté pour NoubinAO — l'envoi SMTP custom Supabase Auth
via Resend reste lui aussi différé pour la même raison (voir mémoire
`noubinao_mailer_rate_limit_resend_differe`). Le canal email est donc
techniquement bloqué aujourd'hui : ce sous-projet se limite au canal
in-app. L'email sera ajouté dans un sous-projet ultérieur une fois un
domaine acheté et Resend câblé.

## Décisions validées avec l'utilisateur

- **Canal V1 : in-app seul.** Pas d'email dans ce sous-projet.
- **Déclenchement immédiat à l'insertion** d'un nouvel avis classé dans
  un secteur configuré — pas de digest groupé. Un seul point d'appel
  (le route handler de scraping existant), pas de job séparé à
  orchestrer.
- **Granularité par utilisateur** : chaque membre de l'équipe a son
  propre état lu/non-lu (pas un état partagé par entreprise). Cohérent
  avec `appel_offres.assigne_a` (responsable assigné par AO, voir
  mémoire `noubinao_module7_page_detail_onglets` / module 5) — chacun
  gère son propre badge.
- **Portée stricte** : notification générée seulement si le secteur
  configuré d'une entreprise matche le secteur classé d'un avis.
  Une entreprise sans secteur configuré (0/4, voit tout dans `/veille`)
  ne reçoit **aucune** notification — rien n'est « pertinent » pour
  elle par définition, même si elle voit tout dans la liste complète.
  Un avis non classé (`secteur` null, visible par tous dans `/veille`)
  ne génère **aucune** notification à personne. Ce sous-ensemble est
  volontairement plus strict que la règle de visibilité de `/veille`
  (sous-projet A) — la notification est un signal, pas un doublon de
  la liste complète.
- **Clic sur une notification** → redirection simple vers `/veille`,
  pas de deep-link vers l'avis précis (pas de page détail par avis
  aujourd'hui, cohérent avec l'existant).
- **Popover** : 10 notifications les plus récentes (lues + non lues),
  bouton « tout marquer lu ». Pas de page `/notifications` dédiée, pas
  de préférences de notification par utilisateur.

## Modèle de données

```sql
create table notification (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  avis_id uuid not null references avis_ao_national(id) on delete cascade,
  lu boolean not null default false,
  cree_le timestamptz not null default now(),
  unique (utilisateur_id, avis_id)
);
create index notification_utilisateur_non_lues_idx on notification(utilisateur_id, lu);

alter table notification enable row level security;

create policy "notification_select_self" on notification
  for select using (utilisateur_id = auth.uid());

create policy "notification_update_self" on notification
  for update using (utilisateur_id = auth.uid())
  with check (utilisateur_id = auth.uid());
```

`on delete cascade` sur `avis_id` : une notification disparaît
automatiquement quand son avis est purgé par le nettoyage quotidien
existant (`date_limite_remise_offres` échue) — aucune logique de
nettoyage supplémentaire à écrire.

Pas de policy `insert`/`delete` pour `authenticated` : l'écriture se
fait uniquement via le route handler service-role (fan-out ci-dessous),
la suppression uniquement par cascade. Update explicitement doté d'un
`with check` — piège déjà rencontré sur ce projet (voir mémoire
`noubinao_rls_with_check_gotcha` : une policy `for update` sans `with
check` réutilise silencieusement `using`, laissant `utilisateur_id`
réécrivable).

## Fan-out (génération des notifications)

Nouveau module pur `lib/veille/notifications.ts` :

```typescript
export function construireLignesNotification(
  avisNouveaux: { id: string; secteur: string | null }[],
  entreprises: { id: string; secteursActivite: string[] }[],
  utilisateursParEntreprise: Map<string, string[]>,
): { utilisateur_id: string; avis_id: string }[]
```

- Ignore les avis dont `secteur` est `null`.
- Pour chaque avis classé, matche les entreprises dont
  `secteursActivite` contient ce secteur.
- Fan-out à tous les utilisateurs de ces entreprises
  (`utilisateursParEntreprise`).
- Une paire (utilisateur, avis) par construction — pas de doublon
  possible côté fonction pure ; la contrainte `unique` en base reste un
  filet de sécurité.

**Point d'appel** : `app/api/veille/marches-publics/sync/route.ts`,
juste après l'insertion des `nouveaux` avis (bloc `if (nouveaux.length
> 0)` existant).

Si au moins un des `nouveaux` a un `secteur` non-null :

1. `entreprise.select("id, secteurs_activite").overlaps("secteurs_activite", secteursDistinctsDesNouveaux)`
2. `utilisateur.select("id, entreprise_id").in("entreprise_id", entrepriseIds)`
3. Construction d'un `Map<entreprise_id, utilisateur_id[]>` à partir du
   résultat (2).
4. Appel de `construireLignesNotification`.
5. Insert batch dans `notification` (client service-role déjà utilisé
   dans ce handler pour les autres écritures).

**Risque accepté, documenté plutôt que corrigé** : ce handler n'enveloppe
aucune de ses étapes dans une transaction SQL explicite (déjà le cas
pour l'insert des avis, la mise à jour, la purge — étapes séquentielles
indépendantes). Si l'insert `notification` échoue après que les avis
`nouveaux` ont déjà été insérés avec succès, un retry QStash reclassera
ces avis comme `existants` (déjà en base) lors de la prochaine
exécution — leur notification ne sera **jamais** régénérée. L'avis
reste visible dans `/veille` (aucune perte de données), seule
l'opportunité de notification proactive est perdue silencieusement.
Même profil de risque que le reste du fichier ; pas de mécanisme
d'idempotence ajouté pour ce cas, hors scope de ce sous-projet.

## Lecture / actions côté client

Nouveau domaine `lib/notifications/actions.ts` (Server Actions, client
lié RLS — pas service-role) :

- `listerNotifications()` : les 10 plus récentes (lues + non lues) de
  `auth.uid()`, jointure légère sur `avis_ao_national(objet,
  autorite_contractante)` pour l'affichage, tri `cree_le desc`. Renvoie
  aussi le compte total non lues (requête séparée `count`, filtre
  `lu=false`).
- `marquerNotificationLue(id: string)` : update `lu=true` où `id`
  match — RLS garantit déjà l'appartenance via `utilisateur_id =
  auth.uid()`.
- `marquerToutesNotificationsLues()` : update `lu=true` où
  `utilisateur_id=auth.uid() and lu=false`.

## UI

`components/notification-bell.tsx` (client component), placé dans
`app/(app)/layout.tsx` juste avant `UserMenu` dans le header (même
ligne, header déjà `flex items-center justify-between`).

- Icône `Bell` (lucide-react), badge avec compte non lues (plafond
  d'affichage « 9+ » au-delà de 9).
- Fetch initial au montage via `listerNotifications()` — composant
  autonome, pas de prop venant du layout serveur (évite un couplage
  supplémentaire au rendu du layout, qui ne se ré-exécute pas à chaque
  navigation côté client dans l'App Router).
- Popover (shadcn `Popover` — liste scrollable, distinct du patron
  `DropdownMenu` de `UserMenu`) : les 10 notifications, non lues avec
  point bleu + fond légèrement teinté, lues neutres.
- Chaque item est un lien vers `/veille` ; `onClick` appelle
  `marquerNotificationLue` puis met à jour l'état local de façon
  optimiste (pas de refetch après clic).
- Bouton « Tout marquer lu » en haut du popover, visible seulement s'il
  reste au moins une notification non lue — mise à jour optimiste
  locale + appel `marquerToutesNotificationsLues`.
- État vide : texte simple « Aucune notification » (cohérent avec
  l'absence d'illustrations ailleurs dans le projet).
- Échec de fetch ou de mise à jour : silencieux, pas de toast (composant
  de fond non bloquant) — `console.error` uniquement.

## i18n

Nouveau namespace `Notifications` dans `messages/fr.json` /
`messages/en.json` : titre du popover, bouton « tout marquer lu »,
état vide, libellé du badge (accessibilité — `aria-label` avec le
compte non lues).

## États et erreurs

- `construireLignesNotification` : fonction pure, aucun échec possible.
- Échec des requêtes `entreprise`/`utilisateur`/insert `notification`
  dans le route handler : propage l'exception existante du bloc
  `try/catch` du handler (même patron que le reste du fichier —
  `veille_execution` enregistre `statut: "erreur"`). Voir « Risque
  accepté » ci-dessus pour la conséquence sur les notifications déjà
  calculées mais non insérées.
- Échec de `listerNotifications`/`marquerNotificationLue`/
  `marquerToutesNotificationsLues` côté client : voir UI ci-dessus
  (silencieux, log console).

## Tests

- `construireLignesNotification` : TDD, cas nominal (match secteur),
  avis non classé ignoré, entreprise multi-secteurs, entreprise sans
  secteur configuré (aucun match, donc aucune notif), fan-out
  multi-utilisateurs d'une même entreprise, dédoublonnage naturel.
  Même patron que `lib/veille/classification-secteur.test.ts`.
- Pas de test sur le route handler, les Server Actions, ni
  `NotificationBell` — cohérent avec le reste du projet (aucune
  fonction de requête Supabase ni composant UI testé directement dans
  `lib/veille/` ou `app/`).

## Hors périmètre (ce sous-projet B)

- **Email (Resend)** — reporté, pas de domaine acheté. Sous-projet
  ultérieur une fois `noubinao_mailer_rate_limit_resend_differe`
  résolu.
- **Digest groupé quotidien** — déclenchement immédiat à l'insertion
  retenu à la place.
- **Deep-link vers l'avis précis dans `/veille`** — lien générique vers
  `/veille` retenu.
- **Page dédiée `/notifications`** — le popover suffit au volume actuel
  (~1 avis pertinent/jour selon l'observation de la spec du
  sous-projet A).
- **Préférences de notification par utilisateur** (opt-out, mots-clés
  custom au-delà des 4 secteurs) — le secteur entreprise reste le seul
  levier, cohérent avec le sous-projet A.
- **Reclassement/notification rétroactive** des avis déjà en base sans
  notification générée.
