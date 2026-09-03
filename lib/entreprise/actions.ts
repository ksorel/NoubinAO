"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const creerEntrepriseSchema = z.object({
  nom: z.string().trim().min(1, "Le nom de l'entreprise est requis").max(200),
  rccm: z.string().trim().max(50).optional(),
  nomUtilisateur: z.string().trim().min(1, "Votre nom est requis").max(200),
});

export async function creerEntreprise(formData: FormData) {
  const parsed = creerEntrepriseSchema.safeParse({
    nom: formData.get("nom"),
    rccm: formData.get("rccm") || undefined,
    nomUtilisateur: formData.get("nomUtilisateur"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("creer_entreprise", {
    p_nom: parsed.data.nom,
    p_rccm: parsed.data.rccm ?? null,
    p_nom_utilisateur: parsed.data.nomUtilisateur,
  });

  if (error) {
    // DIAGNOSTIC TEMPORAIRE — à retirer une fois la cause confirmée.
    return { erreur: `Impossible de créer l'entreprise : ${error.message} (${error.code ?? "sans code"})` };
  }

  redirect("/bibliotheque");
}
