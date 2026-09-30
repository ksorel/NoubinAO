# Notifications AO pertinents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une entreprise dont les secteurs configurés (`/parametres`)
matchent le secteur classé d'un nouvel avis scrapé reçoit une
notification in-app (icône cloche dans le header), visible et gérable
(lu/non-lu) par chaque utilisateur individuellement.

**Architecture:** Nouveau module `lib/veille/notifications.ts` : une
fonction pure (`construireLignesNotification`, fan-out entreprise →
utilisateurs) branchée dans une fonction impure
(`notifierAvisPertinents`) appelée depuis
`app/api/veille/marches-publics/sync/route.ts` juste après l'insertion
des avis `nouveaux`. Nouvelle table `notification` (RLS par
utilisateur). Nouveau domaine `lib/notifications/actions.ts` (Server
Actions RLS-bound) consommé par un nouveau composant client
`components/notification-bell.tsx`, intégré dans le header de
`app/(app)/layout.tsx`.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres
+ RLS), Vitest (TDD), shadcn/ui (nouveau wrapper `Popover` sur
`radix-ui`, déjà une dépendance du projet — aucun paquet à installer),
next-intl.

## Global Constraints

- Canal V1 : in-app seul, pas d'email (Resend non câblé, pas de domaine
  acheté — voir spec).
- Déclenchement immédiat à l'insertion d'un avis classé, pas de digest.
- Granularité par utilisateur (pas par entreprise) : chaque membre a son
  propre état lu/non-lu.
- Notification générée seulement si secteur configuré de l'entreprise
  ∩ secteur classé de l'avis — jamais pour une entreprise à 0 secteur
  configuré, jamais pour un avis non classé (`secteur` null).
- Clic sur une notification → redirection simple vers `/veille`, pas de
  deep-link.
- Popover : 10 notifications les plus récentes, bouton « tout marquer
  lu », pas de page dédiée.
- Commits conventionnels (`feat:`, `test:`), un commit par tâche.

---

### Task 1: Migration + fan-out pur (TDD)

**Files:**
- Create: `supabase/migrations/20260930100000_notification.sql`
- Create: `lib/veille/notifications.ts`
- Create: `lib/veille/notifications.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `export function construireLignesNotification(avisNouveaux: { id: string; secteur: string | null }[], entreprises: { id: string; secteursActivite: string[] }[], utilisateursParEntreprise: Map<string, string[]>): { utilisateur_id: string; avis_id: string }[]`
  - Table `notification` — consommée en Tâche 2 (insert), Tâche 3
    (Server Actions de lecture).

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260930100000_notification.sql

-- Notification in-app : un nouvel avis classé dans un secteur configuré
-- par l'entreprise génère une ligne par utilisateur de cette entreprise
-- (granularité par utilisateur, pas par entreprise — voir spec
-- 2026-09-30-notifications-veille-design.md). `on delete cascade` sur
-- avis_id : une notification disparaît automatiquement quand son avis
-- est purgé par le nettoyage quotidien existant de
-- app/api/veille/marches-publics/sync/route.ts (date_limite_remise_offres
-- échue) — aucune logique de nettoyage supplémentaire à écrire.
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

-- with check explicite : une policy "for update" sans lui réutilise
-- silencieusement using(), laissant utilisateur_id réécrivable (piège
-- déjà rencontré sur ce projet, voir mémoire
-- noubinao_rls_with_check_gotcha).
create policy "notification_update_self" on notification
  for update using (utilisateur_id = auth.uid())
  with check (utilisateur_id = auth.uid());

-- Pas de policy insert/delete pour authenticated : l'écriture se fait
-- uniquement via le route handler service-role (voir
-- lib/veille/notifications.ts, notifierAvisPertinents), la suppression
-- uniquement par cascade.
```

- [ ] **Step 2: Appliquer la migration**

Run: `npx supabase db push`
Expected: `Applying migration 20260930100000_notification.sql...` puis `Finished supabase db push.`

- [ ] **Step 3: Écrire les tests (échouent, le module n'existe pas encore)**

```typescript
// lib/veille/notifications.test.ts
import { describe, expect, it } from "vitest";
import { construireLignesNotification } from "./notifications";

describe("construireLignesNotification", () => {
  it("notifie les utilisateurs d'une entreprise dont un secteur matche", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: "btp" }];
    const entreprises = [{ id: "ent-1", secteursActivite: ["btp", "ingenierie"] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1", "user-2"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toEqual(
      expect.arrayContaining([
        { utilisateur_id: "user-1", avis_id: "avis-1" },
        { utilisateur_id: "user-2", avis_id: "avis-1" },
      ]),
    );
    expect(lignes).toHaveLength(2);
  });

  it("ignore un avis non classé (secteur null)", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: null }];
    const entreprises = [{ id: "ent-1", secteursActivite: ["btp"] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toHaveLength(0);
  });

  it("ignore une entreprise dont aucun secteur configuré ne matche", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: "energie_climat" }];
    const entreprises = [{ id: "ent-1", secteursActivite: ["btp", "ingenierie"] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toHaveLength(0);
  });

  it("ignore une entreprise sans secteur configuré (0 sur 4)", () => {
    const avisNouveaux = [{ id: "avis-1", secteur: "btp" }];
    const entreprises = [{ id: "ent-1", secteursActivite: [] }];
    const utilisateursParEntreprise = new Map([["ent-1", ["user-1"]]]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toHaveLength(0);
  });

  it("fan-out sur plusieurs avis et plusieurs entreprises sans doublon croisé", () => {
    const avisNouveaux = [
      { id: "avis-1", secteur: "btp" },
      { id: "avis-2", secteur: "environnement" },
    ];
    const entreprises = [
      { id: "ent-1", secteursActivite: ["btp"] },
      { id: "ent-2", secteursActivite: ["environnement"] },
    ];
    const utilisateursParEntreprise = new Map([
      ["ent-1", ["user-1"]],
      ["ent-2", ["user-2"]],
    ]);

    const lignes = construireLignesNotification(avisNouveaux, entreprises, utilisateursParEntreprise);

    expect(lignes).toEqual(
      expect.arrayContaining([
        { utilisateur_id: "user-1", avis_id: "avis-1" },
        { utilisateur_id: "user-2", avis_id: "avis-2" },
      ]),
    );
    expect(lignes).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Lancer les tests, vérifier qu'ils échouent**

Run: `npx vitest run lib/veille/notifications.test.ts`
Expected: FAIL — `Cannot find module './notifications'`

- [ ] **Step 5: Implémenter la fonction pure**

```typescript
// lib/veille/notifications.ts

export function construireLignesNotification(
  avisNouveaux: { id: string; secteur: string | null }[],
  entreprises: { id: string; secteursActivite: string[] }[],
  utilisateursParEntreprise: Map<string, string[]>,
): { utilisateur_id: string; avis_id: string }[] {
  const lignes: { utilisateur_id: string; avis_id: string }[] = [];

  for (const avis of avisNouveaux) {
    if (avis.secteur === null) continue;

    for (const entreprise of entreprises) {
      if (!entreprise.secteursActivite.includes(avis.secteur)) continue;

      const utilisateurs = utilisateursParEntreprise.get(entreprise.id) ?? [];
      for (const utilisateurId of utilisateurs) {
        lignes.push({ utilisateur_id: utilisateurId, avis_id: avis.id });
      }
    }
  }

  return lignes;
}
```

- [ ] **Step 6: Lancer les tests, vérifier qu'ils passent**

Run: `npx vitest run lib/veille/notifications.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260930100000_notification.sql lib/veille/notifications.ts lib/veille/notifications.test.ts
git commit -m "feat(veille): table notification + fan-out pur par secteur"
```

---

### Task 2: Brancher le fan-out dans le route handler de scraping

**Files:**
- Modify: `lib/veille/notifications.ts`
- Modify: `app/api/veille/marches-publics/sync/route.ts`

**Interfaces:**
- Consumes: `construireLignesNotification` (Tâche 1) ; `createServiceRoleClient` (`@/lib/supabase/service-role`, existant).
- Produces: `export async function notifierAvisPertinents(supabase: ReturnType<typeof createServiceRoleClient>, avisNouveaux: { id: string; secteur: string | null }[]): Promise<void>` — appelée depuis le route handler (Tâche 2) et depuis le script de vérification manuelle (Step 5 de cette tâche).

Pas de test unitaire sur cette fonction ni sur le route handler —
cohérent avec le reste du projet (aucune fonction de requête Supabase
testée directement dans `lib/veille/`, voir spec).

- [ ] **Step 1: Ajouter `notifierAvisPertinents` à `lib/veille/notifications.ts`**

Ajouter en haut du fichier, après les exports existants :

```typescript
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type ClientServiceRole = ReturnType<typeof createServiceRoleClient>;

// Impure : lit entreprise/utilisateur en base puis écrit dans
// notification. Séparée du route handler pour rester appelable
// directement depuis un script tsx de vérification manuelle (voir
// plan, Tâche 2 Step 5) — le route handler exige une signature QStash
// valide, non reproductible facilement en local.
export async function notifierAvisPertinents(
  supabase: ClientServiceRole,
  avisNouveaux: { id: string; secteur: string | null }[],
): Promise<void> {
  const secteursDistincts = [
    ...new Set(
      avisNouveaux
        .map((a) => a.secteur)
        .filter((s): s is string => s !== null),
    ),
  ];
  if (secteursDistincts.length === 0) return;

  const { data: entreprises, error: erreurEntreprises } = await supabase
    .from("entreprise")
    .select("id, secteurs_activite")
    .overlaps("secteurs_activite", secteursDistincts);
  if (erreurEntreprises) throw erreurEntreprises;
  if (!entreprises || entreprises.length === 0) return;

  const entrepriseIds = entreprises.map((e) => e.id as string);
  const { data: utilisateurs, error: erreurUtilisateurs } = await supabase
    .from("utilisateur")
    .select("id, entreprise_id")
    .in("entreprise_id", entrepriseIds);
  if (erreurUtilisateurs) throw erreurUtilisateurs;

  const utilisateursParEntreprise = new Map<string, string[]>();
  for (const u of utilisateurs ?? []) {
    const liste = utilisateursParEntreprise.get(u.entreprise_id as string) ?? [];
    liste.push(u.id as string);
    utilisateursParEntreprise.set(u.entreprise_id as string, liste);
  }

  const lignes = construireLignesNotification(
    avisNouveaux,
    entreprises.map((e) => ({
      id: e.id as string,
      secteursActivite: (e.secteurs_activite as string[]) ?? [],
    })),
    utilisateursParEntreprise,
  );
  if (lignes.length === 0) return;

  const { error: erreurNotification } = await supabase.from("notification").insert(lignes);
  if (erreurNotification) throw erreurNotification;
}
```

- [ ] **Step 2: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 3: Brancher l'appel dans le route handler**

Dans `app/api/veille/marches-publics/sync/route.ts`, ajouter l'import
en haut du fichier (après les imports existants de `@/lib/veille/marches-publics`) :

```typescript
import { notifierAvisPertinents } from "@/lib/veille/notifications";
```

Remplacer le bloc d'insertion des `nouveaux` :

```typescript
    if (nouveaux.length > 0) {
      const { error: erreurInsertion } = await supabase
        .from("avis_ao_national")
        .insert(nouveaux.map(construireLigneInsertion));
      if (erreurInsertion) throw erreurInsertion;
    }
```

par :

```typescript
    if (nouveaux.length > 0) {
      const { data: lignesInserees, error: erreurInsertion } = await supabase
        .from("avis_ao_national")
        .insert(nouveaux.map(construireLigneInsertion))
        .select("id, secteur");
      if (erreurInsertion) throw erreurInsertion;

      // Fan-out entreprise → utilisateurs par secteur (voir
      // lib/veille/notifications.ts). Pas de transaction explicite
      // enveloppant cet appel et l'insert ci-dessus — même profil de
      // risque que le reste de ce handler (purge, mise à jour) : un
      // échec ici après l'insert des avis fait retomber le prochain
      // run sur "existants" pour ces avis, perdant silencieusement
      // l'opportunité de notification (pas l'avis lui-même, toujours
      // visible dans /veille) — accepté, voir spec.
      await notifierAvisPertinents(supabase, lignesInserees ?? []);
    }
```

- [ ] **Step 4: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5: Vérification manuelle du fan-out (bypass QStash)**

Le route handler exige une signature QStash valide, non reproductible
facilement en local — on vérifie ici `notifierAvisPertinents`
directement, comme le pipeline de scraping l'a déjà fait pour sa propre
logique (voir `docs/superpowers/plans/2026-09-29-veille-marches-publics.md`).

Préalable : sur un compte de test, aller sur `/parametres` et cocher un
secteur (ex. « BTP ») si ce n'est pas déjà fait depuis la vérification
du sous-projet A.

```bash
npx tsx -e "
import { createServiceRoleClient } from './lib/supabase/service-role';
import { notifierAvisPertinents } from './lib/veille/notifications';

async function main() {
  const supabase = createServiceRoleClient();

  const { data: avis, error } = await supabase
    .from('avis_ao_national')
    .insert({
      reference: 'TEST-NOTIF-1',
      objet: 'Travaux de construction d\'un bâtiment scolaire (test notif)',
      secteur: 'btp',
      texte_brut: null,
      bomp_numero_id: null,
    })
    .select('id, secteur')
    .single();
  if (error) throw error;

  await notifierAvisPertinents(supabase, [avis]);

  const { data: notifs } = await supabase
    .from('notification')
    .select('id, utilisateur_id, avis_id')
    .eq('avis_id', avis.id);
  console.log('Notifications créées :', notifs);

  // Nettoyage — la suppression de l'avis cascade sur notification.
  await supabase.from('avis_ao_national').delete().eq('id', avis.id);
}

main();
"
```

Expected: `Notifications créées :` liste une ligne par utilisateur du
compte de test coché « BTP ». Si la liste est vide, vérifier que le
compte de test a bien un secteur configuré correspondant à `btp` dans
`entreprise.secteurs_activite`.

- [ ] **Step 6: Commit**

```bash
git add lib/veille/notifications.ts "app/api/veille/marches-publics/sync/route.ts"
git commit -m "feat(veille): notifie les entreprises d'un nouvel avis pertinent"
```

---

### Task 3: Lecture et actions côté client (Server Actions)

**Files:**
- Create: `lib/notifications/types.ts`
- Create: `lib/notifications/actions.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`, existant), `obtenirUtilisateurCourant` (`@/lib/utilisateur/queries`, existant).
- Produces:
  - `export interface NotificationAvecAvis { id: string; lu: boolean; cree_le: string; avis: { objet: string | null; autorite_contractante: string | null } | null }`
  - `export async function listerNotifications(): Promise<{ notifications: NotificationAvecAvis[]; nonLues: number }>`
  - `export async function marquerNotificationLue(id: string): Promise<void>`
  - `export async function marquerToutesNotificationsLues(): Promise<void>`
  - Consommées en Tâche 4 (`components/notification-bell.tsx`).

Pas de test unitaire — cohérent avec le reste du projet (aucune
Server Action de requête Supabase testée directement).

- [ ] **Step 1: Créer les types**

```typescript
// lib/notifications/types.ts

export interface NotificationAvecAvis {
  id: string;
  lu: boolean;
  cree_le: string;
  // Nullable par prudence de typage (voir app/(app)/layout.tsx pour le
  // même patron sur un embed Supabase) : en pratique toujours présent,
  // avis_id est not null et notification est supprimée en cascade si
  // l'avis l'est.
  avis: {
    objet: string | null;
    autorite_contractante: string | null;
  } | null;
}
```

- [ ] **Step 2: Créer les Server Actions**

```typescript
// lib/notifications/actions.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import type { NotificationAvecAvis } from "./types";

export async function listerNotifications(): Promise<{
  notifications: NotificationAvecAvis[];
  nonLues: number;
}> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { notifications: [], nonLues: 0 };

  const supabase = await createClient();

  const [{ data: notifications, error: erreurListe }, { count, error: erreurCompte }] =
    await Promise.all([
      supabase
        .from("notification")
        .select("id, lu, cree_le, avis:avis_id(objet, autorite_contractante)")
        .order("cree_le", { ascending: false })
        .limit(10),
      supabase
        .from("notification")
        .select("id", { count: "exact", head: true })
        .eq("lu", false),
    ]);

  if (erreurListe || erreurCompte) return { notifications: [], nonLues: 0 };

  // Voir app/(app)/layout.tsx pour le même recadrage de type : sans
  // générique Database, postgrest-js infère un embed plusieurs-à-un
  // comme un tableau par défaut, alors qu'il s'agit ici d'une relation
  // notification → avis_ao_national (un avis par notification).
  return {
    notifications: (notifications ?? []) as unknown as NotificationAvecAvis[],
    nonLues: count ?? 0,
  };
}

export async function marquerNotificationLue(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notification").update({ lu: true }).eq("id", id);
}

export async function marquerToutesNotificationsLues(): Promise<void> {
  const supabase = await createClient();
  await supabase.from("notification").update({ lu: true }).eq("lu", false);
}
```

- [ ] **Step 3: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Vérifier le lint**

Run: `npx eslint lib/notifications/types.ts lib/notifications/actions.ts`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/types.ts lib/notifications/actions.ts
git commit -m "feat(notifications): server actions de lecture et marquage lu"
```

---

### Task 4: Composant cloche + intégration header + i18n + vérification finale

**Files:**
- Create: `components/ui/popover.tsx`
- Create: `components/notification-bell.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `messages/fr.json`
- Modify: `messages/en.json`

**Interfaces:**
- Consumes: `listerNotifications`, `marquerNotificationLue`,
  `marquerToutesNotificationsLues`, `NotificationAvecAvis` (Tâche 3) ;
  `Button` (`@/components/ui/button`, existant), `cn`
  (`@/lib/utils`, existant).
- Produces: rien consommé par une tâche ultérieure — dernière tâche du
  plan.

- [ ] **Step 1: Créer le wrapper `Popover` (shadcn sur `radix-ui`, déjà une dépendance)**

```tsx
// components/ui/popover.tsx
"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-72 origin-[var(--radix-popover-content-transform-origin)] rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
```

- [ ] **Step 2: Créer `NotificationBell`**

```tsx
// components/notification-bell.tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  listerNotifications,
  marquerNotificationLue,
  marquerToutesNotificationsLues,
} from "@/lib/notifications/actions";
import type { NotificationAvecAvis } from "@/lib/notifications/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const t = useTranslations("Notifications");
  const [notifications, setNotifications] = useState<NotificationAvecAvis[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [, startTransition] = useTransition();

  useEffect(() => {
    listerNotifications()
      .then((resultat) => {
        setNotifications(resultat.notifications);
        setNonLues(resultat.nonLues);
      })
      .catch((erreur) => console.error("Échec du chargement des notifications", erreur));
  }, []);

  function marquerLue(id: string) {
    setNotifications((liste) => liste.map((n) => (n.id === id ? { ...n, lu: true } : n)));
    setNonLues((n) => Math.max(0, n - 1));
    startTransition(() => {
      marquerNotificationLue(id).catch((erreur) =>
        console.error("Échec du marquage lu", erreur),
      );
    });
  }

  function marquerToutesLues() {
    setNotifications((liste) => liste.map((n) => ({ ...n, lu: true })));
    setNonLues(0);
    startTransition(() => {
      marquerToutesNotificationsLues().catch((erreur) =>
        console.error("Échec du marquage tout lu", erreur),
      );
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t("ariaLabel", { count: nonLues })}
        >
          <Bell className="h-5 w-5" />
          {nonLues > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {nonLues > 9 ? "9+" : nonLues}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">{t("titre")}</span>
          {nonLues > 0 && (
            <Button variant="ghost" size="sm" onClick={marquerToutesLues}>
              {t("toutMarquerLu")}
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("vide")}</p>
          )}
          {notifications.map((notification) => (
            <Link
              key={notification.id}
              href="/veille"
              onClick={() => marquerLue(notification.id)}
              className={cn(
                "block border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent",
                !notification.lu && "bg-primary/5 font-medium",
              )}
            >
              <span className="flex items-center gap-2">
                {!notification.lu && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{notification.avis?.objet ?? t("avisSansObjet")}</span>
              </span>
              {notification.avis?.autorite_contractante && (
                <span className="block truncate pl-4 text-xs text-muted-foreground">
                  {notification.avis.autorite_contractante}
                </span>
              )}
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Intégrer dans le header**

Dans `app/(app)/layout.tsx`, ajouter l'import :

```typescript
import { NotificationBell } from "@/components/notification-bell";
```

Remplacer :

```tsx
              <UserMenu
                nomUtilisateur={utilisateur.nom}
                nomEntreprise={entreprise?.nom ?? ""}
              />
```

par :

```tsx
              <div className="flex items-center gap-1">
                <NotificationBell />
                <UserMenu
                  nomUtilisateur={utilisateur.nom}
                  nomEntreprise={entreprise?.nom ?? ""}
                />
              </div>
```

- [ ] **Step 4: Ajouter les traductions**

Dans `messages/fr.json`, ajouter un nouveau namespace après `"Secteurs"`
(dernier namespace du fichier — repérer `"Secteurs": { ... }` suivi de
la fermeture `}` finale du fichier) :

```json
  },
  "Notifications": {
    "ariaLabel": "Notifications ({count} non lues)",
    "titre": "Notifications",
    "toutMarquerLu": "Tout marquer lu",
    "vide": "Aucune notification",
    "avisSansObjet": "Nouvel avis"
  }
}
```

(le premier `},` referme le bloc `"Secteurs"` existant, inchangé — seul
le nouveau bloc `"Notifications"` et la fermeture finale du fichier
changent.)

Dans `messages/en.json`, même structure au même endroit :

```json
  },
  "Notifications": {
    "ariaLabel": "Notifications ({count} unread)",
    "titre": "Notifications",
    "toutMarquerLu": "Mark all as read",
    "vide": "No notifications",
    "avisSansObjet": "New notice"
  }
}
```

- [ ] **Step 5: Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 6: Vérifier le lint**

Run: `npx eslint components/ui/popover.tsx components/notification-bell.tsx "app/(app)/layout.tsx"`
Expected: aucune erreur.

- [ ] **Step 7: Lancer la suite de tests complète**

Run: `npx vitest run`
Expected: tous les tests passent, y compris les 5 nouveaux de
`lib/veille/notifications.test.ts`.

- [ ] **Step 8: Vérification manuelle en local**

Démarrer le serveur de dev (`npm run dev`). Se connecter avec un compte
de test dont l'entreprise a un secteur configuré (ex. « BTP »).

1. Reprendre le script de la Tâche 2 Step 5 (insertion d'un avis test
   `secteur: 'btp'` + `notifierAvisPertinents`), **sans la ligne finale
   de nettoyage** cette fois, pour laisser la notification en base.
2. Recharger l'application (navigation complète, pas seulement
   client-side — `NotificationBell` fetch au montage) — vérifier que la
   cloche affiche un badge « 1 ».
3. Ouvrir le popover — vérifier que la notification de test apparaît,
   avec le point bleu (non lue) et l'objet de l'avis test affiché.
4. Cliquer la notification — vérifier la redirection vers `/veille` et
   que le badge passe à 0 (revenir sur une autre page puis rouvrir le
   popover pour confirmer que l'état « lu » a persisté côté serveur, pas
   seulement optimiste côté client).
5. Répéter les étapes 1-2 pour obtenir 2 notifications non lues, ouvrir
   le popover, cliquer « Tout marquer lu » — vérifier que le badge
   disparaît et que les deux lignes perdent leur point bleu.
6. Vérifier l'état vide : sur un compte de test sans notification (ou
   après avoir supprimé les avis test via
   `supabase.from('avis_ao_national').delete()...`), le popover affiche
   « Aucune notification ».
7. Vérifier qu'une entreprise **sans** secteur configuré (ou avec un
   secteur ne matchant pas celui de l'avis test) ne reçoit **aucune**
   notification pour ce même avis — cohérent avec la portée stricte de
   la spec.

Nettoyer toute donnée de test insérée manuellement (avis, notifications
associées supprimées en cascade) avant de terminer :
`supabase.from('avis_ao_national').delete().eq('reference', 'TEST-NOTIF-1')`
(via le même script tsx que la Tâche 2 Step 5).

- [ ] **Step 9: Commit**

```bash
git add components/ui/popover.tsx components/notification-bell.tsx "app/(app)/layout.tsx" messages/fr.json messages/en.json
git commit -m "feat(notifications): cloche de notifications in-app dans le header"
```
