# Abonnement Phase 2 — paiement GeniusPay (partie testable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the `abonnement` data model and quota gate for real GeniusPay payment, and ship the UI/logic that works today without any GeniusPay API access — suspension enforcement, a free-tier (Découverte) self-service switch, and a "coming soon" placeholder for paid tiers.

**Architecture:** Extend the Phase 1 `abonnement` table with two nullable columns reserved for a future GeniusPay integration (no behavior depends on them yet). Extend the existing quota-check function to also honor `statut='suspendu'` as a hard block, independent of the usage count. Add an admin-only dialog on `/parametres` that can switch an entreprise to the free Découverte tier immediately (direct DB write) and shows the three paid tiers as disabled ("Bientôt disponible").

**Tech Stack:** Next.js Server Actions, Supabase (Postgres, RLS), Vitest, next-intl, shadcn/ui (`Dialog`, `Button`).

## Global Constraints

- Per the spec's explicit sequencing decision: **no GeniusPay API client, no webhook route, no signature verification in this plan.** Anything requiring the real GeniusPay API contract is out of scope here.
- No change to any entreprise's current plan/quota as a side effect of this work — existing and newly-created entreprises keep defaulting to `cabinet`/60 (Phase 1 behavior, unchanged).
- Selecting the Découverte tier sets `plan='decouverte'` and `quota_mensuel=1` (the quota documented in `CLAUDE.md`'s pricing table) — no other column is touched by this action.
- Suspension (`statut='suspendu'`) blocks ALL DAO uploads, even when usage is under quota — distinct error message from "quota atteint", per the approved design.
- The `abonnement` table currently has no client write policy at all (Phase 1 decision). This plan adds exactly one: `for update`, scoped to "any member of the entreprise" (same helper, `utilisateur_entreprise_id`, as the existing select policy and as `entreprise_update_membres` in `supabase/migrations/20260916150000_pyramide_cout_bpu.sql`) — **admin-only enforcement happens in application code**, not in RLS, mirroring the exact pattern already used by `modifierProfilEntreprise` in `lib/utilisateur/actions.ts:16-31` (role check first, then an ordinary authenticated-client write).
- Per `lib/supabase/service-role.ts`'s own doc comment, the service-role client must NEVER be used from a Server Action triggered directly by a user — reserved for background jobs and signed webhooks. Any Server Action in this plan uses the normal request-scoped client (`createClient()` from `@/lib/supabase/server`), never `createServiceRoleClient()`.
- French copy must be complete and polished; English copy must be a real translation (not a placeholder) — per `CLAUDE.md`'s i18n scope rule.
- Price/quota figures per tier (used in the UI) come from `CLAUDE.md`'s pricing table: Découverte 1 AO/0 FCFA, Starter 5 AO/≈25 000 FCFA, Croissance 25 AO/≈110 000 FCFA, Cabinet 60 AO/≈180 000 FCFA — these are numeric/currency values, not sentences, and are not run through next-intl (consistent with "montants en XOF" shown as-is, not translated).

---

### Task 1: Migration — colonnes GeniusPay + policy UPDATE sur `abonnement`

**Files:**
- Create: `supabase/migrations/20261012150000_abonnement_phase2_colonnes.sql`

**Interfaces:**
- Produces: columns `abonnement.geniuspay_customer_id` (`text`, nullable), `abonnement.geniuspay_subscription_id` (`text`, nullable); RLS policy `abonnement_update_membres` (`for update`, `using`/`with check` both `entreprise_id = utilisateur_entreprise_id(auth.uid())`).
- Consumes: existing `utilisateur_entreprise_id` function (migration `20260909120000`), existing `abonnement` table (migration `20261012140000`).

- [ ] **Step 1: Write the migration file**

```sql
-- Phase 2 abonnement (paiement GeniusPay) — partie testable sans compte
-- GeniusPay actif. Voir
-- docs/superpowers/specs/2026-10-12-abonnement-phase2-paiement-geniuspay-design.md

alter table abonnement
  add column geniuspay_customer_id text,
  add column geniuspay_subscription_id text;

-- "with check" explicite (pas seulement "using") : sans lui Postgres
-- réutiliserait "using" pour les nouvelles valeurs de la ligne — voir
-- noubinao_rls_with_check_gotcha. Restriction à "même entreprise", pas à
-- "admin seulement" : l'admin-gating réel se fait en code applicatif
-- (lib/abonnement/actions.ts), même patron que entreprise_update_membres
-- (20260916150000) et modifierProfilEntreprise.
create policy "abonnement_update_membres" on abonnement
  for update
  using (
    entreprise_id = utilisateur_entreprise_id(auth.uid())
  )
  with check (
    entreprise_id = utilisateur_entreprise_id(auth.uid())
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261012150000_abonnement_phase2_colonnes.sql
git commit -m "feat(abonnement): colonnes geniuspay et policy update (phase 2)"
```

- [ ] **Step 3 (controller only, not a subagent): push and verify live**

Run `supabase db push` against the real project, then verify via `npx supabase db query --linked "<sql>"`:
- `select column_name from information_schema.columns where table_name='abonnement' and column_name like 'geniuspay%';` returns both new columns.
- `select policyname, cmd from pg_policies where tablename='abonnement';` shows both `abonnement_select_membres` (select) and `abonnement_update_membres` (update).

---

### Task 2: `lib/abonnement/types.ts` — champs GeniusPay

**Files:**
- Modify: `lib/abonnement/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Abonnement.geniuspay_customer_id: string | null`, `Abonnement.geniuspay_subscription_id: string | null` — consumed by later tasks only incidentally (no task reads these fields yet; they exist so the type matches the real schema).

- [ ] **Step 1: Edit the file**

Current content:
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

Add the two new fields to the interface (anywhere after `mode_facturation`, before `created_at` is fine):

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
  geniuspay_customer_id: string | null;
  geniuspay_subscription_id: string | null;
  created_at: string;
}
```

No test — pure type declarations, nothing to execute.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: clean (no consumer destructures these fields yet, so nothing can break — this just confirms the file itself is syntactically valid TypeScript).

- [ ] **Step 3: Commit**

```bash
git add lib/abonnement/types.ts
git commit -m "feat(abonnement): champs geniuspay_customer_id et geniuspay_subscription_id"
```

---

### Task 3: `lib/abonnement/quota.ts` — blocage sur `statut='suspendu'`

**Files:**
- Modify: `lib/abonnement/quota.ts`
- Modify: `lib/abonnement/quota.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `VerificationQuota` gains a `suspendu: boolean` field. `verifierQuotaDisponible(supabase, entrepriseId): Promise<VerificationQuota>` — same name/params, new shape — consumed by Task 4.

Current `lib/abonnement/quota.ts`:
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

- [ ] **Step 1: Update `lib/abonnement/quota.test.ts`'s fake client to carry `statut`, and write the new failing tests**

Replace the whole file with:

```typescript
import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compterAoTraitesCeMois, verifierQuotaDisponible } from "./quota";

function creerSupabaseFake(options: {
  count: number | null;
  quotaMensuel: number | null | undefined;
  statut?: "actif" | "suspendu";
  recordCalls?: { eq?: string[]; gte?: string[] };
}) {
  const fake = {
    from: (table: string) => {
      if (table === "appel_offres") {
        return {
          select: () => ({
            eq: (field: string, value: string) => {
              if (options.recordCalls) {
                options.recordCalls.eq = [field, value];
              }
              return {
                gte: async (field: string, value: string) => {
                  if (options.recordCalls) {
                    options.recordCalls.gte = [field, value];
                  }
                  return { count: options.count, error: null };
                },
              };
            },
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
                    : { quota_mensuel: options.quotaMensuel, statut: options.statut ?? "actif" },
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renvoie le count exact renvoyé par Supabase", async () => {
    const supabase = creerSupabaseFake({ count: 7, quotaMensuel: 60 });
    expect(await compterAoTraitesCeMois(supabase, "ent-1")).toBe(7);
  });

  it("renvoie 0 quand count est null", async () => {
    const supabase = creerSupabaseFake({ count: null, quotaMensuel: 60 });
    expect(await compterAoTraitesCeMois(supabase, "ent-1")).toBe(0);
  });

  it("utilise le début du mois UTC pour filtrer les AO", async () => {
    vi.setSystemTime(new Date("2026-10-15T10:30:45.123Z"));
    const recordCalls = { eq: undefined as string[] | undefined, gte: undefined as string[] | undefined };
    const supabase = creerSupabaseFake({ count: 3, quotaMensuel: 60, recordCalls });
    await compterAoTraitesCeMois(supabase, "ent-123");

    expect(recordCalls.eq).toEqual(["entreprise_id", "ent-123"]);
    expect(recordCalls.gte).toEqual(["created_at", "2026-10-01T00:00:00.000Z"]);
  });
});

describe("verifierQuotaDisponible", () => {
  it("autorise quand l'usage est strictement sous le quota", async () => {
    const supabase = creerSupabaseFake({ count: 5, quotaMensuel: 60 });
    const resultat = await verifierQuotaDisponible(supabase, "ent-1");
    expect(resultat).toEqual({ autorise: true, utilise: 5, quota: 60, suspendu: false });
  });

  it("refuse exactement au quota atteint (59/60 -> 60/60 refusé)", async () => {
    const supabase = creerSupabaseFake({ count: 60, quotaMensuel: 60 });
    const resultat = await verifierQuotaDisponible(supabase, "ent-1");
    expect(resultat).toEqual({ autorise: false, utilise: 60, quota: 60, suspendu: false });
  });

  it("fail-open (autorise=true) si aucune ligne abonnement n'existe", async () => {
    const supabase = creerSupabaseFake({ count: 3, quotaMensuel: undefined });
    const resultat = await verifierQuotaDisponible(supabase, "ent-1");
    expect(resultat).toEqual({ autorise: true, utilise: 3, quota: Number.POSITIVE_INFINITY, suspendu: false });
  });

  it("bloque (suspendu=true, autorise=false) quand statut='suspendu', même sous le quota", async () => {
    const supabase = creerSupabaseFake({ count: 2, quotaMensuel: 60, statut: "suspendu" });
    const resultat = await verifierQuotaDisponible(supabase, "ent-1");
    expect(resultat).toEqual({ autorise: false, utilise: 2, quota: 60, suspendu: true });
  });
});
```

- [ ] **Step 2: Run tests to verify the new/changed assertions fail**

Run: `npx vitest run lib/abonnement/quota.test.ts`
Expected: FAIL — the 3 pre-existing tests now expect a `suspendu` field the implementation doesn't return yet, and the new "bloque... suspendu" test fails outright.

- [ ] **Step 3: Update the implementation**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VerificationQuota {
  autorise: boolean;
  utilise: number;
  quota: number;
  suspendu: boolean;
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
// migration de backfill + creer_entreprise étendu — voir Task 1 de la
// Phase 1), on n'empêche pas l'entreprise de travailler : une donnée
// manquante est un bug de notre côté, pas une raison de bloquer un client.
export async function verifierQuotaDisponible(
  supabase: SupabaseClient,
  entrepriseId: string,
): Promise<VerificationQuota> {
  const { data: abonnement, error } = await supabase
    .from("abonnement")
    .select("quota_mensuel, statut")
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (error) throw error;

  const utilise = await compterAoTraitesCeMois(supabase, entrepriseId);

  if (!abonnement) {
    return { autorise: true, utilise, quota: Number.POSITIVE_INFINITY, suspendu: false };
  }

  if (abonnement.statut === "suspendu") {
    return { autorise: false, utilise, quota: abonnement.quota_mensuel as number, suspendu: true };
  }

  const quota = abonnement.quota_mensuel as number;
  return { autorise: utilise < quota, utilise, quota, suspendu: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/abonnement/quota.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/abonnement/quota.ts lib/abonnement/quota.test.ts
git commit -m "feat(abonnement): verifierQuotaDisponible bloque sur statut suspendu"
```

---

### Task 4: Gate `lib/appels-offres/actions.ts` — message dédié pour la suspension

**Files:**
- Modify: `lib/appels-offres/actions.ts:100-110` (inside `demarrerTeleversementDao`)
- Modify: `lib/appels-offres/actions.ts:164-188` (inside `finaliserTeleversementDao`)
- Modify: `lib/appels-offres/actions.test.ts`

**Interfaces:**
- Consumes: `VerificationQuota.suspendu` (Task 3).
- Produces: no new export — both functions now also return `{ erreur: "Abonnement suspendu. Régularisez votre paiement pour continuer à traiter des appels d'offres." }` when `quota.suspendu` is true, checked before the quota-exhausted branch.

- [ ] **Step 1: Write the failing tests**

Add to `lib/appels-offres/actions.test.ts`, inside the existing `describe("demarrerTeleversementDao", ...)` block (after its two existing `it`s, before the closing `});`):

```typescript
  it("refuse avec un message dédié quand l'abonnement est suspendu", async () => {
    vi.mocked(verifierQuotaDisponible).mockResolvedValue({
      autorise: false,
      utilise: 2,
      quota: 60,
      suspendu: true,
    });
    const createSignedUploadUrlSpy = vi.fn();
    creerClientMock.mockResolvedValue({
      storage: {
        from: () => ({ createSignedUploadUrl: createSignedUploadUrlSpy }),
      },
    } as unknown as SupabaseClient);

    const reponse = await demarrerTeleversementDao([
      { nomOriginal: "dao.pdf", mimeType: "application/pdf" },
    ]);

    expect(reponse).toEqual({
      erreur: "Abonnement suspendu. Régularisez votre paiement pour continuer à traiter des appels d'offres.",
    });
    expect(createSignedUploadUrlSpy).not.toHaveBeenCalled();
  });
```

And inside the existing `describe("finaliserTeleversementDao", ...)` block (after its two existing `it`s, before the closing `});`):

```typescript
  it("refuse avec un message dédié, nettoie les fichiers et n'insère rien quand l'abonnement est suspendu", async () => {
    vi.mocked(verifierQuotaDisponible).mockResolvedValue({
      autorise: false,
      utilise: 2,
      quota: 60,
      suspendu: true,
    });
    const insertSpy = vi.fn();
    const removeSpy = vi.fn().mockResolvedValue({ error: null });
    creerClientMock.mockResolvedValue({
      from: () => ({ insert: insertSpy }),
      storage: {
        from: () => ({ remove: removeSpy }),
      },
    } as unknown as SupabaseClient);

    const reponse = await finaliserTeleversementDao("ao-1", [
      { nomOriginal: "dao.pdf", mimeType: "application/pdf" },
    ]);

    expect(reponse).toEqual({
      erreur: "Abonnement suspendu. Régularisez votre paiement pour continuer à traiter des appels d'offres.",
    });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledWith(["ent-1/appels-offres/ao-1-0-dao.pdf"]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/appels-offres/actions.test.ts -t "suspendu"`
Expected: FAIL — both mocks resolve `suspendu: true`, but the current code never reads that field, so it falls through to the quota-exhausted branch and returns the wrong `erreur` text (`autorise: false` is still true here, so it actually *does* currently return the quota message — the test fails on the message text, not on reaching the insert).

- [ ] **Step 3: Implement**

In `demarrerTeleversementDao` (`lib/appels-offres/actions.ts`), change:

```typescript
  try {
    const quota = await verifierQuotaDisponible(supabase, utilisateur.entreprise_id);
    if (!quota.autorise) {
      return {
        erreur: `Quota mensuel atteint (${quota.utilise}/${quota.quota} AO traités). Contactez-nous pour augmenter votre palier.`,
      };
    }
  } catch (erreur) {
```

to:

```typescript
  try {
    const quota = await verifierQuotaDisponible(supabase, utilisateur.entreprise_id);
    if (quota.suspendu) {
      return {
        erreur: "Abonnement suspendu. Régularisez votre paiement pour continuer à traiter des appels d'offres.",
      };
    }
    if (!quota.autorise) {
      return {
        erreur: `Quota mensuel atteint (${quota.utilise}/${quota.quota} AO traités). Contactez-nous pour augmenter votre palier.`,
      };
    }
  } catch (erreur) {
```

In `finaliserTeleversementDao`, change:

```typescript
  try {
    const quota = await verifierQuotaDisponible(supabase, utilisateur.entreprise_id);
    if (!quota.autorise) {
      const { error: erreurSuppressionFichiers } = await supabase.storage
        .from("documents")
        .remove(cheminsFichiers);

      if (erreurSuppressionFichiers) {
        console.error(
          "Échec de la suppression des fichiers DAO après refus de quota. " +
            "Fichiers orphelins dans le stockage.",
          { cheminsFichiers, erreur: erreurSuppressionFichiers.message },
        );
      }

      return {
        erreur: `Quota mensuel atteint (${quota.utilise}/${quota.quota} AO traités). Contactez-nous pour augmenter votre palier.`,
      };
    }
  } catch (erreur) {
```

to:

```typescript
  try {
    const quota = await verifierQuotaDisponible(supabase, utilisateur.entreprise_id);
    if (quota.suspendu || !quota.autorise) {
      const { error: erreurSuppressionFichiers } = await supabase.storage
        .from("documents")
        .remove(cheminsFichiers);

      if (erreurSuppressionFichiers) {
        console.error(
          "Échec de la suppression des fichiers DAO après refus de quota/abonnement. " +
            "Fichiers orphelins dans le stockage.",
          { cheminsFichiers, erreur: erreurSuppressionFichiers.message },
        );
      }

      return {
        erreur: quota.suspendu
          ? "Abonnement suspendu. Régularisez votre paiement pour continuer à traiter des appels d'offres."
          : `Quota mensuel atteint (${quota.utilise}/${quota.quota} AO traités). Contactez-nous pour augmenter votre palier.`,
      };
    }
  } catch (erreur) {
```

(The rest of both functions — the `catch` blocks and everything below — is untouched.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/appels-offres/actions.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add lib/appels-offres/actions.ts lib/appels-offres/actions.test.ts
git commit -m "feat(appels-offres): message dedie quand l'abonnement est suspendu"
```

---

### Task 5: `lib/abonnement/paliers.ts` — données des paliers pour l'UI

**Files:**
- Create: `lib/abonnement/paliers.ts`

**Interfaces:**
- Consumes: `PlanAbonnement` (Task 2).
- Produces: `PALIERS_INFO: PalierInfo[]`, `interface PalierInfo { id: PlanAbonnement; quota: number; prixLabel: string; payant: boolean }` — consumed by Task 7 (dialogue de changement de palier).

- [ ] **Step 1: Write the file**

```typescript
import type { PlanAbonnement } from "./types";

export interface PalierInfo {
  id: PlanAbonnement;
  quota: number;
  prixLabel: string;
  payant: boolean;
}

// Chiffres repris de la table de paliers dans CLAUDE.md — hypothèse de
// travail non encore validée avec de vrais prospects, affichée ici telle
// quelle (montants FCFA, pas de traduction : un montant n'est pas une
// phrase).
export const PALIERS_INFO: PalierInfo[] = [
  { id: "decouverte", quota: 1, prixLabel: "0 FCFA", payant: false },
  { id: "starter", quota: 5, prixLabel: "≈ 25 000 FCFA/mois", payant: true },
  { id: "croissance", quota: 25, prixLabel: "≈ 110 000 FCFA/mois", payant: true },
  { id: "cabinet", quota: 60, prixLabel: "≈ 180 000 FCFA/mois", payant: true },
];
```

No test — static data, nothing to execute.

- [ ] **Step 2: Commit**

```bash
git add lib/abonnement/paliers.ts
git commit -m "feat(abonnement): donnees des 4 paliers pour l'UI de changement"
```

---

### Task 6: `lib/abonnement/actions.ts` — `changerPalierDecouverte`

**Files:**
- Create: `lib/abonnement/actions.ts`
- Test: `lib/abonnement/actions.test.ts`

**Interfaces:**
- Consumes: `obtenirUtilisateurCourant` (`@/lib/utilisateur/queries`), `createClient` (`@/lib/supabase/server`).
- Produces: `changerPalierDecouverte(): Promise<{ erreur: string } | { succes: true }>` — consumed by Task 7.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const obtenirUtilisateurCourantMock = vi.fn();
vi.mock("@/lib/utilisateur/queries", () => ({
  obtenirUtilisateurCourant: () => obtenirUtilisateurCourantMock(),
}));

const creerClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => creerClientMock(),
}));

import { changerPalierDecouverte } from "./actions";

function creerSupabaseFake() {
  const appelsMisAJour: { valeurs: Record<string, unknown>; entrepriseId: string }[] = [];
  const fake = {
    from: () => ({
      update: (valeurs: Record<string, unknown>) => ({
        eq: async (_champ: string, entrepriseId: string) => {
          appelsMisAJour.push({ valeurs, entrepriseId });
          return { error: null };
        },
      }),
    }),
  };
  return { supabase: fake as unknown as SupabaseClient, appelsMisAJour };
}

describe("changerPalierDecouverte", () => {
  it("refuse si l'utilisateur n'est pas authentifié", async () => {
    obtenirUtilisateurCourantMock.mockResolvedValue(null);

    const reponse = await changerPalierDecouverte();

    expect(reponse).toEqual({ erreur: "Non authentifié" });
  });

  it("refuse si l'utilisateur n'est pas admin", async () => {
    obtenirUtilisateurCourantMock.mockResolvedValue({
      id: "user-1",
      entreprise_id: "ent-1",
      role: "membre",
    });
    const { supabase, appelsMisAJour } = creerSupabaseFake();
    creerClientMock.mockResolvedValue(supabase);

    const reponse = await changerPalierDecouverte();

    expect(reponse).toEqual({ erreur: "Réservé aux administrateurs." });
    expect(appelsMisAJour).toHaveLength(0);
  });

  it("met à jour plan=decouverte et quota_mensuel=1 pour l'entreprise de l'admin", async () => {
    obtenirUtilisateurCourantMock.mockResolvedValue({
      id: "user-1",
      entreprise_id: "ent-1",
      role: "admin",
    });
    const { supabase, appelsMisAJour } = creerSupabaseFake();
    creerClientMock.mockResolvedValue(supabase);

    const reponse = await changerPalierDecouverte();

    expect(reponse).toEqual({ succes: true });
    expect(appelsMisAJour).toHaveLength(1);
    expect(appelsMisAJour[0].entrepriseId).toBe("ent-1");
    expect(appelsMisAJour[0].valeurs).toEqual({ plan: "decouverte", quota_mensuel: 1 });
  });

  it("renvoie une erreur propre si la mise à jour échoue", async () => {
    obtenirUtilisateurCourantMock.mockResolvedValue({
      id: "user-1",
      entreprise_id: "ent-1",
      role: "admin",
    });
    creerClientMock.mockResolvedValue({
      from: () => ({
        update: () => ({
          eq: async () => ({ error: { message: "boom" } }),
        }),
      }),
    } as unknown as SupabaseClient);

    const reponse = await changerPalierDecouverte();

    expect(reponse).toEqual({ erreur: "Échec du changement de palier. Réessayez." });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/abonnement/actions.test.ts`
Expected: FAIL — `Cannot find module './actions'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";

export async function changerPalierDecouverte(): Promise<
  { erreur: string } | { succes: true }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  if (utilisateur.role !== "admin") {
    return { erreur: "Réservé aux administrateurs." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("abonnement")
    .update({ plan: "decouverte", quota_mensuel: 1 })
    .eq("entreprise_id", utilisateur.entreprise_id);

  if (error) {
    return { erreur: "Échec du changement de palier. Réessayez." };
  }

  revalidatePath("/parametres");
  return { succes: true as const };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/abonnement/actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/abonnement/actions.ts lib/abonnement/actions.test.ts
git commit -m "feat(abonnement): server action changerPalierDecouverte (admin-only)"
```

---

### Task 7: Traductions — dialogue de changement de palier + bandeau de suspension

**Files:**
- Modify: `messages/fr.json:581-585`
- Modify: `messages/en.json:581-585`

**Interfaces:**
- Produces: `Parametres.abonnement.{bandeauSuspendu,boutonChangerPalier,dialogueTitre,dialogueDescription,quotaParMois,bientotDisponible,boutonActiver,toastPalierChange}` — consumed by Task 8.

- [ ] **Step 1: Edit `messages/fr.json`**

Replace:
```json
    "abonnement": {
      "titre": "Abonnement",
      "description": "Palier actuel et nombre d'appels d'offres traités ce mois.",
      "usage": "{utilise}/{quota} AO traités ce mois"
    },
```
with:
```json
    "abonnement": {
      "titre": "Abonnement",
      "description": "Palier actuel et nombre d'appels d'offres traités ce mois.",
      "usage": "{utilise}/{quota} AO traités ce mois",
      "bandeauSuspendu": "Abonnement suspendu. Régularisez votre paiement pour continuer à traiter des appels d'offres.",
      "boutonChangerPalier": "Changer de palier",
      "dialogueTitre": "Changer de palier",
      "dialogueDescription": "Le palier Découverte (gratuit) s'active immédiatement. Les paliers payants nécessitent une intégration de paiement à venir.",
      "quotaParMois": "{quota} AO/mois",
      "bientotDisponible": "Bientôt disponible",
      "boutonActiver": "Activer",
      "toastPalierChange": "Palier changé"
    },
```

- [ ] **Step 2: Edit `messages/en.json`**

Replace:
```json
    "abonnement": {
      "titre": "Subscription",
      "description": "Current plan and number of tenders processed this month.",
      "usage": "{utilise}/{quota} tenders processed this month"
    },
```
with:
```json
    "abonnement": {
      "titre": "Subscription",
      "description": "Current plan and number of tenders processed this month.",
      "usage": "{utilise}/{quota} tenders processed this month",
      "bandeauSuspendu": "Subscription suspended. Settle your payment to keep processing tenders.",
      "boutonChangerPalier": "Change plan",
      "dialogueTitre": "Change plan",
      "dialogueDescription": "The free Discovery plan activates immediately. Paid plans require an upcoming payment integration.",
      "quotaParMois": "{quota} tenders/month",
      "bientotDisponible": "Coming soon",
      "boutonActiver": "Activate",
      "toastPalierChange": "Plan changed"
    },
```

- [ ] **Step 3: Verify JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add messages/fr.json messages/en.json
git commit -m "feat(i18n): traductions dialogue changement de palier et suspension"
```

---

### Task 8: UI — `ChangerPalierDialog` + bandeau de suspension dans `AbonnementCard`

**Files:**
- Create: `app/(app)/parametres/changer-palier-dialog.tsx`
- Modify: `app/(app)/parametres/abonnement-card.tsx`
- Modify: `app/(app)/parametres/page.tsx`

**Interfaces:**
- Consumes: `changerPalierDecouverte` (Task 6), `PALIERS_INFO` (Task 5), `PlanAbonnement` (Task 2), translation keys (Task 7).
- Produces: `ChangerPalierDialog({ palierActuel }: { palierActuel: PlanAbonnement })` React client component. `AbonnementCard` gains a required `estAdmin: boolean` prop.

- [ ] **Step 1: Write `changer-palier-dialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { changerPalierDecouverte } from "@/lib/abonnement/actions";
import { PALIERS_INFO } from "@/lib/abonnement/paliers";
import type { PlanAbonnement } from "@/lib/abonnement/types";

export function ChangerPalierDialog({ palierActuel }: { palierActuel: PlanAbonnement }) {
  const t = useTranslations("Parametres.abonnement");
  const tPlans = useTranslations("Plans");
  const [ouvert, setOuvert] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function activerDecouverte() {
    setEnCours(true);
    try {
      const resultat = await changerPalierDecouverte();
      if ("erreur" in resultat) {
        toast.error(resultat.erreur);
      } else {
        toast.success(t("toastPalierChange"));
        setOuvert(false);
      }
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={setOuvert}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {t("boutonChangerPalier")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogueTitre")}</DialogTitle>
          <DialogDescription>{t("dialogueDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {PALIERS_INFO.map((palier) => (
            <div
              key={palier.id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <p className="font-medium">{tPlans(palier.id)}</p>
                <p className="text-sm text-muted-foreground">
                  {t("quotaParMois", { quota: palier.quota })} — {palier.prixLabel}
                </p>
              </div>
              {palier.payant ? (
                <Button type="button" size="sm" variant="outline" disabled>
                  {t("bientotDisponible")}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={enCours || palierActuel === palier.id}
                  onClick={activerDecouverte}
                >
                  {t("boutonActiver")}
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update `abonnement-card.tsx`**

Replace the whole file:

```tsx
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Abonnement } from "@/lib/abonnement/types";
import { ChangerPalierDialog } from "./changer-palier-dialog";

export async function AbonnementCard({
  abonnement,
  utilise,
  estAdmin,
}: {
  abonnement: Abonnement;
  utilise: number;
  estAdmin: boolean;
}) {
  const t = await getTranslations("Parametres.abonnement");
  const tPlans = await getTranslations("Plans");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("titre")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {abonnement.statut === "suspendu" && (
          <p className="text-sm text-destructive">{t("bandeauSuspendu")}</p>
        )}
        <p className="text-sm">
          <span className="font-medium">{tPlans(abonnement.plan)}</span>
          {" — "}
          {t("usage", { utilise, quota: abonnement.quota_mensuel })}
        </p>
        {estAdmin && <ChangerPalierDialog palierActuel={abonnement.plan} />}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Update `page.tsx`**

In `app/(app)/parametres/page.tsx`, change:

```tsx
      {abonnementAvecUsage && (
        <AbonnementCard
          abonnement={abonnementAvecUsage.abonnement}
          utilise={abonnementAvecUsage.utilise}
        />
      )}
```

to:

```tsx
      {abonnementAvecUsage && (
        <AbonnementCard
          abonnement={abonnementAvecUsage.abonnement}
          utilise={abonnementAvecUsage.utilise}
          estAdmin={estAdmin}
        />
      )}
```

- [ ] **Step 4: Run `npx tsc --noEmit`**

Expected: clean — confirms the new required `estAdmin` prop is satisfied at the one call site, and that `ChangerPalierDialog`'s import/prop types line up.

- [ ] **Step 5: Manual verification (controller, real browser)**

With the Task 1 migration already pushed:
- As an admin on `/parametres`: "Changer de palier" button visible, dialog opens, Découverte row has an enabled "Activer" button (disabled only if already on Découverte), the 3 paid rows show a disabled "Bientôt disponible" button.
- Click "Activer" on Découverte → toast success, card now shows "Découverte — 0/1 AO traités ce mois" (or current count), dialog closes.
- As a non-admin member: no "Changer de palier" button renders at all.
- Temporarily set a test entreprise's `abonnement.statut` to `'suspendu'` via direct SQL → card shows the red suspension banner, visible to admin and non-admin alike; attempt a DAO upload → refused with the suspension message, not the quota message. Restore `statut='actif'` afterward.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/parametres/changer-palier-dialog.tsx" "app/(app)/parametres/abonnement-card.tsx" "app/(app)/parametres/page.tsx"
git commit -m "feat(abonnement): dialogue changement de palier et bandeau de suspension"
```

---

### Task 9: Full verification pass

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(abonnement): corrections suite a la verification finale"
```
