import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliserDao } from "./normalisation/normaliser";
import { decouperParSection } from "./normalisation/markdown";
import { extraireInformationsAo } from "./normalisation/extraire";
import type { AppelOffres } from "./types";

export async function traiterDao(
  supabase: SupabaseClient,
  appelOffresId: string,
  mimeType: string,
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", appelOffresId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`Appel d'offres introuvable : ${appelOffresId}`);
  }

  const appelOffres = data as AppelOffres;

  if (appelOffres.statut_traitement === "termine") {
    return;
  }

  try {
    let markdown = appelOffres.dao_markdown;

    if (!markdown) {
      await supabase
        .from("appel_offres")
        .update({ statut_traitement: "normalisation" })
        .eq("id", appelOffresId);

      const { data: fichierData, error: erreurTelechargement } = await supabase.storage
        .from("documents")
        .download(appelOffres.fichier_dao_path);

      if (erreurTelechargement || !fichierData) {
        throw new Error("Échec du téléchargement du fichier DAO depuis le stockage.");
      }

      const buffer = Buffer.from(await fichierData.arrayBuffer());
      const resultat = await normaliserDao(buffer, mimeType);
      markdown = resultat.markdown;

      await supabase
        .from("appel_offres")
        .update({ dao_markdown: markdown })
        .eq("id", appelOffresId);
    }

    await supabase
      .from("appel_offres")
      .update({ statut_traitement: "extraction" })
      .eq("id", appelOffresId);

    const sections = decouperParSection(markdown);
    const extraction = await extraireInformationsAo(sections);

    await supabase.from("exigence_ao").delete().eq("appel_offres_id", appelOffresId);

    if (extraction.exigences.length > 0) {
      const { error: erreurInsertion } = await supabase.from("exigence_ao").insert(
        extraction.exigences.map((exigence) => ({
          appel_offres_id: appelOffresId,
          type_exigence: exigence.type_exigence,
          libelle: exigence.libelle,
          description: exigence.description,
          ponderation: exigence.ponderation,
          source_section: exigence.source_section,
        })),
      );

      if (erreurInsertion) {
        throw new Error(`Échec de l'insertion des exigences : ${erreurInsertion.message}`);
      }
    }

    await supabase
      .from("appel_offres")
      .update({
        titre: extraction.titre,
        acheteur: extraction.acheteur,
        secteur: extraction.secteur,
        date_limite: extraction.date_limite,
        montant_caution: extraction.montant_caution,
        sommaire_attendu: extraction.sommaire_attendu,
        statut_traitement: "termine",
      })
      .eq("id", appelOffresId);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase
      .from("appel_offres")
      .update({ statut_traitement: "erreur", erreur_traitement: message })
      .eq("id", appelOffresId);
    throw erreur;
  }
}
