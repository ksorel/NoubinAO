# Multi-entreprise par utilisateur — design

Date : 2026-10-13 (révisé le 2026-10-13 après reconnaissance détaillée du
corpus RLS réel pendant l'écriture du plan — voir note de révision en bas)

Déclencheur : un utilisateur (sorel.kone@gmail.com) bloqué en tentant de
rejoindre une deuxième entreprise (ALYNIMO) via un lien d'invitation, alors
que son email était déjà rattaché à une entreprise de test. Confirmé par
Sorel : besoin produit réel, pas un artefact de test — **un même
propriétaire peut avoir plusieurs entreprises dans des secteurs d'activité
différents**, chacune avec son propre espace NoubinAO (AO, bibliothèque,
pipeline, abonnement).

## Problème

L'architecture actuelle est strictement **1 compte Supabase Auth = 1 ligne
`utilisateur` = 1 entreprise** :

- `utilisateur.id` est à la fois clé primaire et FK vers `auth.users(id)` —
  le même uuid. Un `auth.uid()` ne peut donc correspondre qu'à au plus une
  seule ligne `utilisateur`.
- `utilisateur.entreprise_id` est une colonne scalaire `not null`, pas une
  relation n-n.
- Les RPC `creer_entreprise` et `rejoindre_entreprise` vérifient
  explicitement `exists (select 1 from utilisateur where id = auth.uid())`
  et lèvent `utilisateur_deja_rattache` sinon, bloquant toute deuxième
  jonction.
- **91 policies RLS actives** (vérifié directement en base via
  `pg_policies`, source de vérité plus fiable que les fichiers de migration
  historiques qui peuvent avoir été modifiés depuis) reposent très
  majoritairement sur l'identité `utilisateur.id = auth.uid()`, soit
  directement (jointure `join utilisateur u on ... and u.id = auth.uid()`,
  parfois à travers 2-3 tables intermédiaires), soit via la fonction
  `utilisateur_entreprise_id(auth.uid())`. C'est le mécanisme d'isolation
  multi-tenant de la quasi-totalité de l'application.
- En plus des policies, **20 colonnes** à travers le schéma (`created_by`,
  `assigne_a`, `coche_par`, `genere_par`, `modifie_par`, `cree_par`,
  `utilisee_par`, `importe_par`, `utilisateur_id`) sont des FK vers
  `utilisateur(id)` et plusieurs policies `with check` comparent cette FK
  directement à `auth.uid()` (ex. `created_by = auth.uid()`) — même
  hypothèse implicite (`utilisateur.id = auth.uid()`) à un autre endroit.
- Une fonction `utilisateur_est_admin(p_utilisateur_id uuid)` (non
  documentée dans la version précédente de ce spec) fait la même hypothèse
  pour les policies de `invitation_equipe`.
- `app/(app)/layout.tsx` (gardien de tout le groupe de routes `(app)`)
  interroge `utilisateur` directement (`where id = auth.uid()`,
  `.maybeSingle()`), en dehors de `obtenirUtilisateurCourant()` — un
  deuxième endroit qui suppose 1 ligne par compte Auth.

## Décisions de cadrage (validées avec Sorel)

- **Mode bascule, pas agrégation** : l'utilisateur travaille dans UNE
  entreprise à la fois ("espace de travail" actif), pas de vue combinant
  les AO de plusieurs entreprises. Isolation stricte entre entreprises,
  cohérente avec des secteurs d'activité différents.
- **Entreprise active mémorisée par cookie**, pas par préfixe d'URL. Les
  routes existantes (`/appels-offres`, `/bibliotheque`, etc.) ne changent
  pas — seule la résolution de "quelle entreprise" derrière ces routes
  change. Évite une restructuration de tout `app/(app)/*`.
- **Retrait d'un membre : hors scope.** Aucune action "retirer un membre"
  n'existe déjà dans le produit (seule `revoquerInvitation`, qui annule une
  invitation *en attente*, existe). Pas de policy `delete`/`update`
  supplémentaire à construire pour un besoin qui n'est pas encore exprimé.
- **Pas de changement de rôle a posteriori** ni de promotion — déjà hors
  scope du module invitation précédent, le reste tel quel ici aussi.

## Modèle de données

### Décision d'architecture : `utilisateur` garde sa forme, perd son identité figée

**Changement par rapport à la première version de ce spec.** L'idée
initiale (table de jointure séparée `membre_entreprise`, `utilisateur`
devenant un pur profil) a été abandonnée après avoir extrait et classé la
totalité des 91 policies RLS réelles (pas seulement celles décrites dans
les migrations historiques, qui peuvent avoir divergé) : la moitié
environ traverse 2 à 3 tables avant de rejoindre `utilisateur`
(`checklist_item_dossier → dossier_reponse → appel_offres → utilisateur`,
par exemple), et 20 colonnes `*_par`/`created_by`/`assigne_a` à travers le
schéma sont elles-mêmes des FK vers `utilisateur(id)` et comparées à
`auth.uid()` dans des `with check`. Introduire une deuxième table aurait
obligé à réécrire la forme logique de chacune de ces policies une par une
(changer la table jointe, pas juste un nom de colonne) — risque d'erreur
élevé sur un mécanisme de sécurité, pour un gain nul.

**La bonne décomposition, confirmée en générant et vérifiant les 91
réécritures contre la base réelle :** `utilisateur` garde EXACTEMENT sa
forme actuelle (une ligne = une personne **dans** une entreprise, avec
`entreprise_id`, `role`, `nom`) — seule sa clé d'identité change. `id`
cesse d'être = `auth.uid()` (devient un uuid généré, propre à la ligne,
donc à la paire personne×entreprise) ; une nouvelle colonne `auth_id`
porte le compte Supabase Auth, avec un `unique (auth_id, entreprise_id)`
remplaçant l'ancienne unicité implicite (un seul `utilisateur.id` par
compte Auth). Résultat : **la quasi-totalité des policies et TOUTES les 20
FK `*_par`/`created_by`/`utilisateur_id` existantes restent valides sans
aucune modification de leur structure** — seule l'expression finale
`u.id = auth.uid()` (ou `created_by = auth.uid()`, etc.) doit pointer vers
`auth_id` à la place. Un remplacement de token, pas une réécriture de
jointure.

### Migration `utilisateur`

```sql
-- Noms de contraintes vérifiés en base (pg_constraint), pas supposés.
alter table utilisateur drop constraint utilisateur_id_fkey;
alter table utilisateur alter column id set default gen_random_uuid();

alter table utilisateur add column auth_id uuid;
update utilisateur set auth_id = id;
alter table utilisateur alter column auth_id set not null;
alter table utilisateur
  add constraint utilisateur_auth_id_fkey foreign key (auth_id) references auth.users(id) on delete cascade;
alter table utilisateur
  add constraint utilisateur_auth_entreprise_unique unique (auth_id, entreprise_id);
create index utilisateur_auth_id_idx on utilisateur(auth_id);
```

`id` reste la clé primaire (`utilisateur_pkey` inchangée) — c'est elle que
continuent de référencer les 20 colonnes `created_by`/`genere_par`/etc.
existantes, sans aucun changement de leur côté : chaque ligne `utilisateur`
représente toujours "cette personne, dans cette entreprise", donc
`appel_offres.created_by` pointe toujours correctement vers la bonne
identité contextuelle.

### Fonctions — remplacent `utilisateur_entreprise_id` et `utilisateur_est_admin`

Les deux fonctions existantes supposent 1 ligne par `auth.uid()` et doivent
disparaître ; remplacées par deux fonctions booléennes, scope explicite par
entreprise, même patron SECURITY DEFINER (anti-récursion RLS, cf.
`20260909120000_fix_utilisateur_select_membres_recursion.sql`) :

```sql
drop function if exists utilisateur_entreprise_id(uuid);
drop function if exists utilisateur_est_admin(uuid);

create or replace function est_membre_entreprise(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from utilisateur
    where auth_id = auth.uid() and entreprise_id = p_entreprise_id
  );
$$;

create or replace function est_admin_entreprise(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from utilisateur
    where auth_id = auth.uid() and entreprise_id = p_entreprise_id and role = 'admin'
  );
$$;
```

### Réécriture des 91 policies — vérifiée exhaustivement contre la base réelle

Trois règles mécaniques, appliquées dans **une seule nouvelle migration**
consolidée (jamais en modifiant les migrations historiques) :

1. **81 policies** : remplacement de token pur, `u.id = auth.uid()` (ou
   `utilisateur.id`, `u1.id`, `u2.id` selon l'alias) → `u.auth_id =
   auth.uid()`, et `<col> = auth.uid()` pour chacune des 20 colonnes FK
   listées plus haut → `<col> in (select id from utilisateur where
   auth_id = auth.uid())`. Structure de jointure, alias, profondeur,
   ordre des `AND` : **tout reste identique**, seul le nom de colonne à
   droite de l'égalité change. Généré et vérifié ligne par ligne contre
   `pg_policies` (voir le plan d'implémentation pour le texte SQL complet
   des 81 instructions — trop long pour ce document).
2. **7 policies** à réécrire à la main (forme `utilisateur_entreprise_id(auth.uid())`
   ou `utilisateur_est_admin(auth.uid())`, qui ne se traduit pas en simple
   substitution de token) : `abonnement_select_membres`,
   `email_insert_self`, `email_update_self`, `invitation_equipe_insert_admin`,
   `invitation_equipe_select_admin`, `invitation_equipe_update_admin`,
   `utilisateur_select_membres` — remplacées par des appels à
   `est_membre_entreprise(...)` / `est_admin_entreprise(...)`. Texte exact
   dans le plan d'implémentation.
3. **1 policy** à la main : `utilisateur_select_self`, `(id = auth.uid())`
   → `(auth_id = auth.uid())`.
4. **2 policies** intentionnellement non touchées (aucun rapport avec
   l'entreprise) : `avis_ao_national_select_authenticated`,
   `bomp_numero_select_authenticated` — ouvertes à tout utilisateur
   authentifié, sans notion d'entreprise.

Total : 81 + 7 + 1 + 2 = 91. Comptes réconciliés avec le nombre de
policies réellement actives en base — aucune oubliée.

### RPC `creer_entreprise` et `rejoindre_entreprise` — simplifiées

Plus besoin de gérer deux tables ni de `on conflict` sur un profil séparé
— un simple insert, comme aujourd'hui, juste avec `auth_id` au lieu de
`id` :

```sql
create or replace function creer_entreprise(p_nom text, p_rccm text, p_nom_utilisateur text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  insert into entreprise (nom, rccm) values (p_nom, p_rccm) returning id into v_entreprise_id;
  insert into utilisateur (auth_id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');
  return v_entreprise_id;
end;
$$;
```

```sql
create or replace function rejoindre_entreprise(p_token text, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
  v_utilisateur_id uuid;
begin
  select * into v_invitation
  from invitation_equipe
  where token = p_token and statut = 'en_attente' and expire_at > now();

  if v_invitation is null then
    raise exception 'invitation_invalide';
  end if;

  if exists (
    select 1 from utilisateur
    where auth_id = auth.uid() and entreprise_id = v_invitation.entreprise_id
  ) then
    raise exception 'deja_membre_de_cette_entreprise';
  end if;

  insert into utilisateur (auth_id, entreprise_id, nom, role)
  values (auth.uid(), v_invitation.entreprise_id, p_nom, v_invitation.role)
  returning id into v_utilisateur_id;

  update invitation_equipe
  set statut = 'utilisee', utilisee_par = v_utilisateur_id, utilisee_at = now()
  where id = v_invitation.id;

  return v_invitation.entreprise_id;
end;
$$;
```

`utilisateur_deja_rattache` disparaît, remplacée par
`deja_membre_de_cette_entreprise` — vérification ciblée sur l'entreprise de
l'invitation, pas globale.

### `obtenir_invitation_publique` — étendue avec `entreprise_id`

Nécessaire pour que la page d'invitation puisse vérifier l'appartenance à
**cette** entreprise précise plutôt qu'à "une" entreprise quelconque
(changement de type de retour → `drop function` requis avant de recréer) :

```sql
drop function if exists obtenir_invitation_publique(text);

create or replace function obtenir_invitation_publique(p_token text)
returns table(entreprise_id uuid, entreprise_nom text, role text, valide boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
  v_valide boolean;
begin
  select * into v_invitation from invitation_equipe where token = p_token;

  if v_invitation is null then
    return query select null::uuid, null::text, null::text, false;
    return;
  end if;

  v_valide := v_invitation.statut = 'en_attente' and v_invitation.expire_at > now();

  if not v_valide then
    return query select null::uuid, null::text, null::text, false;
    return;
  end if;

  return query
  select e.id, e.nom, v_invitation.role, true
  from entreprise e
  where e.id = v_invitation.entreprise_id;
end;
$$;
```

## Couche application

### `obtenirUtilisateurCourant()` garde EXACTEMENT sa forme de retour

Point clé qui limite le rayon d'impact côté TypeScript : la fonction
continue de renvoyer `{ id, entreprise_id, nom, role } | null` — tous ses
appelants existants (dizaines de Server Actions et de pages qui
déstructurent `.entreprise_id`/`.role`) **ne changent pas**. Seule son
implémentation interne change : elle résout maintenant l'entreprise
*active* parmi les lignes `utilisateur` du compte, pas l'unique ligne
d'avant.

```ts
export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
  role: RoleUtilisateur;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const authId = authData?.claims?.sub as string | undefined;
  if (!authId) return null;

  const { data: memberships } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom, role")
    .eq("auth_id", authId)
    .order("created_at", { ascending: true });
  if (!memberships || memberships.length === 0) return null;

  const cookieStore = await cookies();
  const entrepriseActiveId = cookieStore.get("entreprise_active_id")?.value;

  return memberships.find((m) => m.entreprise_id === entrepriseActiveId) ?? memberships[0];
}
```

**Pas d'écriture de cookie dans cette fonction** : elle est appelée depuis
des Server Components (pages), où `cookies().set()` lève une erreur en
dehors d'une Server Action/Route Handler. Si le cookie est absent ou
pointe vers une entreprise dont l'utilisateur n'est plus membre, elle
retombe silencieusement sur la première membership (ordre `created_at`),
recalculé à chaque appel. Le cookie n'est posé que par les actions
explicites ci-dessous.

### Nouvelles fonctions

- `listerMesEntreprises(): Promise<{ entreprise_id: string; nom: string; role: RoleUtilisateur }[]>`
  (`lib/utilisateur/queries.ts`) — lit `utilisateur` (`select entreprise_id,
  role, entreprise:entreprise_id(nom) where auth_id = authId`), alimente
  le switcher.
- `changerEntrepriseActive(entrepriseId: string)` (Server Action,
  `lib/utilisateur/actions.ts`) : auth check, vérifie l'appartenance avant
  de poser le cookie (défense en profondeur), pose le cookie (`httpOnly`,
  `sameSite: "lax"`, `path: "/"`), `redirect("/accueil")` — jamais la page
  courante, pour éviter de rester sur un AO/document qui appartient à
  l'ancienne entreprise active.
- `creerEntreprise`/`rejoindreEntreprise` (actions existantes) posent
  désormais aussi ce cookie sur l'entreprise nouvellement créée/rejointe
  (sinon elle ne devient active qu'au prochain passage par le switcher —
  mauvaise première impression après création).

### `app/(app)/layout.tsx` — remplace sa requête maison par `obtenirUtilisateurCourant()`

Ce fichier interroge `utilisateur` directement
(`where id = authData.claims.sub`) en dehors de `obtenirUtilisateurCourant()`
— deuxième point d'hypothèse 1:1 découvert pendant la reconnaissance,
absent de la première version de ce spec. Remplacé par un appel à
`obtenirUtilisateurCourant()` (déjà résolu pour l'entreprise active) +
`obtenirNomEntreprise(utilisateur.entreprise_id)` (déjà existante) — élimine
au passage le contournement de typage sur la relation `entreprise:entreprise_id(nom)`
(commentaire lignes 40-50 du fichier actuel, qui disparaît avec la requête
qu'il justifiait).

### `listerUtilisateurs()` — inchangée

Toujours `select id, nom, role from utilisateur where entreprise_id = X` —
aucun changement, confirme le bénéfice de garder `utilisateur` dans sa
forme actuelle plutôt que de la scinder.

### Onboarding — inchangé dans sa logique, adapté dans sa requête

`app/onboarding/page.tsx` fait sa propre requête
`select id from utilisateur where id = auth.claims.sub` — adaptée en
`where auth_id = auth.claims.sub` (même logique "redirige si une ligne
existe déjà", juste la colonne de filtre qui change).

### Nouvelle entrée "Nouvelle entreprise" (utilisateur déjà onboardé)

Nouvelle route `app/(app)/entreprises/nouvelle/page.tsx`, réutilise
`OnboardingForm`/l'action `creerEntreprise` telles quelles (plus besoin de
garde particulière : chaque appel à `creer_entreprise` insère simplement
une nouvelle ligne `utilisateur`, qu'il y en ait déjà ou non). Accessible
uniquement via l'item "+ Nouvelle entreprise" du switcher — pas de lien
dans la sidebar générale. Après création, cookie basculé sur la nouvelle
entreprise (déjà couvert par le changement d'action ci-dessus), redirection
`/accueil`.

### `app/invitation/[token]/page.tsx` — logique de blocage ciblée

L'étape 3 actuelle ("Authentifié, a déjà une ligne `utilisateur`" → blocage
générique) est retirée. Remplacée par : une fois le token résolu
(`obtenirInvitationPublique`, étendue pour renvoyer `entreprise_id`) et
l'utilisateur authentifié, vérifier via `listerMesEntreprises()` s'il est
déjà membre de **cette** entreprise précise :

- déjà membre de cette entreprise → "Tu es déjà membre de cette
  entreprise.", lien vers `/accueil`.
- pas encore membre (qu'il ait ou non d'autres entreprises par ailleurs) →
  formulaire de confirmation inchangé → `rejoindreEntreprise(token, nom)`,
  dont le message d'erreur `utilisateur_deja_rattache` devient
  `deja_membre_de_cette_entreprise` → "Tu es déjà membre de cette
  entreprise."

### Switcher d'entreprise (UI)

Étend `components/user-menu.tsx` (déjà le menu en haut à droite,
regroupant thème/langue comme prescrit dans le `CLAUDE.md`) : nouvelle
section listant les entreprises (nom + badge rôle) retournées par
`listerMesEntreprises()`, affichée **seulement si la liste contient plus
d'une entreprise** — sinon comportement actuel inchangé (nom d'entreprise
statique, pas de nouvelle section). Item actif coché, dernier item
"+ Nouvelle entreprise" → `/entreprises/nouvelle`. Clic sur une entreprise
→ `changerEntrepriseActive(id)`.

## Hors scope (confirmé)

- Retirer un membre d'une entreprise.
- Changer le rôle d'un membre existant.
- Vue agrégée entre plusieurs entreprises (tout reste scopé à l'entreprise
  active).
- URL préfixée par entreprise (liens partageables par entreprise) — le
  cookie suffit pour ce besoin.

## Tests

- Unitaires (Vitest) : schéma zod de `changerEntrepriseActive` (uuid
  requis).
- Migration : avant `db push` en production, vérifier sur
  l'environnement de test que `select auth_id, entreprise_id, role from
  utilisateur` après migration donne exactement les mêmes lignes que
  `select id, entreprise_id, role from utilisateur` avant (aucune perte).
- Vérification manuelle navigateur (comme pour les modules précédents,
  `noubinao_pilote_tests_sorel`) : créer une 2e entreprise avec
  sorel.kone@gmail.com → switcher apparaît → bascule → AO de l'entreprise A
  invisibles dans l'entreprise B et inversement ; rejoindre ALYNIMO via le
  lien d'invitation déjà émis vers sorel.kone@gmail.com → doit maintenant
  réussir ; recliquer le même lien une fois membre → message "déjà membre
  de cette entreprise", pas une erreur ; se déconnecter/reconnecter →
  l'entreprise active choisie avant déconnexion reste active (cookie
  persiste).
- RLS : vérification manuelle via `supabase db query --linked` sur un
  échantillon après migration (`appel_offres`, `document`,
  `storage.objects`, `utilisateur`, `invitation_equipe` — les 7 cas à
  réécriture manuelle) plutôt que les 91 une à une.

## Note de révision (2026-10-13)

Le spec initial (Option A, table `membre_entreprise` séparée) a été
remplacé par l'architecture ci-dessus (Option C, `utilisateur` inchangée
dans sa forme, juste `id` détaché de `auth.uid()`) après extraction
complète des 91 policies RLS réellement actives en base pendant l'écriture
du plan d'implémentation — la complexité réelle du corpus (jointures
multi-tables, 20 colonnes FK supplémentaires, fonction
`utilisateur_est_admin` non identifiée initialement) rendait l'Option A
nettement plus risquée que prévu, et l'Option C s'est révélée
mécaniquement plus simple une fois vérifiée statement par statement. Le
comportement produit approuvé par Sorel (bascule par cookie, pas
d'agrégation, retrait de membre hors scope) est inchangé — seul le
mécanisme interne diffère de la version initialement présentée.
