# Invitation d'équipe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un admin NoubinAO d'ajouter un collègue à son entreprise existante via un lien d'invitation à partager (admin ou membre), et restreindre la gestion d'équipe + le profil entreprise aux admins.

**Architecture:** Nouvelle table `invitation_equipe` (token, rôle, expiration 7 jours, statut) + deux fonctions Postgres `security definer` (`rejoindre_entreprise`, `obtenir_invitation_publique`) qui contournent RLS pour un utilisateur qui n'a pas encore de ligne `utilisateur` — même patron que `creer_entreprise` existant. Le lien (`/invitation/[token]`) est public (le proxy d'auth doit l'exclure de la redirection vers `/auth/login`) ; la page distingue non-authentifié / déjà rattaché / jonction possible. `/parametres` gagne une carte `EquipeCard` (admin only) ; `ProfilEntrepriseCard` devient admin only.

**Tech Stack:** Next.js App Router (Server Actions), Supabase Postgres (migrations SQL, RLS, RPC `security definer`), zod, next-intl, shadcn/ui (Select, Button, Card), Vitest.

## Global Constraints

- Spec de référence : `docs/superpowers/specs/2026-10-07-invitation-equipe-design.md`.
- Canal d'invitation = lien à partager, aucun email système (voir `noubinao_mailer_rate_limit_resend_differe`).
- Admin choisit le rôle (`admin`/`membre`) à l'émission de l'invitation.
- Lien expire après 7 jours, révocable manuellement par un admin.
- Admin-only : gestion d'équipe (`EquipeCard`), `ProfilEntrepriseCard`. **Pas** `compte-email-card` (connexion Gmail personnelle, par utilisateur) ni `TauxFraisStructureCard` — restent visibles à tous les rôles.
- Toute Server Action de gestion d'équipe/profil entreprise revérifie `role === 'admin'` côté serveur (défense en profondeur, ne jamais se fier au seul rendu conditionnel côté UI).
- **Migration SQL (Task 1) : l'implémenteur ne doit JAMAIS exécuter `npx supabase db push` lui-même.** Écrire et committer le fichier de migration seulement. Le contrôleur applique la migration séparément après revue humaine (voir `feedback_subagent_infra_actions` — une action modifiant l'infra Supabase réelle ne doit jamais partir sur l'initiative d'un subagent).
- Toute nouvelle chaîne visible sur `/parametres` passe par next-intl (`messages/fr.json` + `messages/en.json`, clé `Parametres.equipe`). La page `/invitation/[token]` suit la convention des pages `/auth/*` existantes : texte français en dur, pas de next-intl (ces pages n'en utilisent pas aujourd'hui).
- Types TS des tables Supabase en snake_case, miroir exact des colonnes (convention déjà en place : `Entreprise`, `MembreGroupement`), jamais de renommage camelCase.
- Après chaque task : `npx tsc --noEmit` doit passer, `npx eslint .` ne doit pas introduire de nouvelle erreur sur les fichiers touchés, commit avec message conventionnel (`feat(...)`/`fix(...)`).

---

## Task 1 : Migration — rôle élargi, `invitation_equipe`, RLS, RPCs

**Files:**
- Create: `supabase/migrations/<timestamp>_invitation_equipe.sql` (timestamp généré par la CLI, voir Step 1)

**Interfaces:**
- Produces : table `invitation_equipe(id, entreprise_id, token, role, cree_par, statut, expire_at, utilisee_par, utilisee_at, created_at)` ; contrainte `utilisateur.role` élargie à `('admin', 'membre')` ; RPC `rejoindre_entreprise(p_token text, p_nom text) returns uuid` ; RPC `obtenir_invitation_publique(p_token text) returns table(entreprise_nom text, role text, valide boolean)`. Task 2 consomme ces noms exacts.

- [ ] **Step 1 : Créer le fichier de migration**

Run: `npx supabase migration new invitation_equipe`

Note le chemin généré (ex. `supabase/migrations/20261007143000_invitation_equipe.sql`) — c'est ce fichier qu'on édite au step suivant.

- [ ] **Step 2 : Écrire le contenu SQL**

```sql
-- Élargit utilisateur.role pour admettre 'membre', et ajoute l'invitation
-- d'équipe (lien à partager, pas d'email système) — voir
-- docs/superpowers/specs/2026-10-07-invitation-equipe-design.md

-- Le nom de la contrainte check inline d'origine (20260822124743) n'est pas
-- garanti ("utilisateur_role_check" par convention Postgres, pas vérifié) :
-- on la retrouve dynamiquement plutôt que de supposer son nom.
do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = con.conrelid
  where rel.relname = 'utilisateur'
    and con.contype = 'c'
    and att.attname = 'role'
    and att.attnum = any(con.conkey);

  if v_constraint_name is not null then
    execute format('alter table utilisateur drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table utilisateur add constraint utilisateur_role_check
  check (role in ('admin', 'membre'));

create table invitation_equipe (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references entreprise(id) on delete cascade,
  token text not null unique,
  role text not null check (role in ('admin', 'membre')),
  cree_par uuid references utilisateur(id) on delete set null,
  statut text not null default 'en_attente'
    check (statut in ('en_attente', 'utilisee', 'revoquee')),
  expire_at timestamptz not null default (now() + interval '7 days'),
  utilisee_par uuid references utilisateur(id) on delete set null,
  utilisee_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitation_equipe_entreprise_id_idx
  on invitation_equipe(entreprise_id);

alter table invitation_equipe enable row level security;

create policy "invitation_equipe_select_admin" on invitation_equipe
  for select using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

create policy "invitation_equipe_insert_admin" on invitation_equipe
  for insert with check (
    cree_par = auth.uid()
    and exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

-- "with check" explicite (pas seulement "using") : sans lui Postgres réutilise
-- le "using" pour les nouvelles valeurs de la ligne, ce qui permettrait de
-- réassigner entreprise_id à une entreprise où l'appelant n'est pas admin
-- lors d'une révocation. Voir noubinao_rls_with_check_gotcha.
create policy "invitation_equipe_update_admin" on invitation_equipe
  for update using (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from utilisateur u
      where u.entreprise_id = invitation_equipe.entreprise_id
        and u.id = auth.uid()
        and u.role = 'admin'
    )
  );

-- Jonction : contourne RLS (l'appelant n'a pas encore de ligne utilisateur,
-- même patron que creer_entreprise) et marque l'invitation utilisée de
-- façon atomique.
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

-- Lecture publique minimale (nom entreprise + rôle proposé + validité) pour
-- afficher l'écran de confirmation avant jonction, sans exposer la table
-- invitation_equipe via RLS à un utilisateur qui n'est pas encore membre.
-- Accessible à "anon" : un visiteur non connecté doit pouvoir savoir que son
-- lien est invalide avant même qu'on lui propose de se connecter.
create or replace function obtenir_invitation_publique(p_token text)
returns table (entreprise_nom text, role text, valide boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation invitation_equipe;
begin
  select * into v_invitation from invitation_equipe where token = p_token;

  if v_invitation is null then
    return query select null::text, null::text, false;
    return;
  end if;

  return query
  select e.nom, v_invitation.role,
    (v_invitation.statut = 'en_attente' and v_invitation.expire_at > now())
  from entreprise e
  where e.id = v_invitation.entreprise_id;
end;
$$;

revoke all on function obtenir_invitation_publique from public;
grant execute on function obtenir_invitation_publique to anon, authenticated;
```

- [ ] **Step 3 : Relecture manuelle du fichier**

Vérifier : parenthèses équilibrées, chaque `create policy`/`create or replace function` se termine par `;`, les deux `grant execute` listent les bons rôles (`authenticated` seul pour `rejoindre_entreprise`, `anon, authenticated` pour `obtenir_invitation_publique`). **Ne pas exécuter `npx supabase db push` ou `npx supabase db query` à ce stade** — ce sera fait séparément par le contrôleur après revue.

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/
git commit -m "feat(utilisateur): migration invitation d'équipe (rôle membre, table invitation_equipe, RPCs)"
```

**Note pour le contrôleur (pas un step d'implémenteur) :** après revue de ce fichier, exécuter toi-même `npx supabase db push`, puis vérifier :
```bash
npx supabase db query --linked "select conname from pg_constraint where conrelid = 'utilisateur'::regclass and contype = 'c';"
npx supabase db query --linked "select routine_name from information_schema.routines where routine_name in ('rejoindre_entreprise', 'obtenir_invitation_publique');"
```
Les Tasks 2 à 7 ci-dessous n'ont pas besoin que la migration soit déjà appliquée pour être écrites et typécheckées (`supabase.from("invitation_equipe")` n'est pas typé contre un schéma généré dans ce projet) — seule la vérification manuelle finale (Task 8) en dépend.

---

## Task 2 : Types + requêtes

**Files:**
- Modify: `lib/utilisateur/types.ts`
- Modify: `lib/utilisateur/queries.ts`

**Interfaces:**
- Consumes : table `invitation_equipe`, RPC `obtenir_invitation_publique` (Task 1).
- Produces : type `RoleUtilisateur`, type `Invitation { id, role, expire_at }` ; `obtenirUtilisateurCourant()` retourne désormais aussi `role: RoleUtilisateur` ; `listerUtilisateurs()` retourne désormais aussi `role: RoleUtilisateur` par membre ; nouvelles fonctions `listerInvitationsEnAttente(entrepriseId: string): Promise<Invitation[]>` et `obtenirInvitationPublique(token: string): Promise<{ entreprise_nom: string | null; role: RoleUtilisateur | null; valide: boolean }>`. Tasks 4 et 5 consomment ces signatures exactes.

- [ ] **Step 1 : Étendre `lib/utilisateur/types.ts`**

Ajouter en haut du fichier :

```ts
export type RoleUtilisateur = "admin" | "membre";

export interface Invitation {
  id: string;
  role: RoleUtilisateur;
  expire_at: string;
}
```

- [ ] **Step 2 : Étendre `obtenirUtilisateurCourant` et `listerUtilisateurs`**

Dans `lib/utilisateur/queries.ts`, remplacer :

```ts
export async function obtenirUtilisateurCourant(): Promise<{
  id: string;
  entreprise_id: string;
  nom: string;
} | null> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub as string | undefined;

  if (!userId) return null;

  const { data: utilisateur } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id, nom")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}

export async function listerUtilisateurs(
  entrepriseId: string,
): Promise<{ id: string; nom: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateur")
    .select("id, nom")
    .eq("entreprise_id", entrepriseId)
    .order("nom", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

par :

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
    .select("id, entreprise_id, nom, role")
    .eq("id", userId)
    .maybeSingle();

  return utilisateur;
}

export async function listerUtilisateurs(
  entrepriseId: string,
): Promise<{ id: string; nom: string; role: RoleUtilisateur }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("utilisateur")
    .select("id, nom, role")
    .eq("entreprise_id", entrepriseId)
    .order("nom", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
```

Et ajouter l'import en haut du fichier : `import type { Entreprise, Invitation, RoleUtilisateur } from "./types";` (remplace l'import existant qui ne listait que `Entreprise`).

- [ ] **Step 3 : Ajouter `listerInvitationsEnAttente` et `obtenirInvitationPublique`**

À la fin de `lib/utilisateur/queries.ts` :

```ts
export async function listerInvitationsEnAttente(
  entrepriseId: string,
): Promise<Invitation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitation_equipe")
    .select("id, role, expire_at")
    .eq("entreprise_id", entrepriseId)
    .eq("statut", "en_attente")
    .gt("expire_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Invitation[];
}

export async function obtenirInvitationPublique(
  token: string,
): Promise<{ entreprise_nom: string | null; role: RoleUtilisateur | null; valide: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("obtenir_invitation_publique", { p_token: token })
    .single();

  if (error || !data) {
    return { entreprise_nom: null, role: null, valide: false };
  }

  return {
    entreprise_nom: data.entreprise_nom,
    role: data.role as RoleUtilisateur | null,
    valide: data.valide,
  };
}
```

- [ ] **Step 4 : Typecheck**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 5 : Commit**

```bash
git add lib/utilisateur/types.ts lib/utilisateur/queries.ts
git commit -m "feat(utilisateur): étend les requêtes utilisateur pour le rôle et les invitations"
```

---

## Task 3 : Constructeur de lien d'invitation (pur, testé)

**Files:**
- Create: `lib/utilisateur/lien-invitation.ts`
- Test: `lib/utilisateur/lien-invitation.test.ts`

**Interfaces:**
- Produces : `construireLienInvitation(token: string): string`. Task 4 l'utilise.

- [ ] **Step 1 : Écrire le test (échoue d'abord, le fichier source n'existe pas)**

```ts
import { describe, expect, it, afterEach } from "vitest";
import { construireLienInvitation } from "./lien-invitation";

describe("construireLienInvitation", () => {
  const urlOriginale = process.env.APP_URL;

  afterEach(() => {
    if (urlOriginale === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = urlOriginale;
    }
  });

  it("utilise APP_URL quand défini", () => {
    process.env.APP_URL = "https://ao-pilot-nine.vercel.app";
    expect(construireLienInvitation("abc123")).toBe(
      "https://ao-pilot-nine.vercel.app/invitation/abc123",
    );
  });

  it("retombe sur localhost:3000 quand APP_URL est absent", () => {
    delete process.env.APP_URL;
    expect(construireLienInvitation("abc123")).toBe(
      "http://localhost:3000/invitation/abc123",
    );
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier qu'il échoue**

Run: `npx vitest run lib/utilisateur/lien-invitation.test.ts`
Expected: FAIL — `Cannot find module './lien-invitation'`.

- [ ] **Step 3 : Implémenter**

```ts
export function construireLienInvitation(token: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/invitation/${token}`;
}
```

- [ ] **Step 4 : Lancer le test, vérifier qu'il passe**

Run: `npx vitest run lib/utilisateur/lien-invitation.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5 : Commit**

```bash
git add lib/utilisateur/lien-invitation.ts lib/utilisateur/lien-invitation.test.ts
git commit -m "feat(utilisateur): construit le lien d'invitation d'équipe"
```

---

## Task 4 : Schémas zod + Server Actions

**Files:**
- Modify: `lib/utilisateur/schema.ts`
- Modify: `lib/utilisateur/actions.ts`
- Test: `lib/utilisateur/schema.test.ts`

**Interfaces:**
- Consumes : `RoleUtilisateur`, `Invitation` (Task 2), `construireLienInvitation` (Task 3), RPC `rejoindre_entreprise` (Task 1).
- Produces : `creerInvitation(input: { role: string }): Promise<{ erreur: string } | { succes: true; lien: string; invitation: Invitation }>`, `revoquerInvitation(id: string): Promise<{ erreur: string } | { succes: true }>`, `rejoindreEntreprise(formData: FormData): Promise<{ erreur: string } | undefined>` (redirige vers `/accueil` en cas de succès, ne retourne rien). Task 5 consomme `creerInvitation`/`revoquerInvitation`, Task 7 consomme `rejoindreEntreprise`.

- [ ] **Step 1 : Écrire les tests de schéma (échouent d'abord)**

Ajouter à `lib/utilisateur/schema.test.ts` :

```ts
import { creerInvitationSchema, rejoindreEntrepriseSchema } from "./schema";
```

(ajouter cet import en haut du fichier, à côté de l'import existant de `modifierProfilEntrepriseSchema`), puis ajouter à la fin du fichier :

```ts
describe("creerInvitationSchema", () => {
  it("accepte 'admin' et 'membre'", () => {
    expect(creerInvitationSchema.safeParse({ role: "admin" }).success).toBe(true);
    expect(creerInvitationSchema.safeParse({ role: "membre" }).success).toBe(true);
  });

  it("rejette un rôle hors de l'énumération", () => {
    expect(creerInvitationSchema.safeParse({ role: "super_admin" }).success).toBe(false);
  });
});

describe("rejoindreEntrepriseSchema", () => {
  it("rejette un token vide", () => {
    expect(
      rejoindreEntrepriseSchema.safeParse({ token: "", nom: "Jean Kouassi" }).success,
    ).toBe(false);
  });

  it("rejette un nom vide", () => {
    expect(
      rejoindreEntrepriseSchema.safeParse({ token: "abc123", nom: "" }).success,
    ).toBe(false);
  });

  it("accepte un token et un nom valides, et coupe les espaces du nom", () => {
    const resultat = rejoindreEntrepriseSchema.safeParse({
      token: "abc123",
      nom: "  Jean Kouassi  ",
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.nom).toBe("Jean Kouassi");
    }
  });
});
```

- [ ] **Step 2 : Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/utilisateur/schema.test.ts`
Expected: FAIL — `creerInvitationSchema`/`rejoindreEntrepriseSchema` non exportés.

- [ ] **Step 3 : Ajouter les schémas**

Dans `lib/utilisateur/schema.ts`, ajouter à la fin du fichier (pas d'import supplémentaire nécessaire — `z.enum` avec des littéraux suffit, `RoleUtilisateur` est la même union sous un autre nom) :

```ts
export const creerInvitationSchema = z.object({
  role: z.enum(["admin", "membre"]),
});
export type CreerInvitationInput = z.infer<typeof creerInvitationSchema>;

export const rejoindreEntrepriseSchema = z.object({
  token: z.string().trim().min(1, "Lien d'invitation invalide"),
  nom: z.string().trim().min(1, "Votre nom est requis").max(200),
});
export type RejoindreEntrepriseInput = z.infer<typeof rejoindreEntrepriseSchema>;
```

- [ ] **Step 4 : Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/utilisateur/schema.test.ts`
Expected: PASS (tous les tests, anciens et nouveaux).

- [ ] **Step 5 : Ajouter les Server Actions**

Dans `lib/utilisateur/actions.ts`, remplacer les imports en haut du fichier :

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "./queries";
import { modifierProfilEntrepriseSchema } from "./schema";
```

par :

```ts
"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "./queries";
import {
  modifierProfilEntrepriseSchema,
  creerInvitationSchema,
  rejoindreEntrepriseSchema,
} from "./schema";
import { construireLienInvitation } from "./lien-invitation";
import type { Invitation } from "./types";
```

Ajouter la vérification admin au début de `modifierProfilEntreprise`, juste après la vérification d'authentification existante :

```ts
export async function modifierProfilEntreprise(input: {
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representantLegalNom: string | null;
  representantLegalQualite: string | null;
  idu: string | null;
  telephone: string | null;
  email: string | null;
  secteursActivite: string[];
}): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const parsed = modifierProfilEntrepriseSchema.safeParse(input);
```

(le reste de la fonction ne change pas). Puis ajouter à la fin du fichier :

```ts
export async function creerInvitation(
  input: { role: string },
): Promise<{ erreur: string } | { succes: true; lien: string; invitation: Invitation }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const parsed = creerInvitationSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const token = randomUUID();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitation_equipe")
    .insert({
      entreprise_id: utilisateur.entreprise_id,
      token,
      role: parsed.data.role,
      cree_par: utilisateur.id,
    })
    .select("id, role, expire_at")
    .single();

  if (error || !data) {
    return { erreur: "Échec de la création de l'invitation. Réessayez." };
  }

  revalidatePath("/parametres");
  return {
    succes: true as const,
    lien: construireLienInvitation(token),
    invitation: data as Invitation,
  };
}

export async function revoquerInvitation(
  id: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitation_equipe")
    .update({ statut: "revoquee" })
    .eq("id", id)
    .eq("entreprise_id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la révocation. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function rejoindreEntreprise(
  formData: FormData,
): Promise<{ erreur: string } | undefined> {
  const parsed = rejoindreEntrepriseSchema.safeParse({
    token: formData.get("token"),
    nom: formData.get("nom"),
  });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rejoindre_entreprise", {
    p_token: parsed.data.token,
    p_nom: parsed.data.nom,
  });

  if (error) {
    if (error.message === "utilisateur_deja_rattache") {
      return { erreur: "Vous êtes déjà rattaché à une entreprise." };
    }
    return { erreur: "Ce lien d'invitation est invalide ou a expiré." };
  }

  revalidatePath("/accueil", "layout");
  redirect("/accueil");
}
```

- [ ] **Step 6 : Typecheck**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 7 : Commit**

```bash
git add lib/utilisateur/schema.ts lib/utilisateur/actions.ts lib/utilisateur/schema.test.ts
git commit -m "feat(utilisateur): server actions d'invitation d'équipe et gate admin sur le profil entreprise"
```

---

## Task 5 : i18n + `EquipeCard` + gating de `/parametres`

**Files:**
- Modify: `messages/fr.json`
- Modify: `messages/en.json`
- Create: `app/(app)/parametres/equipe-card.tsx`
- Modify: `app/(app)/parametres/page.tsx`

**Interfaces:**
- Consumes : `creerInvitation`, `revoquerInvitation` (Task 4), `RoleUtilisateur`, `Invitation` (Task 2), `listerUtilisateurs`, `listerInvitationsEnAttente` (Task 2).
- Produces : composant `EquipeCard({ membres, invitationsInitiales }: { membres: { id: string; nom: string; role: RoleUtilisateur }[]; invitationsInitiales: Invitation[] })`.

- [ ] **Step 1 : Ajouter les clés i18n**

Dans `messages/fr.json`, namespace `Parametres`, ajouter la clé `equipe` (au même niveau que `profilEntreprise`, `gmail`, etc.) :

```json
"equipe": {
  "titre": "Équipe",
  "description": "Gère les membres de ton entreprise et leurs invitations.",
  "sectionMembres": "Membres",
  "sectionInvitations": "Invitations en attente",
  "aucuneInvitation": "Aucune invitation en attente.",
  "roleAdmin": "Administrateur",
  "roleMembre": "Membre",
  "champRoleInvitation": "Rôle du membre invité",
  "boutonInviter": "Créer un lien d'invitation",
  "boutonCopier": "Copier",
  "boutonRevoquer": "Révoquer",
  "expireLe": "Expire le {date}",
  "toastInvitationCreee": "Invitation créée",
  "toastLienCopie": "Lien copié",
  "toastRevoquee": "Invitation révoquée"
}
```

(pas de clés d'erreur ici : comme `modifierProfilEntreprise` existant, les erreurs de Server Action restent en français en dur dans `actions.ts`, affichées via `toast.error(resultat.erreur)` directement — convention déjà en place dans ce fichier, pas de régression à introduire.)

Dans `messages/en.json`, même namespace :

```json
"equipe": {
  "titre": "Team",
  "description": "Manage your company's members and their invitations.",
  "sectionMembres": "Members",
  "sectionInvitations": "Pending invitations",
  "aucuneInvitation": "No pending invitations.",
  "roleAdmin": "Administrator",
  "roleMembre": "Member",
  "champRoleInvitation": "Invited member's role",
  "boutonInviter": "Create an invitation link",
  "boutonCopier": "Copy",
  "boutonRevoquer": "Revoke",
  "expireLe": "Expires on {date}",
  "toastInvitationCreee": "Invitation created",
  "toastLienCopie": "Link copied",
  "toastRevoquee": "Invitation revoked"
}
```

- [ ] **Step 2 : Créer `app/(app)/parametres/equipe-card.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { creerInvitation, revoquerInvitation } from "@/lib/utilisateur/actions";
import type { Invitation, RoleUtilisateur } from "@/lib/utilisateur/types";

export function EquipeCard({
  membres,
  invitationsInitiales,
}: {
  membres: { id: string; nom: string; role: RoleUtilisateur }[];
  invitationsInitiales: Invitation[];
}) {
  const t = useTranslations("Parametres.equipe");
  const formatter = useFormatter();
  const [invitations, setInvitations] = useState(invitationsInitiales);
  const [role, setRole] = useState<RoleUtilisateur>("membre");
  const [envoi, setEnvoi] = useState(false);
  const [lienGenere, setLienGenere] = useState<string | null>(null);
  const [revocationEnCoursId, setRevocationEnCoursId] = useState<string | null>(null);

  function libelleRole(r: RoleUtilisateur) {
    return r === "admin" ? t("roleAdmin") : t("roleMembre");
  }

  async function creer() {
    setEnvoi(true);
    const resultat = await creerInvitation({ role });
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setLienGenere(resultat.lien);
    setInvitations((liste) => [resultat.invitation, ...liste]);
    toast.success(t("toastInvitationCreee"));
  }

  async function copier(lien: string) {
    await navigator.clipboard.writeText(lien);
    toast.success(t("toastLienCopie"));
  }

  async function revoquer(id: string) {
    setRevocationEnCoursId(id);
    const resultat = await revoquerInvitation(id);
    setRevocationEnCoursId(null);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    setInvitations((liste) => liste.filter((invitation) => invitation.id !== id));
    toast.success(t("toastRevoquee"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("sectionMembres")}</h3>
          <ul className="flex flex-col gap-2">
            {membres.map((membre) => (
              <li
                key={membre.id}
                className="flex items-center justify-between gap-2 border-b pb-2 text-sm"
              >
                <span>{membre.nom}</span>
                <span className="text-muted-foreground">{libelleRole(membre.role)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("sectionInvitations")}</h3>
          {invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("aucuneInvitation")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-2 border-b pb-2 text-sm"
                >
                  <span>
                    {libelleRole(invitation.role)} —{" "}
                    {t("expireLe", {
                      date: formatter.dateTime(new Date(invitation.expire_at), {
                        dateStyle: "short",
                      }),
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => revoquer(invitation.id)}
                    disabled={revocationEnCoursId !== null}
                  >
                    {revocationEnCoursId === invitation.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {t("boutonRevoquer")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="invitation-role">{t("champRoleInvitation")}</Label>
            <Select value={role} onValueChange={(valeur) => setRole(valeur as RoleUtilisateur)}>
              <SelectTrigger id="invitation-role" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="membre">{t("roleMembre")}</SelectItem>
                <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={creer} disabled={envoi}>
            {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("boutonInviter")}
          </Button>
        </div>

        {lienGenere && (
          <div className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span className="truncate">{lienGenere}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copier(lienGenere)}
            >
              {t("boutonCopier")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3 : Gater `/parametres`**

Remplacer le contenu de `app/(app)/parametres/page.tsx` :

```tsx
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  obtenirUtilisateurCourant,
  obtenirTauxFraisStructureDefaut,
  obtenirEntreprise,
  listerUtilisateurs,
  listerInvitationsEnAttente,
} from "@/lib/utilisateur/queries";
import { obtenirCompteEmailConnecte } from "@/lib/email/queries";
import { AnnoncerFilAriane } from "@/components/annoncer-fil-ariane";
import { CompteEmailCard } from "./compte-email-card";
import { ProfilEntrepriseCard } from "./profil-entreprise-card";
import { TauxFraisStructureCard } from "./taux-frais-structure-card";
import { EquipeCard } from "./equipe-card";
import { ToastConnexion } from "./toast-connexion";

export default async function ParametresPage({
  searchParams,
}: {
  searchParams: Promise<{ succes?: string; erreur?: string }>;
}) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) redirect("/auth/login");

  const estAdmin = utilisateur.role === "admin";

  const { succes, erreur } = await searchParams;
  const [compte, tauxFraisStructureDefaut, entreprise, membres, invitations] = await Promise.all([
    obtenirCompteEmailConnecte(utilisateur.id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
    obtenirEntreprise(utilisateur.entreprise_id),
    estAdmin ? listerUtilisateurs(utilisateur.entreprise_id) : Promise.resolve([]),
    estAdmin ? listerInvitationsEnAttente(utilisateur.entreprise_id) : Promise.resolve([]),
  ]);
  const t = await getTranslations("Parametres.page");

  return (
    <div className="flex flex-col gap-6">
      <AnnoncerFilAriane items={[{ label: t("filAriane") }]} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("titre")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ToastConnexion succes={succes ?? null} erreur={erreur ?? null} />
      <CompteEmailCard compte={compte} />
      {estAdmin && <ProfilEntrepriseCard entreprise={entreprise} />}
      <TauxFraisStructureCard tauxInitial={tauxFraisStructureDefaut} />
      {estAdmin && <EquipeCard membres={membres} invitationsInitiales={invitations} />}
    </div>
  );
}
```

- [ ] **Step 4 : Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint app/\(app\)/parametres/ messages/`
Expected: aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add messages/fr.json messages/en.json "app/(app)/parametres/equipe-card.tsx" "app/(app)/parametres/page.tsx"
git commit -m "feat(parametres): carte équipe (invitations) et restriction admin du profil entreprise"
```

---

## Task 6 : Proxy d'auth + `redirectTo` sur login/signup

**Files:**
- Modify: `lib/supabase/proxy.ts`
- Modify: `components/login-form.tsx`
- Modify: `components/sign-up-form.tsx`
- Modify: `app/auth/login/page.tsx`
- Modify: `app/auth/sign-up/page.tsx`

**Interfaces:**
- Produces : `LoginForm({ redirectTo }: { redirectTo?: string })`, `SignUpForm({ redirectTo }: { redirectTo?: string })` (toutes deux retombent sur `/accueil` si `redirectTo` est absent). Task 7 s'appuie sur le fait que `/invitation/[token]` n'est plus intercepté par le proxy pour un visiteur non authentifié.

- [ ] **Step 1 : Exclure `/invitation` du proxy d'auth**

Dans `lib/supabase/proxy.ts`, remplacer :

```ts
  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
```

par :

```ts
  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/invitation")
  ) {
```

(sans cette exclusion, un visiteur non connecté arrivant sur `/invitation/[token]` serait redirigé vers `/auth/login` avant même d'atteindre la page, perdant le token — c'est la page elle-même, Task 7, qui gère la redirection avec `?next=`.)

- [ ] **Step 2 : `redirectTo` sur `LoginForm`**

Dans `components/login-form.tsx`, remplacer la signature :

```ts
export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
```

par :

```ts
export function LoginForm({
  className,
  redirectTo = "/accueil",
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { redirectTo?: string }) {
```

et remplacer `router.push("/accueil");` par `router.push(redirectTo);`.

- [ ] **Step 3 : `redirectTo` sur `SignUpForm`**

Dans `components/sign-up-form.tsx`, même changement de signature :

```ts
export function SignUpForm({
  className,
  redirectTo = "/accueil",
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { redirectTo?: string }) {
```

et remplacer :

```ts
          emailRedirectTo: `${window.location.origin}/accueil`,
```

par :

```ts
          emailRedirectTo: `${window.location.origin}${redirectTo}`,
```

- [ ] **Step 4 : Lire `?next=` dans les pages d'auth**

Remplacer `app/auth/login/page.tsx` :

```tsx
import { LoginForm } from "@/components/login-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = next && next.startsWith("/") ? next : undefined;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
```

Remplacer `app/auth/sign-up/page.tsx` :

```tsx
import { SignUpForm } from "@/components/sign-up-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const redirectTo = next && next.startsWith("/") ? next : undefined;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
```

(`next.startsWith("/")` : garde-fou contre un open redirect — `next` vient d'un paramètre de requête, donc non fiable ; seul un chemin relatif interne est accepté, sinon on retombe sur le défaut `/accueil` du composant.)

- [ ] **Step 5 : Typecheck**

Run: `npx tsc --noEmit`
Expected: aucune nouvelle erreur.

- [ ] **Step 6 : Commit**

```bash
git add lib/supabase/proxy.ts components/login-form.tsx components/sign-up-form.tsx app/auth/login/page.tsx app/auth/sign-up/page.tsx
git commit -m "feat(auth): redirection post-connexion configurable (next) pour le flux d'invitation"
```

---

## Task 7 : Page `/invitation/[token]`

**Files:**
- Create: `app/invitation/[token]/page.tsx`
- Create: `app/invitation/[token]/invitation-form.tsx`

**Interfaces:**
- Consumes : `obtenirInvitationPublique`, `obtenirUtilisateurCourant` (Task 2), `rejoindreEntreprise` (Task 4), `createClient` (`lib/supabase/server.ts`, existant), proxy n'intercepte plus `/invitation` (Task 6).

- [ ] **Step 1 : Créer `app/invitation/[token]/invitation-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { rejoindreEntreprise } from "@/lib/utilisateur/actions";

export function InvitationForm({ token }: { token: string }) {
  const [resultat, envoyer, envoi] = useActionState(
    async (_etatPrecedent: { erreur: string } | undefined, formData: FormData) =>
      rejoindreEntreprise(formData),
    undefined,
  );

  return (
    <form action={envoyer} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="nom">Votre nom</Label>
        <Input id="nom" name="nom" required />
      </div>
      {resultat && "erreur" in resultat && (
        <p className="text-sm text-destructive">{resultat.erreur}</p>
      )}
      <Button type="submit" disabled={envoi}>
        {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
        {envoi ? "Jonction..." : "Rejoindre l'entreprise"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2 : Créer `app/invitation/[token]/page.tsx`**

```tsx
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { obtenirInvitationPublique, obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { InvitationForm } from "./invitation-form";

function PageShell({
  titre,
  description,
  children,
}: {
  titre: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{titre}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          {children && <CardContent>{children}</CardContent>}
        </Card>
      </div>
    </div>
  );
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await obtenirInvitationPublique(token);

  if (!invitation.valide) {
    return (
      <PageShell titre="Invitation invalide">
        <p className="text-sm text-muted-foreground">
          Ce lien d&apos;invitation est invalide ou a expiré. Demande à l&apos;administrateur de
          ton entreprise d&apos;en créer un nouveau.
        </p>
      </PageShell>
    );
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const estAuthentifie = Boolean(authData?.claims?.sub);

  if (!estAuthentifie) {
    return (
      <PageShell
        titre={`Rejoindre ${invitation.entreprise_nom}`}
        description="Connecte-toi ou crée un compte pour accepter cette invitation."
      >
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href={`/auth/login?next=/invitation/${token}`}>Se connecter</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/auth/sign-up?next=/invitation/${token}`}>Créer un compte</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const utilisateur = await obtenirUtilisateurCourant();
  if (utilisateur) {
    return (
      <PageShell titre="Déjà rattaché">
        <p className="text-sm text-muted-foreground">
          Tu es déjà rattaché à une entreprise. Un compte NoubinAO ne peut appartenir qu&apos;à
          une seule entreprise à la fois.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell
      titre={`Rejoindre ${invitation.entreprise_nom}`}
      description={`Tu vas rejoindre en tant que ${
        invitation.role === "admin" ? "administrateur" : "membre"
      }.`}
    >
      <InvitationForm token={token} />
    </PageShell>
  );
}
```

- [ ] **Step 3 : Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint app/invitation/`
Expected: aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add app/invitation/
git commit -m "feat(invitation): page de jonction à une entreprise via lien d'invitation"
```

---

## Task 8 : Vérification manuelle de bout en bout

Pas un commit de code — checklist de vérification navigateur (ne pas se contenter d'une lecture de code, cf. `noubinao_pilote_tests_sorel`).

Pré-requis : le contrôleur a appliqué et vérifié la migration du Task 1 (voir note dans ce Task) avant de commencer cette checklist.

- [ ] **1. Migration appliquée** : `npx supabase db query --linked "select role from utilisateur limit 1;"` ne renvoie pas d'erreur, et une tentative d'insertion avec `role = 'membre'` ne déclenche plus le `check` constraint.
- [ ] **2. Admin invite** : connecté en tant qu'admin existant, `/parametres` affiche `EquipeCard`. Choisir "Membre", cliquer "Créer un lien d'invitation" → un lien `https://.../invitation/<token>` apparaît avec bouton "Copier". L'invitation apparaît dans "Invitations en attente" avec sa date d'expiration.
- [ ] **3. Jonction (nouveau compte)** : ouvrir le lien en navigation privée → écran "Se connecter / Créer un compte" (pas de redirection surprise vers `/auth/login` sans le lien). Créer un compte → email de confirmation (vérifiable via l'inbox de test Supabase locale, port 54324, si testé en local) → cliquer le lien de confirmation → atterrit sur l'écran de confirmation "Rejoindre [entreprise] en tant que membre" → entrer un nom → "Rejoindre l'entreprise" → redirige vers `/accueil`.
- [ ] **4. Le nouveau membre apparaît** : reconnecté en tant qu'admin, `/parametres` → `EquipeCard` liste bien le nouveau membre avec le rôle "Membre", et l'invitation a disparu de la liste "en attente" (elle est passée à `utilisee`).
- [ ] **5. Révocation** : créer une deuxième invitation, cliquer "Révoquer" → disparaît de la liste. Ouvrir son lien dans un autre navigateur/session → message "Ce lien d'invitation est invalide ou a expiré."
- [ ] **6. Gating membre** : connecté en tant que membre (pas admin), `/parametres` n'affiche ni `EquipeCard` ni `ProfilEntrepriseCard`, mais affiche toujours `CompteEmailCard` et `TauxFraisStructureCard`.
- [ ] **7. Déjà rattaché** : en étant connecté avec un compte qui a déjà une ligne `utilisateur`, ouvrir un lien d'invitation valide → message "Tu es déjà rattaché à une entreprise.", aucune jonction n'a lieu.
- [ ] **8. Onboarding existant intact** : une inscription normale (pas via lien d'invitation) continue de proposer "Créer mon entreprise" sur `/accueil`, comportement inchangé.
