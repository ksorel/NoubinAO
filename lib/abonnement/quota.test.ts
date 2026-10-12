import { describe, expect, it, vi, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compterAoTraitesCeMois, verifierQuotaDisponible } from "./quota";

function creerSupabaseFake(options: {
  count: number | null;
  quotaMensuel: number | null | undefined;
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
