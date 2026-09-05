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
      const { error: erreurStatutNormalisation } = await supabase
        .from("appel_offres")
        .update({ statut_traitement: "normalisation" })
        .eq("id", appelOffresId);

      if (erreurStatutNormalisation) {
        throw new Error("Échec de la mise à jour du statut 'normalisation'.");
      }

      const { data: fichierData, error: erreurTelechargement } = await supabase.storage
        .from("documents")
        .download(appelOffres.fichier_dao_path);

      if (erreurTelechargement || !fichierData) {
        throw new Error("Échec du téléchargement du fichier DAO depuis le stockage.");
      }

      const buffer = Buffer.from(await fichierData.arrayBuffer());
      const resultat = await normaliserDao(buffer, mimeType);
      markdown = resultat.markdown;

      const { error: erreurEnregistrementMarkdown } = await supabase
        .from("appel_offres")
        .update({ dao_markdown: markdown })
        .eq("id", appelOffresId);

      if (erreurEnregistrementMarkdown) {
        throw new Error("Échec de l'enregistrement du markdown normalisé.");
      }
    }

    const { error: erreurStatutExtraction } = await supabase
      .from("appel_offres")
      .update({ statut_traitement: "extraction" })
      .eq("id", appelOffresId);

    if (erreurStatutExtraction) {
      throw new Error("Échec de la mise à jour du statut 'extraction'.");
    }

    const sections = decouperParSection(markdown);
    const extraction = await extraireInformationsAo(sections);

    const { error: erreurSuppressionExigences } = await supabase
      .from("exigence_ao")
      .delete()
      .eq("appel_offres_id", appelOffresId);

    if (erreurSuppressionExigences) {
      throw new Error("Échec de la suppression des exigences existantes.");
    }

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

    const { error: erreurMiseAJourFinale } = await supabase
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

    if (erreurMiseAJourFinale) {
      throw new Error("Échec de la mise à jour finale de l'appel d'offres.");
    }

    // Best-effort : une erreur ici ne doit jamais faire échouer un
    // traitement par ailleurs réussi. Filet de sécurité si l'insertion
    // échoue malgré tout : le sous-projet 2 fait un get-or-create à la
    // lecture (voir spec).
    try {
      const { error: erreurDossierReponse } = await supabase
        .from("dossier_reponse")
        .insert({ appel_offres_id: appelOffresId });

      if (erreurDossierReponse) {
        console.error(
          "Échec de la création du dossier_reponse (best-effort) :",
          erreurDossierReponse.message,
        );
      }
    } catch (erreurInattendue) {
      console.error(
        "Échec inattendu de la création du dossier_reponse (best-effort) :",
        erreurInattendue,
      );
    }
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase
      .from("appel_offres")
      .update({ statut_traitement: "erreur", erreur_traitement: message })
      .eq("id", appelOffresId);
    throw erreur;
  }
}
