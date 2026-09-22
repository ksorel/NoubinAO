import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairePagesPdf } from "@/lib/appels-offres/normalisation/pdf";
import { decouperEnAvis } from "./chunking";
import { mettreEnFileStructurationAvis } from "./file-attente";
import type { BompNumero } from "./types";

export async function traiterDecoupageBomp(
  supabase: SupabaseClient,
  bompNumeroId: string,
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("bomp_numero")
    .select("*")
    .eq("id", bompNumeroId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`BOMP introuvable : ${bompNumeroId}`);
  }

  const bompNumero = data as BompNumero;

  try {
    await supabase
      .from("bomp_numero")
      .update({ statut: "extraction_en_cours" })
      .eq("id", bompNumeroId);

    const { data: fichierData, error: erreurTelechargement } = await supabase.storage
      .from("bomp-national")
      .download(bompNumero.fichier_path);

    if (erreurTelechargement || !fichierData) {
      throw new Error("Échec du téléchargement du fichier BOMP depuis le stockage.");
    }

    const buffer = Buffer.from(await fichierData.arrayBuffer());
    const pages = await extrairePagesPdf(buffer);
    const texteComplet = pages.map((p) => p.texte).join("\n");

    const avis = decouperEnAvis(texteComplet);

    if (avis.length === 0) {
      throw new Error(
        "Aucun avis reconnu dans ce BOMP — motif ARTICLE 1 introuvable (mise en page différente ?).",
      );
    }

    const { data: lignesInserees, error: erreurInsertion } = await supabase
      .from("avis_ao_national")
      .insert(
        avis.map((a) => ({
          bomp_numero_id: bompNumeroId,
          reference: a.reference,
          texte_brut: a.texteBrut,
        })),
      )
      .select("id");

    if (erreurInsertion || !lignesInserees) {
      throw new Error(`Échec de l'insertion des avis : ${erreurInsertion?.message}`);
    }

    await supabase
      .from("bomp_numero")
      .update({ nombre_avis_extraits: lignesInserees.length })
      .eq("id", bompNumeroId);

    for (const ligne of lignesInserees) {
      await mettreEnFileStructurationAvis(ligne.id);
    }
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase
      .from("bomp_numero")
      .update({ statut: "erreur", erreur_message: message })
      .eq("id", bompNumeroId);
    throw erreur;
  }
}
