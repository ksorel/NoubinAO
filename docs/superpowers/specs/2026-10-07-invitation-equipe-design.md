# Invitation d'équipe — design

Date : 2026-10-07
Module roadmap : Tiers P2, "rôles/permissions" (voir `noubinao_roadmap_le_cap`)

## Problème

Chaque inscription appelle `creer_entreprise()` et crée systématiquement une
**nouvelle** entreprise avec l'utilisateur comme seul admin (colonne `role`
verrouillée à `'admin'` par un `check` constraint). Il n'existe aujourd'hui
aucun moyen de rattacher un deuxième utilisateur à une entreprise existante.
`listerUtilisateurs()` (module 5, assignation de responsable) suppose déjà
plusieurs membres, mais en pratique ce n'est atteignable que par insertion
manuelle en base.

## Décisions de cadrage (validées avec Sorel)

- Portée de ce module : **invitation d'équipe uniquement**. La restriction
  d'action par rôle est volontairement minimale (voir plus bas), pas une
  matrice de permissions complète.
- Canal d'invitation : **lien à partager**, généré dans l'appli, copié par
  l'admin et transmis par le moyen de son choix (WhatsApp, email perso...).
  Aucun email système — évite toute dépendance au mailer Supabase limité
  (~2-4 mails/h, voir `noubinao_mailer_rate_limit_resend_differe`).
- L'admin choisit le rôle (`admin` ou `membre`) au moment d'émettre
  l'invitation, pas un rôle fixe pour tout invité.
- Lien à durée de vie limitée : expire après 7 jours, révocable manuellement
  par un admin avant expiration.
- Restriction par rôle, scope retenu : `admin` seul peut gérer l'équipe
  (inviter, révoquer une invitation) et modifier le profil entreprise
  (`/parametres` → `ProfilEntrepriseCard`, secteurs, taux de frais de
  structure par défaut, compte email connecté). Un `membre` garde un accès
  complet au travail quotidien (AO, bibliothèque documentaire, dossiers de
  réponse) — cohérent avec la cible (petites équipes, tout le monde travaille
  les AO). Pas de permission par AO (lecture seule, assignation restreinte),
  pas de distinction plus fine pour le MVP.

## Modèle de données

### Migration : élargir `utilisateur.role`

```sql
alter table utilisateur drop constraint utilisateur_role_check;
alter table utilisateur add constraint utilisateur_role_check
  check (role in ('admin', 'membre'));
```

(Nom exact de la contrainte à vérifier à l'implémentation via
`\d utilisateur` ou `information_schema.table_constraints` — Postgres nomme
les `check` inline `<table>_<colonne>_check` par défaut, à confirmer plutôt
que supposé.)

### Nouvelle table `invitation_equipe`

| Colonne | Type | Note |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `entreprise_id` | uuid not null fk `entreprise(id)` on delete cascade | |
| `token` | text not null unique | généré côté serveur, aléatoire (ex. `crypto.randomUUID()` ou équivalent, assez d'entropie pour ne pas être deviné) |
| `role` | text not null check in (`admin`, `membre`) | rôle attribué à la jonction |
| `cree_par` | uuid not null fk `utilisateur(id)` on delete set null | |
| `statut` | text not null default `'en_attente'` check in (`en_attente`, `utilisee`, `revoquee`) | |
| `expire_at` | timestamptz not null default `now() + interval '7 days'` | |
| `utilisee_par` | uuid fk `utilisateur(id)` on delete set null, nullable | rempli à la jonction |
| `utilisee_at` | timestamptz nullable | |
| `created_at` | timestamptz not null default `now()` | |

Index : `invitation_equipe_entreprise_id_idx` sur `entreprise_id` (liste des
invitations d'une entreprise), index unique implicite sur `token` (lookup de
jonction).

### RLS `invitation_equipe`

- `select` : admin de l'entreprise (`exists` sur `utilisateur` avec
  `entreprise_id = invitation_equipe.entreprise_id and id = auth.uid() and
  role = 'admin'`). Un `membre` ne voit jamais la liste des invitations.
- `insert` : même condition admin, plus `with check` sur
  `cree_par = auth.uid()` (empêche d'attribuer la création à un autre
  utilisateur).
- `update` : même condition admin en `using`, **`with check` explicite**
  répétant la condition sur `entreprise_id` (piège connu, voir
  `noubinao_rls_with_check_gotcha` — sans `with check`, Postgres réutilise le
  `using`, ce qui laisserait réassigner `entreprise_id` à une autre
  entreprise lors d'une révocation). Pas de policy `delete` — les
  invitations utilisées/révoquées restent comme trace, pas de purge en V1.
- Aucune policy ne permet à l'invité (non encore rattaché) de lire la table
  directement — la validation du token passe exclusivement par le RPC
  `security definer` ci-dessous, pas par une requête `select` côté client.

### RPC `rejoindre_entreprise(p_token text, p_nom text) returns uuid`

Même patron que `creer_entreprise` (contourne le problème œuf-et-poule RLS :
l'appelant n'a pas encore de ligne `utilisateur`, donc aucune policy
normale ne le laisserait insérer) :

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
  if exists (select 1 from utilisateur where id = auth.uid()) then
    raise exception 'utilisateur_deja_rattache';
  end if;

  select * into v_invitation
  from invitation_equipe
  where token = p_token and statut = 'en_attente' and expire_at > now();

  if v_invitation is null then
    raise exception 'invitation_invalide';
  end if;

  insert into utilisateur (id, entreprise_id, nom, role)
  values (auth.uid(), v_invitation.entreprise_id, p_nom, v_invitation.role);

  update invitation_equipe
  set statut = 'utilisee', utilisee_par = auth.uid(), utilisee_at = now()
  where id = v_invitation.id;

  return v_invitation.entreprise_id;
end;
$$;

revoke all on function rejoindre_entreprise from public;
grant execute on function rejoindre_entreprise to authenticated;
```

Deux `raise exception` distincts (`utilisateur_deja_rattache`,
`invitation_invalide`) pour que la Server Action distingue les deux messages
d'erreur côté UI.

## Flux côté admin (`/parametres`)

- `obtenirUtilisateurCourant()` (`lib/utilisateur/queries.ts`) étendu pour
  sélectionner aussi `role` — nécessaire pour gater l'UI admin-only partout
  (cette page et les Server Actions de gestion d'équipe/profil entreprise).
- Nouvelle carte `EquipeCard`, affichée sur `/parametres` **seulement si**
  `utilisateur.role === 'admin'` (un `membre` ne voit pas la carte du tout,
  pas juste désactivée) :
  - Liste des membres actuels (`listerUtilisateurs`, existant, étendu pour
    retourner aussi `role` par membre — affichage simple, pas d'action de
    changement de rôle a posteriori en V1).
  - Liste des invitations `en_attente` non expirées de l'entreprise, avec
    bouton "Révoquer" (Server Action `revoquerInvitation(id)` → `update
    statut = 'revoquee'`).
  - Formulaire "Inviter un membre" : sélecteur de rôle (`admin`/`membre`) →
    Server Action `creerInvitation(role)` :
    - valide `role` (zod, enum `['admin', 'membre']`),
    - vérifie `utilisateur.role === 'admin'` côté serveur (défense en
      profondeur, en plus de la RLS),
    - génère le token, insère la ligne,
    - retourne `{ lien: "${APP_URL}/invitation/${token}" }`.
  - Lien affiché avec bouton "Copier" (`navigator.clipboard`) + toast Sonner
    de confirmation ("Lien copié").
- `ProfilEntrepriseCard`, secteurs (section A de veille), `compte-email-card`
  restent affichées uniquement si `role === 'admin'` — actuellement
  affichées à tout utilisateur rattaché, changement de comportement à
  appliquer dans ce module.

## Flux côté invité (`/invitation/[token]`)

Nouvelle route serveur `app/invitation/[token]/page.tsx` (hors du groupe
`(app)` — doit rester accessible sans navigation par sidebar, avant même que
l'utilisateur soit rattaché à une entreprise).

Séquence, dans l'ordre :

1. **Token introuvable, expiré, ou `statut !== 'en_attente'`** (vérifié par
   une lecture dédiée côté serveur avant même de tenter la jonction, pour
   afficher un message adapté plutôt que l'erreur générique du RPC) →
   message "Ce lien d'invitation est invalide ou a expiré.", pas de bouton
   de retry — l'admin doit émettre une nouvelle invitation.
2. **Utilisateur non authentifié** → écran avec deux liens :
   `/auth/login?next=/invitation/${token}` et
   `/auth/sign-up?next=/invitation/${token}`.
   - `LoginForm` et `SignUpForm` (`components/login-form.tsx`,
     `components/sign-up-form.tsx`) reçoivent un nouveau prop optionnel
     `redirectTo` (défaut `"/accueil"`, comportement actuel inchangé pour
     tout accès direct à `/auth/login` ou `/auth/sign-up`).
   - `LoginForm` : `router.push(redirectTo)` au lieu du `"/accueil"` câblé en
     dur.
   - `SignUpForm` : `emailRedirectTo: ${window.location.origin}${redirectTo}`
     au lieu du `/accueil` câblé en dur. Le template de confirmation Supabase
     utilise déjà ce chemin comme `next` dans le lien envoyé par email —
     `app/auth/confirm/route.ts` lit déjà `next` depuis les query params et y
     redirige après `verifyOtp`, aucun changement nécessaire de ce côté.
   - Les deux pages `app/auth/login/page.tsx` et `app/auth/sign-up/page.tsx`
     lisent `searchParams.next` et le passent en `redirectTo`.
3. **Authentifié, a déjà une ligne `utilisateur`** → message "Vous êtes déjà
   rattaché à une entreprise." (modèle mono-entreprise par utilisateur,
   cohérent avec le reste du produit — pas de changement d'entreprise ni de
   double rattachement en V1).
4. **Authentifié, pas de ligne `utilisateur`** → écran de confirmation :
   nom de l'entreprise (lu depuis l'invitation, jointure `entreprise`), rôle
   proposé, champ "Votre nom" (comme `creerEntreprise` demande
   `nomUtilisateur`) → Server Action `rejoindreEntreprise(token, nom)` :
   - zod sur `nom` (requis, max 200),
   - appelle le RPC `rejoindre_entreprise`,
   - sur `invitation_invalide` → message d'erreur affiché en place (le lien a
     pu être utilisé/révoqué entre l'affichage de la page et la soumission),
   - sur succès → `revalidatePath("/accueil", "layout")` puis
     `redirect("/accueil")`.

## Hors scope (confirmé)

- Pas de changement de rôle a posteriori pour un membre déjà rattaché (pas
  de "promouvoir en admin" depuis `EquipeCard`) — à ajouter plus tard si le
  besoin se présente réellement.
- Pas de retrait d'un membre existant de l'entreprise.
- Pas d'email automatique d'invitation.
- Pas de permission par AO (visibilité restreinte, assignation limitée).
- Pas de changement au flux `/accueil` existant (`creer_entreprise`) — reste
  le chemin pour toute inscription qui ne vient pas d'un lien d'invitation.

## Tests

- Unitaires (Vitest) : schémas zod (`creerInvitation`, `rejoindreEntreprise`),
  logique de validation de token côté page (expiré / révoqué / déjà utilisé
  / introuvable → bon message pour chacun).
- Migration : vérifier que l'ancien `check` constraint sur `role` est bien
  remplacé (pas seulement ajouté en doublon) et que `'membre'` est accepté.
- Vérification manuelle navigateur (parcours complet, pas seulement lecture
  de code, cf. `noubinao_pilote_tests_sorel`) : admin invite → copie lien →
  ouverture en navigation privée (ou second compte) → inscription → jonction
  → le nouveau membre apparaît dans `listerUtilisateurs` et dans
  `EquipeCard` ; révocation d'une invitation en attente rend le lien
  inopérant ; un `membre` ne voit pas `EquipeCard`/`ProfilEntrepriseCard` sur
  `/parametres`.
