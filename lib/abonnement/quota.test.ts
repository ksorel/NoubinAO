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
