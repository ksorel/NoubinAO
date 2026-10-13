# Multi-entreprise par utilisateur — design

Date : 2026-10-13
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
- **96 `create policy` au total dans le projet, dont 94 reposent sur ce
  pattern** (jointure directe `utilisateur u on u.entreprise_id = X.entreprise_id
  and u.id = auth.uid()`, ou appel à la fonction `utilisateur_entreprise_id(auth.uid())`),
  répartis dans 25 fichiers de migration. C'est le mécanisme d'isolation
  multi-tenant de la quasi-totalité de l'application.

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
  invitation *en attente*, existe). `membre_entreprise` reste insert-only
  pour l'instant — pas de policy `delete`/`update` à construire pour un
  besoin qui n'est pas encore exprimé.
- **Pas de changement de rôle a posteriori** ni de promotion — déjà hors
  scope du module invitation précédent, le reste tel quel ici aussi.

## Modèle de données

### Nouvelle table `membre_entreprise`

```sql
create table membre_entreprise (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references utilisateur(id) on delete cascade,
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  role text not null check (role in ('admin', 'membre')),
  created_at timestamptz not null default now(),
  unique (utilisateur_id, entreprise_id)
);

create index membre_entreprise_utilisateur_id_idx on membre_entreprise(utilisateur_id);
create index membre_entreprise_entreprise_id_idx on membre_entreprise(entreprise_id);
```

`utilisateur` redevient un **profil pur**, indépendant de toute entreprise
(`id` reste = `auth.uid()`, seule contrainte structurelle inchangée) :

```sql
-- Backfill AVANT de retirer les colonnes : chaque ligne utilisateur
-- existante devient une ligne membre_entreprise.
insert into membre_entreprise (utilisateur_id, entreprise_id, role, created_at)
select id, entreprise_id, role, created_at from utilisateur;

alter table utilisateur drop column entreprise_id;
alter table utilisateur drop column role;
```

(`role` quitte `utilisateur` : il n'a plus de sens au niveau du profil une
fois qu'il peut différer par entreprise — cohérent avec le besoin exprimé,
un admin d'une entreprise peut n'être que membre d'une autre.)

### Fonction `est_membre_entreprise` (remplace `utilisateur_entreprise_id`)

Même patron SECURITY DEFINER que l'actuel `utilisateur_entreprise_id`
(`20260909120000_fix_utilisateur_select_membres_recursion.sql`), pour la
même raison anti-récursion :

```sql
create or replace function est_membre_entreprise(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from membre_entreprise
    where utilisateur_id = auth.uid() and entreprise_id = p_entreprise_id
  );
$$;
```

`utilisateur_entreprise_id(uuid)` est supprimée (plus aucun appelant après
réécriture des policies ci-dessous).

### Réécriture des policies existantes (le gros du travail)

**Règle mécanique**, appliquée dans **une seule nouvelle migration**
consolidée (jamais en modifiant les 25 fichiers historiques, convention du
projet) : partout où une policy contient

```sql
exists (
  select 1 from utilisateur u
  where u.entreprise_id = <table>.entreprise_id and u.id = auth.uid()
)
```

(ou sa variante `join utilisateur u on u.entreprise_id = ... where ... u.id = auth.uid()`),
remplacer par `est_membre_entreprise(<table>.entreprise_id)`, via
`alter policy "<nom>" on <table> using (...) [with check (...)]` — préserve
le nom de policy existant, ne touche que la condition. Appliqué aux
policies des tables (toutes les tables listées dans les 25 fichiers
identifiés) : `entreprise`, `document`, `appel_offres`, `exigence_ao`,
`dossier_reponse`, `exigence_document`, `section_dossier`,
`section_document`, `checklist_item_dossier`, `evaluation_go_no_go`,
`synthese_go_no_go`, `jalon_retroplanning`, `section_bpu`, `ligne_bpu`,
`membre_groupement`, `piece_membre_groupement`, `cv_transforme`, `email`,
`fichier_dao_supplementaire`, `invitation_equipe`, `abonnement`, les
tables de veille (`veille_bomp`, `marches_publics_*`).

**Cas particulier `storage.objects`**
(`20260822124743_bibliotheque_documentaire.sql`,
`20260917150000_storage_documents_update_policy.sql`) : l'entreprise n'y
est pas une colonne mais un segment de chemin
(`(storage.foldername(name))[1]`, type `text`). Même remplacement, avec
cast explicite : `est_membre_entreprise((storage.foldername(name))[1]::uuid)`.

**Cas non mécaniques, à écrire à la main :**

- `utilisateur_select_membres` (voir soi-même) : la condition actuelle
  compare `entreprise_id` directement sur la ligne `utilisateur` ciblée —
  cette colonne disparaît. Nouvelle condition : voir les memberships des
  deux côtés se recoupent sur une même entreprise.
  ```sql
  create policy "utilisateur_select_membres" on utilisateur
    for select using (
      exists (
        select 1 from membre_entreprise me1
        join membre_entreprise me2 on me1.entreprise_id = me2.entreprise_id
        where me1.utilisateur_id = auth.uid() and me2.utilisateur_id = utilisateur.id
      )
    );
  ```
- `membre_entreprise` elle-même a besoin d'une policy `select` (lecture de
  la liste des membres d'une entreprise, `EquipeCard`) :
  ```sql
  create policy "membre_entreprise_select_membres" on membre_entreprise
    for select using (est_membre_entreprise(entreprise_id));
  ```
  Pas de policy `insert`/`update`/`delete` — toute écriture passe par les
  RPC `security definer` ci-dessous (même logique que `utilisateur`
  aujourd'hui, qui n'a pas de policy insert directe).

### RPC `creer_entreprise` — assouplie

Change de "refuse si `utilisateur` existe déjà" à "crée le profil s'il
n'existe pas encore, insère toujours une nouvelle membership" :

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

  insert into utilisateur (id, nom)
  values (auth.uid(), p_nom_utilisateur)
  on conflict (id) do nothing;

  insert into membre_entreprise (utilisateur_id, entreprise_id, role)
  values (auth.uid(), v_entreprise_id, 'admin');

  return v_entreprise_id;
end;
$$;
```

(`on conflict (id) do nothing` : le profil `utilisateur` ne se recrée pas
pour un utilisateur qui a déjà une entreprise ailleurs — `p_nom_utilisateur`
est alors ignoré, le nom déjà en base reste la source de vérité. Comportement
cohérent : le nom d'une personne ne change pas selon l'entreprise créée.)

### RPC `rejoindre_entreprise` — vérif ciblée, pas globale

```sql
create or replace function rejoindre_entreprise(p_token text, p_nom text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
begin
  select * into v_invitation
  from invitation_equipe
  where token = p_token and statut = 'en_attente' and expire_at > now();

  if v_invitation is null then
    raise exception 'invitation_invalide';
  end if;

  if exists (
    select 1 from membre_entreprise
    where utilisateur_id = auth.uid() and entreprise_id = v_invitation.entreprise_id
  ) then
    raise exception 'deja_membre_de_cette_entreprise';
  end if;

  insert into utilisateur (id, nom)
  values (auth.uid(), p_nom)
  on conflict (id) do nothing;

  insert into membre_entreprise (utilisateur_id, entreprise_id, role)
  values (auth.uid(), v_invitation.entreprise_id, v_invitation.role);

  update invitation_equipe
  set statut = 'utilisee', utilisee_par = auth.uid(), utilisee_at = now()
  where id = v_invitation.id;

  return v_invitation.entreprise_id;
end;
$$;
```

`utilisateur_deja_rattache` disparaît, remplacée par
`deja_membre_de_cette_entreprise` — message différent côté UI ("tu es déjà
membre de cette entreprise" plutôt qu'un blocage générique).

## Couche application

### `obtenirUtilisateurCourant()` garde EXACTEMENT sa forme de retour

Point clé qui limite le rayon d'impact côté TypeScript : la fonction
continue de renvoyer `{ id, entreprise_id, nom, role } | null` — tous ses
appelants existants (dizaines de Server Actions et de pages qui
déstructurent `.entreprise_id`/`.role`) **ne changent pas**. Seule son
implémentation interne change : elle résout maintenant l'entreprise
*active*, pas l'unique entreprise.

```ts
export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
  role: RoleUtilisateur;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;
  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, nom")
    .eq("id", userId)
    .maybeSingle();
  if (!utilisateur) return null;

  const cookieStore = await cookies();
  const entrepriseActiveId = cookieStore.get("entreprise_active_id")?.value;

  const { data: memberships } = await supabase
    .from("membre_entreprise")
    .select("entreprise_id, role")
    .eq("utilisateur_id", userId)
    .order("created_at", { ascending: true });
  if (!memberships || memberships.length === 0) return null;

  const active =
    memberships.find((m) => m.entreprise_id === entrepriseActiveId) ?? memberships[0];

  return { id: utilisateur.id, nom: utilisateur.nom, entreprise_id: active.entreprise_id, role: active.role };
}
```

**Pas d'écriture de cookie dans cette fonction** : elle est appelée depuis
des Server Components (pages), où `cookies().set()` lève une erreur en
dehors d'une Server Action/Route Handler. Si le cookie est absent ou pointe
vers une entreprise dont l'utilisateur n'est plus membre, elle retombe
silencieusement sur la première membership (ordre `created_at`) — recalculé
à chaque appel, sans persistance forcée. Le cookie n'est posé que par
l'action explicite de bascule (voir plus bas). Léger coût : une requête
`membre_entreprise` de plus par résolution — acceptable (même ordre de
grandeur que la requête `utilisateur` déjà faite).

### Nouvelles fonctions

- `listerMesEntreprises(): Promise<{ entreprise_id: string; nom: string; role: RoleUtilisateur }[]>`
  (`lib/utilisateur/queries.ts`) — alimente le switcher.
- `changerEntrepriseActive(entrepriseId: string)` (Server Action,
  `lib/utilisateur/actions.ts`) :
  - auth check,
  - vérifie l'appartenance (`membre_entreprise` pour `auth.uid()` +
    `entrepriseId`) avant de poser le cookie — défense en profondeur, même
    si une valeur forgée serait de toute façon ignorée par la résolution
    ci-dessus,
  - pose le cookie (`httpOnly`, `sameSite: "lax"`, `path: "/"`),
  - `redirect("/accueil")` — jamais la page courante, pour éviter de rester
    sur un AO/document qui appartient à l'ancienne entreprise active.

### `listerUtilisateurs()` — adaptée à la nouvelle table

```ts
export async function listerUtilisateurs(entrepriseId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("membre_entreprise")
    .select("role, utilisateur:utilisateur(id, nom)")
    .eq("entreprise_id", entrepriseId);
  if (error) throw error;
  return (data ?? [])
    .map((m) => ({ id: m.utilisateur.id, nom: m.utilisateur.nom, role: m.role }))
    .sort((a, b) => a.nom.localeCompare(b.nom));
}
```
(Tri fait côté application plutôt que via l'ordre PostgREST sur une
ressource imbriquée — évite de supposer une syntaxe `.order()` imbriquée
non vérifiée sur ce projet.)

### Onboarding — inchangé

`app/onboarding/page.tsx` redirige vers `/accueil` dès qu'une ligne
`utilisateur` existe (`select id from utilisateur where id = auth.uid()`).
Cette vérification reste valable telle quelle : `utilisateur` (le profil)
continue d'être créé une seule fois, quel que soit le nombre d'entreprises
ensuite rejointes/créées — **zéro changement sur cette page**.

### Nouvelle entrée "Nouvelle entreprise" (utilisateur déjà onboardé)

Nouvelle route `app/(app)/entreprises/nouvelle/page.tsx`, réutilise
`OnboardingForm`/l'action `creerEntreprise` telles quelles (la RPC gère déjà
`on conflict do nothing` sur le profil). Accessible uniquement via l'item
"+ Nouvelle entreprise" du switcher — pas de lien dans la sidebar générale.
Après création, cookie basculé sur la nouvelle entreprise, redirection
`/accueil`.

### `app/invitation/[token]/page.tsx` — logique de blocage ciblée

L'étape 3 actuelle ("Authentifié, a déjà une ligne `utilisateur`" → blocage
générique) est retirée. Remplacée par : une fois le token résolu
(`obtenirInvitationPublique`, donne déjà `entreprise_nom` — à étendre pour
renvoyer aussi `entreprise_id`) et l'utilisateur authentifié, vérifier s'il
est déjà membre de **cette** entreprise précise (`listerMesEntreprises()`
contient `entreprise_id`) :

- déjà membre de cette entreprise → "Tu es déjà membre de cette
  entreprise.", lien vers `/accueil`.
- pas encore membre (qu'il ait ou non d'autres entreprises par ailleurs) →
  formulaire de confirmation inchangé → `rejoindreEntreprise(token, nom)`.

### Switcher d'entreprise (UI)

Nouveau composant dans le menu utilisateur en haut à droite (à côté
thème/langue, comme prescrit dans le `CLAUDE.md` pour le regroupement
compte), visible **seulement si `listerMesEntreprises()` renvoie plus d'une
entreprise** — sinon comportement actuel inchangé (nom d'entreprise
statique). Liste les entreprises (nom + badge rôle), item actif coché,
dernier item "+ Nouvelle entreprise" → `/entreprises/nouvelle`. Clic sur une
entreprise → `changerEntrepriseActive(id)`.

## Hors scope (confirmé)

- Retirer un membre d'une entreprise.
- Changer le rôle d'un membre existant.
- Vue agrégée entre plusieurs entreprises (tout reste scopé à l'entreprise
  active).
- URL préfixée par entreprise (liens partageables par entreprise) — le
  cookie suffit pour ce besoin.
- Migration automatique d'anciennes invitations/sessions — le backfill
  couvre les données existantes, pas de rétro-compatibilité particulière à
  construire au-delà.

## Tests

- Unitaires (Vitest) : schéma zod de `changerEntrepriseActive` (uuid requis).
- Migration : vérifier que le backfill `membre_entreprise` reproduit
  exactement les `(utilisateur_id, entreprise_id, role)` d'avant la
  migration (requête de contrôle avant/après sur l'environnement de test
  avant `db push` en production).
- Vérification manuelle navigateur (comme pour les modules précédents,
  `noubinao_pilote_tests_sorel`) : créer une 2e entreprise avec
  sorel.kone@gmail.com → switcher apparaît → bascule → AO de l'entreprise A
  invisibles dans l'entreprise B et inversement ; rejoindre ALYNIMO via le
  lien d'invitation déjà émis vers sorel.kone@gmail.com → doit maintenant
  réussir ; recliquer le même lien une fois membre → message "déjà membre
  de cette entreprise", pas une erreur.
- RLS : vérification manuelle via `supabase db query --linked` sur un
  échantillon de tables (pas les 94 une à une) — au minimum `appel_offres`,
  `document`, `storage.objects` (cas du cast `::uuid`), `utilisateur`
  (policy `utilisateur_select_membres` réécrite à la main).
