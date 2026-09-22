"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import { obtenirUtilisateurEstSuperAdmin } from "./queries";
import { demarrerUploadBompSchema, confirmerUploadBompSchema } from "./schema";
import { mettreEnFileDecoupageBomp } from "./file-attente";

// Un vrai BOMP (~23 Mo) ne peut pas transiter par une Server Action — la
// limite de corps de requête de la plateforme Vercel elle-même (~4,5 Mo)
// rejette la requête avec un 413 bien avant que le code applicatif ne
// s'exécute, indépendamment du bodySizeLimit Next.js (voir schema.ts).
// L'envoi se fait donc en deux temps : cette fonction ne reçoit que le nom
// du fichier (quelques octets) et retourne une URL signée Supabase
// Storage ; le fichier lui-même part directement du navigateur vers le
// stockage (upload-bomp-form.tsx), sans jamais passer par une fonction
// Vercel.
export async function demarrerUploadBomp(
  nomFichierOriginal: string,
): Promise<
  | { erreur: string }
  | { succes: true; cheminStockage: string; signedUrl: string; token: string }
> {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) return { erreur: "Non autorisé." };

  const parsed = demarrerUploadBompSchema.safeParse({ nomFichier: nomFichierOriginal });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Nom de fichier invalide" };
  }

  const nomNettoye = parsed.data.nomFichier.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cheminStockage = `${randomUUID()}-${nomNettoye}`;

  const supabase = await createClient();

  const { data, error } = await supabase.storage
    .from("bomp-national")
    .createSignedUploadUrl(cheminStockage);

  if (error || !data) {
    return { erreur: "Échec de la préparation de l'envoi. Réessayez." };
  }

  return {
    succes: true as const,
    cheminStockage,
    signedUrl: data.signedUrl,
    token: data.token,
  };
}

// Appelée une fois le fichier effectivement envoyé au stockage (côté
// navigateur, via l'URL signée ci-dessus) — crée la ligne bomp_numero et
// met en file le traitement. Ne reçoit plus jamais le contenu du fichier,
// seulement son chemin déjà en place.
export async function confirmerUploadBomp(input: {
  numero: string;
  datePublication: string;
  cheminStockage: string;
}): Promise<{ erreur: string } | { succes: true }> {
  const estSuperAdmin = await obtenirUtilisateurEstSuperAdmin();
  if (!estSuperAdmin) return { erreur: "Non autorisé." };

  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = confirmerUploadBompSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { numero, datePublication, cheminStockage } = parsed.data;
  const bompNumeroId = randomUUID();

  const supabase = await createClient();

  const { error: erreurInsertion } = await supabase.from("bomp_numero").insert({
    id: bompNumeroId,
    numero,
    date_publication: datePublication,
    fichier_path: cheminStockage,
    cree_par: utilisateur.id,
  });

  if (erreurInsertion) {
    const { error: erreurSuppressionFichier } = await supabase.storage
      .from("bomp-national")
      .remove([cheminStockage]);

    if (erreurSuppressionFichier) {
      console.error(
        "Échec de la suppression du fichier BOMP après échec d'insertion bomp_numero. " +
          "Fichier orphelin dans le stockage.",
        { cheminStockage, erreur: erreurSuppressionFichier.message },
      );
    }

    return { erreur: "Échec de l'enregistrement du BOMP. Réessayez." };
  }

  try {
    await mettreEnFileDecoupageBomp(bompNumeroId);
  } catch {
    const { error: erreurSuppression } = await supabase
      .from("bomp_numero")
      .delete()
      .eq("id", bompNumeroId);

    if (erreurSuppression) {
      console.error(
        "Échec du rollback bomp_numero après échec de mise en file. " +
          "Ligne orpheline à nettoyer manuellement.",
        { bompNumeroId, erreur: erreurSuppression.message },
      );
    } else {
      const { error: erreurSuppressionFichier } = await supabase.storage
        .from("bomp-national")
        .remove([cheminStockage]);

      if (erreurSuppressionFichier) {
        console.error(
          "Échec de la suppression du fichier BOMP après rollback bomp_numero. " +
            "Fichier orphelin dans le stockage.",
          { cheminStockage, erreur: erreurSuppressionFichier.message },
        );
      }
    }

    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/admin/veille");
  return { succes: true as const };
}

export async function importerAvis(
  avisId: string,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("importer_avis_national", {
    p_avis_id: avisId,
    p_entreprise_id: utilisateur.entreprise_id,
    p_utilisateur_id: utilisateur.id,
  });

  // Code Postgres 23505 = violation de contrainte unique
  // (avis_id, entreprise_id) : déjà importé (double-clic, autre onglet).
  if (error?.code === "23505") {
    return { erreur: "Cet avis a déjà été importé." };
  }

  if (error || !data) {
    return { erreur: "Échec de l'import. Réessayez." };
  }

  revalidatePath("/veille");
  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId: data as string };
}
