# Abonnement/quota Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every entreprise a real `abonnement` row (plan, quota mensuel, statut) and enforce a monthly AO-processing quota at DAO upload time, computed on the fly, with zero payment integration.

**Architecture:** One new table (`abonnement`, 1-1 with `entreprise`), one new `lib/abonnement/` module (types, read queries, quota counting/check logic), one gate added to the existing DAO-upload Server Action, one read-only settings card. No new background jobs, no stored counters.

**Tech Stack:** Next.js App Router Server Actions, Supabase Postgres (RLS, `security definer` RPC), Vitest, next-intl.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-12-abonnement-quota-phase1-design.md`.
- No stored/cached counter column — usage is always computed via `COUNT` on `appel_offres` filtered by calendar month (UTC), per spec "Modèle de données".
- Default values for every `abonnement` row (new and backfilled): `plan='cabinet'`, `quota_mensuel=60`, `statut='actif'`, `date_renouvellement=null`, `mode_facturation=null`.
- No client-side write policy on `abonnement` — only `service_role` / direct SQL can change a row in Phase 1.
- No UI for changing plan, no CinetPay, no overage billing, no anti-abuse guard — all explicitly Phase 2 (out of scope here).
- French strings are the real, polished copy; English strings must be real translations (not placeholders) but don't need to be perfect — follow the existing `messages/en.json` tone.
- Follow existing repo conventions exactly: migration file naming (`YYYYMMDDHHMMSS_description.sql`), `security definer` RPC pattern (see `utilisateur_entreprise_id`, `creer_entreprise`), RLS `with check` discipline (see `noubinao_rls_with_check_gotcha` — every `for update` policy needs an explicit `with check`, though this table has no update policy for authenticated at all), Vitest fake-Supabase-client mocking pattern (see `lib/appels-offres/actions.test.ts`).
- Per `noubinao_migration_avant_merge`: the migration (Task 1) must be pushed to the real Supabase project and its backfill verified live **before** this branch is merged — this is a manual step for the controller (Sorel), never a subagent, per `feedback_subagent_infra_actions`.

---

### Task 1: Migration — `abonnement` table, RLS, backfill, extended `creer_entreprise`

**Files:**
- Create: `supabase/migrations/20261012140000_abonnement_quota.sql`

**Interfaces:**
- Produces: table `abonnement` with columns `entreprise_id uuid primary key`, `plan plan_abonnement not null`, `quota_mensuel integer not null`, `statut statut_abonnement not null`, `date_renouvellement timestamptz`, `mode_facturation mode_facturation_abonnement`, `created_at timestamptz not null default now()`. Enums `plan_abonnement` (`decouverte`, `starter`, `croissance`, `cabinet`), `statut_abonnement` (`actif`, `suspendu`), `mode_facturation_abonnement` (`mensuel`, `annuel`). RLS policy `abonnement_select_membres` (select-only, via existing `utilisateur_entreprise_id(auth.uid())` helper). Extended `creer_entreprise` RPC that also inserts the default `abonnement` row.
- Consumes: existing `entreprise` table, existing `utilisateur_entreprise_id` function (migration `20260909120000`), existing `creer_entreprise` function (migration `20260822124743`, full body must be reproduced with the addition — `create or replace` keeps the same signature `(p_nom text, p_rccm text default null, p_nom_utilisateur text default '')  returns uuid`).

- [ ] **Step 1: Write the migration file**

```sql
-- abonnement : objet quota/paiement (Phase 1 — modèle de données + compteur,
-- sans paiement). Voir
-- docs/superpowers/specs/2026-10-12-abonnement-quota-phase1-design.md

create type plan_abonnement as enum ('decouverte', 'starter', 'croissance', 'cabinet');
create type statut_abonnement as enum ('actif', 'suspendu');
create type mode_facturation_abonnement as enum ('mensuel', 'annuel');

create table abonnement (
  entreprise_id uuid primary key references entreprise(id) on delete cascade,
  plan plan_abonnement not null default 'cabinet',
  quota_mensuel integer not null default 60,
  statut statut_abonnement not null default 'actif',
  date_renouvellement timestamptz,
  mode_facturation mode_facturation_abonnement,
  created_at timestamptz not null default now()
);

alter table abonnement enable row level security;

-- Lecture par tout membre de l'entreprise. Pas de policy d'écriture pour
-- authenticated : en Phase 1, seule une connexion service_role (ou une
-- requête SQL directe par le Directeur) peut modifier une ligne — voir
-- spec "Logique de quota" / "Hors scope".
create policy "abonnement_select_membres" on abonnement
  for select using (
    entreprise_id = utilisateur_entreprise_id(auth.uid())
  );

-- Backfill : chaque entreprise déjà existante reçoit le palier par défaut
-- (cabinet / 60), choisi pour ne bloquer aucun pilote actuel.
insert into abonnement (entreprise_id)
select id from entreprise
on conflict (entreprise_id) do nothing;

-- Étend creer_entreprise (20260822124743) pour insérer aussi la ligne
-- abonnement par défaut, dans la même transaction — même signature,
-- create or replace suffit.
create or replace function creer_entreprise(
  p_nom text,
  p_rccm text default null,
  p_nom_utilisateur text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_id uuid;
begin
  if exists (select 1 from utilisateur where id = auth.uid()) then
    raise exception 'utilisateur_deja_rattache';
  end if;

  insert into entreprise (nom, rccm) values (p_nom, p_rccm)
  returning id into v_entreprise_id;

  insert into utilisateur (id, entreprise_id, nom, role)
  values (auth.uid(), v_entreprise_id, p_nom_utilisateur, 'admin');

  insert into abonnement (entreprise_id) values (v_entreprise_id);

  return v_entreprise_id;
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261012140000_abonnement_quota.sql
git commit -m "feat(abonnement): migration table abonnement, quota par defaut, backfill"
```

- [ ] **Step 3 (controller only, not a subagent): push and verify live**

Run `supabase db push` against the real project, then verify via direct SQL:
- `select count(*) from abonnement;` matches `select count(*) from entreprise;`.
- Every row has `plan='cabinet'`, `quota_mensuel=60`, `statut='actif'`.
- As a `membre` test session: `select * from abonnement where entreprise_id = <other_entreprise_id>;` returns empty (RLS blocks cross-entreprise read).
- Attempt `insert into abonnement (...) values (...)` or `update abonnement set plan='starter' ...` from an authenticated (non-service-role) session → rejected (`42501`), confirming no client write policy exists.

---

### Task 2: `lib/abonnement/types.ts`

**Files:**
- Create: `lib/abonnement/types.ts`

**Interfaces:**
- Produces: `Abonnement` interface, `PlanAbonnement` and `StatutAbonnement` union types — consumed by Task 3 (queries), Task 4 (quota logic), Task 7 (`AbonnementCard`).

- [ ] **Step 1: Write the file**

```typescript
export type PlanAbonnement = "decouverte" | "starter" | "croissance" | "cabinet";
export type StatutAbonnement = "actif" | "suspendu";
export type ModeFacturationAbonnement = "mensuel" | "annuel";

export interface Abonnement {
  entreprise_id: string;
  plan: PlanAbonnement;
  quota_mensuel: number;
  statut: StatutAbonnement;
  date_renouvellement: string | null;
  mode_facturation: ModeFacturationAbonnement | null;
  created_at: string;
}
```

No test for this file — it's a pure type declaration, nothing to execute.

- [ ] **Step 2: Commit**

```bash
git add lib/abonnement/types.ts
git commit -m "feat(abonnement): types Abonnement"
```

---

### Task 3: `lib/abonnement/quota.ts` — compter l'usage et vérifier le quota

**Files:**
- Create: `lib/abonnement/quota.ts`
- Test: `lib/abonnement/quota.test.ts`

**Interfaces:**
- Consumes: `Abonnement` type (Task 2). Takes a `SupabaseClient` (from `@supabase/supabase-js`) as its first parameter — never creates its own client, so it stays testable with a fake client and reusable from both a request-scoped client (Task 5) and a service-role-ish read in `queries.ts` (Task 4).
- Produces: 
  - `compterAoTraitesCeMois(supabase: SupabaseClient, entrepriseId: string): Promise<number>`
  - `verifierQuotaDisponible(supabase: SupabaseClient, entrepriseId: string): Promise<{ autorise: boolean; utilise: number; quota: number }>` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compterAoTraitesCeMois, verifierQuotaDisponible } from "./quota";

function creerSupabaseFake(options: {
  count: number | null;
  quotaMensuel: number | null | undefined;
}) {
  const fake = {
    from: (table: string) => {
      if (table === "appel_offres") {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({ count: options.count, error: null }),
            }),
          }),
        };
      }
      if (table === "abonnement") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  options.quotaMensuel === undefined
                    ? null
                    : { quota_mensuel: options.quotaMensuel },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`table inattendue dans le fake : ${table}`);
    },
  };
  return fake as unknown as SupabaseClient;
}

describe("compterAoTraitesCeMois", () => {
  it("renvoie le count exact renvoyé par Supabase", async () => {
    const supabase = creerSupabaseFake({ count: 7, quotaMensuel: 60 });
    expect(await compterAoTraitesCeMois(supabase, "ent-1")).toBe(7);
  });

  it("renvoie 0 quand count est null", async () => {
    const supabase = creerSupabaseFake({ count: null, quotaMensuel: 60 });
    expect(await compterAoTraitesCeMois(supabase, "ent-1")).toBe(0);
  });
});

describe("verifierQuotaDisponible", () => {
  it("autorise quand l'usage est strictement sous le quota", async () => {
    const supabase = creerSupabaseFake({ count: 5, quotaMensuel: 60 });
    const resultat = await verifierQuotaDisponible(supabase, "ent-1");
    expect(resultat).toEqual({ autorise: true, utilise: 5, quota: 60 });
  });

  it("refuse exactement au quota atteint (59/60 -> 60/60 refusé)", async () => {
    const supabase = creerSupabaseFake({ count: 60, quotaMensuel: 60 });
    const resultat = await verifierQuotaDisponible(supabase, "ent-1");
    expect(resultat).toEqual({ autorise: false, utilise: 60, quota: 60 });
  });

  it("fail-open (autorise=true) si aucune ligne abonnement n'existe", async () => {
    const supabase = creerSupabaseFake({ count: 3, quotaMensuel: undefined });
    const resultat = await verifierQuotaDisponible(supabase, "ent-1");
    expect(resultat.autorise).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/abonnement/quota.test.ts`
Expected: FAIL — `Cannot find module './quota'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VerificationQuota {
  autorise: boolean;
  utilise: number;
  quota: number;
}

export async function compterAoTraitesCeMois(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<number> {
  const debutMois = new Date();
  debutMois.setUTCDate(1);
  debutMois.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("appel_offres")
    .select("id", { count: "exact", head: true })
    .eq("entreprise_id", entrepriseId)
    .gte("created_at", debutMois.toISOString());

  if (error) throw error;
  return count ?? 0;
}

// Si aucune ligne abonnement n'existe (ne devrait jamais arriver après la
// migration de backfill + creer_entreprise étendu — voir Task 1), on
// n'empêche pas l'entreprise de travailler : une donnée manquante est un
// bug de notre côté, pas une raison de bloquer un client.
export async function verifierQuotaDisponible(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<VerificationQuota> {
  const { data: abonnement, error } = await supabase
    .from("abonnement")
    .select("quota_mensuel")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error) throw error;

  const utilise = await compterAoTraitesCeMois(supabase, entrepriseId);

  if (!abonnement) {
    return { autorise: true, utilise, quota: Number.POSITIVE_INFINITY };
  }

  const quota = abonnement.quota_mensuel as number;
  return { autorise: utilise < quota, utilise, quota };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/abonnement/quota.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/abonnement/quota.ts lib/abonnement/quota.test.ts
git commit -m "feat(abonnement): compterAoTraitesCeMois et verifierQuotaDisponible"
```

---

### Task 4: `lib/abonnement/queries.ts` — lecture pour l'UI

**Files:**
- Create: `lib/abonnement/queries.ts`

**Interfaces:**
- Consumes: `Abonnement` (Task 2), `compterAoTraitesCeMois` (Task 3), `createClient` from `@/lib/supabase/server`.
- Produces: `obtenirAbonnementAvecUsage(entrepriseId: string): Promise<{ abonnement: Abonnement; utilise: number } | null>` — consumed by Task 7 (`/parametres` page).

- [ ] **Step 1: Write the file**

```typescript
import { createClient } from "@/lib/supabase/server";
import { compterAoTraitesCeMois } from "./quota";
import type { Abonnement } from "./types";

export async function obtenirAbonnementAvecUsage(
  entrepriseId: string,
): Promise<{ abonnement: Abonnement; utilise: number } | null> {
  const supabase = await createClient();

  const { data: abonnement } = await supabase
    .from("abonnement")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (!abonnement) return null;

  const utilise = await compterAoTraitesCeMois(supabase, entrepriseId);

  return { abonnement: abonnement as Abonnement, utilise };
}
```

No test — thin read wrapper over Supabase, same category as `obtenirEntreprise` in `lib/utilisateur/queries.ts` (untested in this codebase). The logic worth testing (`compterAoTraitesCeMois`) is already covered in Task 3.

- [ ] **Step 2: Commit**

```bash
git add lib/abonnement/queries.ts
git commit -m "feat(abonnement): obtenirAbonnementAvecUsage"
```

---

### Task 5: Gate quota dans `finaliserTeleversementDao`

**Files:**
- Modify: `lib/appels-offres/actions.ts:126-137` (top of `finaliserTeleversementDao`, right after the existing `parsed.success` check, before any Supabase Storage/DB mutation)
- Test: `lib/appels-offres/actions.test.ts`

**Interfaces:**
- Consumes: `verifierQuotaDisponible` (Task 3), `utilisateur.entreprise_id` (already available in this function via `obtenirUtilisateurCourant()`).
- Produces: no new export — `finaliserTeleversementDao` now also returns `{ erreur: string }` when the quota is exhausted, before touching `appel_offres` or storage.

- [ ] **Step 1: Write the failing test**

Add to `lib/appels-offres/actions.test.ts` (it already mocks `@/lib/utilisateur/queries` and `@/lib/supabase/server` at module scope — reuse `creerClientMock`, add a mock for `@/lib/abonnement/quota`):

```typescript
vi.mock("@/lib/abonnement/quota", () => ({
  verifierQuotaDisponible: vi.fn(),
}));

import { verifierQuotaDisponible } from "@/lib/abonnement/quota";
import { finaliserTeleversementDao } from "./actions";

describe("finaliserTeleversementDao", () => {
  it("refuse et n'insère rien quand le quota mensuel est atteint", async () => {
    vi.mocked(verifierQuotaDisponible).mockResolvedValue({
      autorise: false,
      utilise: 60,
      quota: 60,
    });
    const insertSpy = vi.fn();
    creerClientMock.mockResolvedValue({
      from: () => ({ insert: insertSpy }),
    } as unknown as SupabaseClient);

    const reponse = await finaliserTeleversementDao("ao-1", [
      { nomOriginal: "dao.pdf", mimeType: "application/pdf" },
    ]);

    expect(reponse).toEqual({
      erreur: "Quota mensuel atteint (60/60 AO traités). Contactez-nous pour augmenter votre palier.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/appels-offres/actions.test.ts -t "quota mensuel est atteint"`
Expected: FAIL — `insertSpy` gets called (no gate yet), or assertion on `reponse` fails.

- [ ] **Step 3: Implement the gate**

In `lib/appels-offres/actions.ts`:
- Add import: `import { verifierQuotaDisponible } from "@/lib/abonnement/quota";`
- In `finaliserTeleversementDao`, immediately after the existing block:
  ```typescript
  const parsed = demarrerTeleversementDaoSchema.safeParse({ fichiers });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }
  ```
  insert:
  ```typescript
  const supabase = await createClient();

  const quota = await verifierQuotaDisponible(supabase, utilisateur.entreprise_id);
  if (!quota.autorise) {
    return {
      erreur: `Quota mensuel atteint (${quota.utilise}/${quota.quota} AO traités). Contactez-nous pour augmenter votre palier.`,
    };
  }
  ```
  — then remove the now-duplicated `const supabase = await createClient();` that currently follows a few lines below (line ~138 in the pre-change file), since it's now declared above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/appels-offres/actions.test.ts`
Expected: PASS, including the pre-existing `modifierStatutPipeline` tests (unaffected) and the new quota test.

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/actions.ts lib/appels-offres/actions.test.ts
git commit -m "feat(appels-offres): bloque l'upload DAO au quota mensuel atteint"
```

---

### Task 6: Traductions — `Parametres.abonnement` et `Plans`

**Files:**
- Modify: `messages/fr.json:580` (insert new `"abonnement"` block right after the `"equipe"` block closes, before `"tauxFraisStructure"`), and `messages/fr.json:667` (insert new top-level `"Plans"` block right after `"Secteurs"` closes, before `"Notifications"`)
- Modify: `messages/en.json` at the matching locations (same line numbers — the two files are kept in parallel structure in this codebase)

**Interfaces:**
- Produces: `Parametres.abonnement.titre`, `Parametres.abonnement.usage` (ICU: `{utilise}` / `{quota}` placeholders), `Plans.decouverte`, `Plans.starter`, `Plans.croissance`, `Plans.cabinet` — consumed by Task 7 (`AbonnementCard`).

- [ ] **Step 1: Edit `messages/fr.json`**

After:
```json
      "erreurCopie": "Impossible de copier le lien."
    },
    "tauxFraisStructure": {
```
insert `"abonnement"` between the two, so it reads:
```json
      "erreurCopie": "Impossible de copier le lien."
    },
    "abonnement": {
      "titre": "Abonnement",
      "description": "Palier actuel et nombre d'appels d'offres traités ce mois.",
      "usage": "{utilise}/{quota} AO traités ce mois"
    },
    "tauxFraisStructure": {
```

After:
```json
  "Secteurs": {
    "btp": "BTP",
    "ingenierie": "Ingénierie",
    "environnement": "Environnement",
    "energie_climat": "Énergie-climat"
  },
  "Notifications": {
```
insert `"Plans"` between the two:
```json
  "Secteurs": {
    "btp": "BTP",
    "ingenierie": "Ingénierie",
    "environnement": "Environnement",
    "energie_climat": "Énergie-climat"
  },
  "Plans": {
    "decouverte": "Découverte",
    "starter": "Starter",
    "croissance": "Croissance",
    "cabinet": "Cabinet"
  },
  "Notifications": {
```

- [ ] **Step 2: Edit `messages/en.json`** the same way

```json
      "erreurCopie": "Could not copy the link."
    },
    "abonnement": {
      "titre": "Subscription",
      "description": "Current plan and number of tenders processed this month.",
      "usage": "{utilise}/{quota} tenders processed this month"
    },
    "tauxFraisStructure": {
```

```json
  "Secteurs": {
    "btp": "Construction",
    "ingenierie": "Engineering",
    "environnement": "Environment",
    "energie_climat": "Energy & climate"
  },
  "Plans": {
    "decouverte": "Discovery",
    "starter": "Starter",
    "croissance": "Growth",
    "cabinet": "Firm"
  },
  "Notifications": {
```

- [ ] **Step 3: Verify JSON is still valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('ok')"`
Expected: prints `ok` (no `SyntaxError`).

- [ ] **Step 4: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "feat(i18n): traductions abonnement et paliers"
```

---

### Task 7: `AbonnementCard` et intégration dans `/parametres`

**Files:**
- Create: `app/(app)/parametres/abonnement-card.tsx`
- Modify: `app/(app)/parametres/page.tsx`

**Interfaces:**
- Consumes: `obtenirAbonnementAvecUsage` (Task 4), `Plans.*` / `Parametres.abonnement.*` translation keys (Task 6).
- Produces: `AbonnementCard` React server component, rendered unconditionally (visible to all members, like `TauxFraisStructureCard`) in `/parametres`.

- [ ] **Step 1: Write `abonnement-card.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Abonnement } from "@/lib/abonnement/types";

export async function AbonnementCard({
  abonnement,
  utilise,
}: {
  abonnement: Abonnement;
  utilise: number;
}) {
  const t = await getTranslations("Parametres.abonnement");
  const tPlans = await getTranslations("Plans");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          <span className="font-medium">{tPlans(abonnement.plan)}</span>
          {" — "}
          {t("usage", { utilise, quota: abonnement.quota_mensuel })}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `page.tsx`**

In `app/(app)/parametres/page.tsx`:
- Add import: `import { obtenirAbonnementAvecUsage } from "@/lib/abonnement/queries";`
- Add import: `import { AbonnementCard } from "./abonnement-card";`
- Add `obtenirAbonnementAvecUsage(utilisateur.entreprise_id)` to the existing `Promise.all([...])` array, and destructure it as `abonnementAvecUsage`.
- Render, right after `<ToastConnexion .../>` (visible to every member, same tier as `TauxFraisStructureCard`):
  ```tsx
  {abonnementAvecUsage && (
    <AbonnementCard
      abonnement={abonnementAvecUsage.abonnement}
      utilise={abonnementAvecUsage.utilise}
    />
  )}
  ```

Resulting `Promise.all` block:
```typescript
const [compte, tauxFraisStructureDefaut, entreprise, membres, invitations, abonnementAvecUsage] =
  await Promise.all([
    obtenirCompteEmailConnecte(utilisateur.id),
    obtenirTauxFraisStructureDefaut(utilisateur.entreprise_id),
    obtenirEntreprise(utilisateur.entreprise_id),
    estAdmin ? listerUtilisateurs(utilisateur.entreprise_id) : Promise.resolve([]),
    estAdmin ? listerInvitationsEnAttente(utilisateur.entreprise_id) : Promise.resolve([]),
    obtenirAbonnementAvecUsage(utilisateur.entreprise_id),
  ]);
```

No test — this page has no existing test file (`page.test.ts` doesn't exist for `/parametres`), consistent with the rest of this file being untested server-rendering glue.

- [ ] **Step 3: Manual verification (controller, real browser)**

With the Task 1 migration already pushed and the dev server pointed at the real Supabase project:
- Load `/parametres` as an existing pilot user → card shows "Cabinet — N/60 AO traités ce mois" with the real current count.
- Confirm the count matches `select count(*) from appel_offres where entreprise_id = <id> and created_at >= date_trunc('month', now());` run directly against Supabase.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/parametres/abonnement-card.tsx" "app/(app)/parametres/page.tsx"
git commit -m "feat(abonnement): carte usage/palier dans /parametres"
```

---

### Task 8: Full verification pass

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end check (controller, real Supabase)**

As a real pilot user already near a low quota (or temporarily set `quota_mensuel` to `1` for a disposable test entreprise via direct SQL — never on a real pilot's row):
- Upload a first DAO → succeeds.
- Upload a second DAO the same month → blocked with the exact message `Quota mensuel atteint (1/1 AO traités). Contactez-nous pour augmenter votre palier.`, and confirm via SQL that no new `appel_offres` row was created.
- Restore the test entreprise's `quota_mensuel` back to `60` (or delete the disposable test entreprise) afterward.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(abonnement): corrections suite a la verification finale"
```
