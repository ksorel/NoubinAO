"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import {
  televerserDaoSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  mettreAJourEvaluationGoNoGoSchema,
  creerJalonSchema,
  creerSectionBpuSchema,
  ligneBpuSchema,
  tauxFraisStructureDefautSchema,
  membreGroupementSchema,
} from "./schema";
import {
  construireCheminStockageDao,
  construireCheminStockageExport,
  construireCheminStockageModeleCv,
  construireCheminStockageCvTransforme,
} from "./storage-path";
import { normaliserDao } from "./normalisation/normaliser";
import { genererContenuCvTransforme } from "./cv-transformation";
import { genererDocumentCvTransforme } from "./export/cv-docx";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres, obtenirAppelOffres } from "./queries";
import { genererJalonsParDefaut } from "./retroplanning";
import { construirePlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import { genererSectionRedaction } from "./redaction/generer";
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  CritereGoNoGo,
  CvTransforme,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
  StatutPipelineAo,
  StatutSectionDossier,
} from "./types";
import type { Document } from "@/lib/documents/types";

export async function televerserDao(
  formData: FormData,
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({
    fichier: formData.get("fichier"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const appelOffresId = randomUUID();
  const cheminStockage = construireCheminStockageDao(
    utilisateur.entreprise_id,
    appelOffresId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminStockage,
    fichier_dao_nom_original: fichier.name,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    const { error: erreurSuppressionFichier } = await supabase.storage
      .from("documents")
      .remove([cheminStockage]);

    if (erreurSuppressionFichier) {
      console.error(
        "Échec de la suppression du fichier DAO après échec d'insertion appel_offres. " +
          "Fichier orphelin dans le stockage.",
        { cheminStockage, erreur: erreurSuppressionFichier.message },
      );
    }

    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  try {
    await mettreEnFileTraitementDao(appelOffresId, fichier.type);
  } catch {
    const { error: erreurSuppression } = await supabase
      .from("appel_offres")
      .delete()
      .eq("id", appelOffresId);

    if (erreurSuppression) {
      console.error(
        "Échec du rollback appel_offres après échec de mise en file. " +
          "Ligne orpheline à nettoyer manuellement.",
        { appelOffresId, erreur: erreurSuppression.message },
      );
    } else {
      const { error: erreurSuppressionFichier } = await supabase.storage
        .from("documents")
        .remove([cheminStockage]);

      if (erreurSuppressionFichier) {
        console.error(
          "Échec de la suppression du fichier DAO après rollback appel_offres. " +
            "Fichier orphelin dans le stockage.",
          { cheminStockage, erreur: erreurSuppressionFichier.message },
        );
      }
    }

    return { erreur: "Échec de la mise en file du traitement. Réessayez." };
  }

  revalidatePath("/appels-offres");
  return { succes: true as const, appelOffresId };
}

export async function supprimerAppelOffres(
  appelOffresId: string,
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error: erreurSuppression } = await supabase
    .from("appel_offres")
    .delete()
    .eq("id", appelOffresId);

  if (erreurSuppression) {
    return { erreur: "Échec de la suppression. Réessayez." };
  }

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function obtenirAppelsOffresActualises(): Promise<AppelOffres[]> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return [];

  return listerAppelsOffres(utilisateur.entreprise_id);
}

export async function modifierAppelOffres(
  appelOffresId: string,
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierAppelOffresSchema.safeParse({
    titre: formData.get("titre"),
    acheteur: formData.get("acheteur"),
    secteur: formData.get("secteur"),
    dateLimite: formData.get("dateLimite"),
    montantCaution: formData.get("montantCaution"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const { titre, acheteur, secteur, dateLimite, montantCaution } = parsed.data;
  const dateLimiteIso = dateLimite ? `${dateLimite}:00Z` : null;

  const supabase = await createClient();

  const { error } = await supabase
    .from("appel_offres")
    .update({
      titre,
      acheteur,
      secteur,
      date_limite: dateLimiteIso,
      montant_caution: montantCaution,
    })
    .eq("id", appelOffresId);

  if (error) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function genererUrlTelechargementDao(
  cheminStockage: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Impossible de générer le lien." };
  return { url: data.signedUrl };
}

export async function modifierStatutPipeline(
  appelOffresId: string,
  statutPipeline: StatutPipelineAo,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierStatutPipelineSchema.safeParse({ statutPipeline });

  if (!parsed.success) {
    return { erreur: "Statut invalide" };
  }

  const supabase = await createClient();

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // modifiées : sans lui, un id périmé ou appartenant à une autre
  // entreprise (filtré par les policies RLS sur .update()) renverrait
  // {succes: true} sans qu'aucune ligne n'ait été écrite. Défense en
  // profondeur — la liste affichée dans /pipeline est déjà scopée par
  // entreprise_id, donc ce cas n'est pas exploitable aujourd'hui.
  const { data, error } = await supabase
    .from("appel_offres")
    .update({ statut_pipeline: parsed.data.statutPipeline })
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour du statut. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath("/pipeline");
  return { succes: true as const };
}

export async function associerDocumentAExigence(
  appelOffresId: string,
  exigenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("exigence_document").insert({
    exigence_ao_id: exigenceId,
    document_id: documentId,
    created_by: utilisateur.id,
  });

  // Code Postgres 23505 = violation de contrainte unique : l'association
  // existe déjà (ex. double-clic, ou déjà associée dans un autre onglet).
  // Traité comme un succès idempotent, pas une erreur utilisateur.
  if (error && error.code !== "23505") {
    return { erreur: "Échec de l'association. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function dissocierDocumentAExigence(
  appelOffresId: string,
  exigenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // supprimées — même défense en profondeur que modifierStatutPipeline
  // ci-dessus : sans elle, un couple exigence/document qui ne correspond à
  // aucune ligne (ids périmés, déjà dissocié dans un autre onglet)
  // renverrait {succes: true} sans qu'aucune ligne n'ait été supprimée.
  const { data, error } = await supabase
    .from("exigence_document")
    .delete()
    .eq("exigence_ao_id", exigenceId)
    .eq("document_id", documentId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la dissociation. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Association introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function exporterDossierReponse(
  appelOffresId: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
  );

  const buffer = await genererDocumentWord(plan);
  const cheminStockage = construireCheminStockageExport(utilisateur.entreprise_id, appelOffresId);

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de la génération du dossier. Réessayez." };
  }

  const { error: erreurMiseAJour } = await supabase
    .from("dossier_reponse")
    .update({
      export_path: cheminStockage,
      exporte_le: new Date().toISOString(),
      statut_relecture: "exporte",
    })
    .eq("appel_offres_id", appelOffresId);

  if (erreurMiseAJour) {
    return { erreur: "Échec de la génération du dossier. Réessayez." };
  }

  const { data, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !data) return { erreur: "Impossible de générer le lien." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { url: data.signedUrl };
}

export async function genererContenuSection(
  appelOffresId: string,
  titreSection: string,
  documentIds: string[],
): Promise<
  | { erreur: string }
  | { succes: true; sectionId: string; contenu: string; statut: StatutSectionDossier }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const supabase = await createClient();

  let documentsSource: Document[] = [];
  if (documentIds.length > 0) {
    const { data, error: erreurDocuments } = await supabase
      .from("document")
      .select("*")
      .in("id", documentIds);

    if (erreurDocuments) {
      return { erreur: "Échec de la lecture des documents source. Réessayez." };
    }
    documentsSource = (data ?? []) as Document[];
  }

  // La génération elle-même échoue avant toute écriture en base : un échec
  // ici ne doit jamais écraser le contenu/statut d'une section déjà
  // validée par une régénération précédente ratée.
  let contenu: string;
  try {
    contenu = await genererSectionRedaction(
      titreSection,
      resultat.appelOffres.dao_markdown,
      documentsSource,
    );
  } catch {
    return { erreur: "Échec de la génération. Réessayez." };
  }

  const { data: section, error: erreurUpsert } = await supabase
    .from("section_dossier")
    .upsert(
      {
        dossier_reponse_id: resultat.dossierReponse.id,
        titre: titreSection,
        contenu,
        statut: "brouillon",
        generated_at: new Date().toISOString(),
        created_by: utilisateur.id,
      },
      { onConflict: "dossier_reponse_id,titre" },
    )
    .select("id")
    .maybeSingle();

  if (erreurUpsert || !section) {
    return { erreur: "Échec de l'enregistrement de la section. Réessayez." };
  }

  const { error: erreurSuppressionLiens } = await supabase
    .from("section_document")
    .delete()
    .eq("section_dossier_id", section.id);

  if (erreurSuppressionLiens) {
    return { erreur: "Échec de l'enregistrement des sources. Réessayez." };
  }

  if (documentsSource.length > 0) {
    const { error: erreurInsertionLiens } = await supabase.from("section_document").insert(
      documentsSource.map((document) => ({
        section_dossier_id: section.id,
        document_id: document.id,
      })),
    );

    if (erreurInsertionLiens) {
      return { erreur: "Échec de l'enregistrement des sources. Réessayez." };
    }
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, sectionId: section.id, contenu, statut: "brouillon" };
}

export async function modifierContenuSection(
  appelOffresId: string,
  sectionId: string,
  contenu: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_dossier")
    .update({ contenu })
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Section introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function validerSection(
  appelOffresId: string,
  sectionId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_dossier")
    .update({ statut: "validee" })
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la validation. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Section introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function devaliderSection(
  appelOffresId: string,
  sectionId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_dossier")
    .update({ statut: "brouillon" })
    .eq("id", sectionId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Section introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function assignerResponsable(
  appelOffresId: string,
  utilisateurId: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // Le responsable assigné doit appartenir à la même entreprise que
  // l'appelant — la policy RLS sur appel_offres protège quelle LIGNE est
  // modifiable, pas la VALEUR écrite dans assigne_a, et la simple foreign
  // key vers utilisateur(id) n'exige que l'existence de l'id, pas son
  // appartenance à la bonne entreprise.
  if (utilisateurId !== null) {
    const { data: membre } = await supabase
      .from("utilisateur")
      .select("id")
      .eq("id", utilisateurId)
      .eq("entreprise_id", utilisateur.entreprise_id)
      .maybeSingle();

    if (!membre) {
      return { erreur: "Responsable invalide." };
    }
  }

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // modifiées — même défense en profondeur que modifierStatutPipeline.
  const { data, error } = await supabase
    .from("appel_offres")
    .update({ assigne_a: utilisateurId })
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de l'assignation. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath("/pipeline");
  return { succes: true as const };
}

// Pas de vérification applicative supplémentaire ici (contrairement à
// assignerResponsable) : la policy RLS checklist_item_dossier_insert_membres
// couvre à la fois l'appartenance de la ligne ET la valeur de coche_par
// (with check coche_par = auth.uid() and exists(...)), donc le RLS seul
// suffit à bloquer toute tentative de forger ces valeurs.
export async function basculerChecklistManuelle(
  appelOffresId: string,
  dossierReponseId: string,
  cleItem: CleChecklistManuelle,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: existant, error: erreurLecture } = await supabase
    .from("checklist_item_dossier")
    .select("id")
    .eq("dossier_reponse_id", dossierReponseId)
    .eq("cle_item", cleItem)
    .maybeSingle();

  if (erreurLecture) return { erreur: "Échec de la mise à jour. Réessayez." };

  if (existant) {
    const { error } = await supabase
      .from("checklist_item_dossier")
      .delete()
      .eq("id", existant.id);
    if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  } else {
    const { error } = await supabase.from("checklist_item_dossier").insert({
      dossier_reponse_id: dossierReponseId,
      cle_item: cleItem,
      coche_par: utilisateur.id,
    });
    if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function mettreAJourEvaluationGoNoGo(
  appelOffresId: string,
  input: {
    critereJuridique: CritereGoNoGo;
    noteJuridique: string | null;
    critereFaisabilite: CritereGoNoGo;
    noteFaisabilite: string | null;
    critereRentabilite: CritereGoNoGo;
    noteRentabilite: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = mettreAJourEvaluationGoNoGoSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // modifiées — même défense en profondeur que modifierStatutPipeline :
  // sans elle, un appel_offres_id inexistant ou appartenant à une autre
  // entreprise (filtré par la policy RLS sur .update()) renverrait
  // {succes: true} sans qu'aucune ligne n'ait été modifiée.
  const { data, error } = await supabase
    .from("evaluation_go_no_go")
    .update({
      critere_juridique: parsed.data.critereJuridique,
      note_juridique: parsed.data.noteJuridique,
      critere_faisabilite: parsed.data.critereFaisabilite,
      note_faisabilite: parsed.data.noteFaisabilite,
      critere_rentabilite: parsed.data.critereRentabilite,
      note_rentabilite: parsed.data.noteRentabilite,
      modifie_par: utilisateur.id,
      modifie_le: new Date().toISOString(),
    })
    .eq("appel_offres_id", appelOffresId)
    .select("id");

  if (error) return { erreur: "Échec de l'enregistrement. Réessayez." };

  if (!data || data.length === 0) {
    return { erreur: "Évaluation introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function genererJalonsRetroplanning(
  appelOffresId: string,
): Promise<{ erreur: string } | { succes: true; jalons: JalonRetroplanning[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: appelOffres, error: erreurLecture } = await supabase
    .from("appel_offres")
    .select("date_limite")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (erreurLecture || !appelOffres) return { erreur: "Appel d'offres introuvable." };
  if (!appelOffres.date_limite) return { erreur: "Date limite non renseignée." };

  const jalons = genererJalonsParDefaut(new Date(appelOffres.date_limite));

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .insert(
      jalons.map((j, index) => ({
        appel_offres_id: appelOffresId,
        libelle: j.libelle,
        date_cible: j.dateCible,
        ordre: index,
        created_by: utilisateur.id,
      })),
    )
    .select("*");

  if (error || !data) return { erreur: "Échec de la génération du rétroplanning. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, jalons: data as JalonRetroplanning[] };
}

export async function creerJalon(
  appelOffresId: string,
  input: { libelle: string; dateCible: string },
): Promise<{ erreur: string } | { succes: true; jalon: JalonRetroplanning }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerJalonSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: dernierJalon } = await supabase
    .from("jalon_retroplanning")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = dernierJalon ? dernierJalon.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .insert({
      appel_offres_id: appelOffresId,
      libelle: parsed.data.libelle,
      date_cible: parsed.data.dateCible,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout du jalon. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, jalon: data as JalonRetroplanning };
}

export async function basculerJalonCoche(
  appelOffresId: string,
  jalonId: string,
  coche: boolean,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .update({
      coche,
      coche_par: coche ? utilisateur.id : null,
      coche_le: coche ? new Date().toISOString() : null,
    })
    .eq("id", jalonId)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Jalon introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerJalon(
  appelOffresId: string,
  jalonId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .delete()
    .eq("id", jalonId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Jalon introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function creerSectionBpu(
  appelOffresId: string,
  titre: string,
): Promise<{ erreur: string } | { succes: true; section: SectionBpu }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerSectionBpuSchema.safeParse({ titre });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Titre invalide" };
  }

  const supabase = await createClient();

  const { data: derniereSection } = await supabase
    .from("section_bpu")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = derniereSection ? derniereSection.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("section_bpu")
    .insert({
      appel_offres_id: appelOffresId,
      titre: parsed.data.titre,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de la création de la section. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, section: data as SectionBpu };
}

export async function renommerSectionBpu(
  appelOffresId: string,
  sectionId: string,
  titre: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = creerSectionBpuSchema.safeParse({ titre });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Titre invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_bpu")
    .update({ titre: parsed.data.titre })
    .eq("id", sectionId)
    .select("id");

  if (error) return { erreur: "Échec du renommage. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Section introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Permutation de l'ordre avec la section voisine (précédente si
// sens === "haut", suivante si "bas"). Deux UPDATE séquentiels, pas une
// transaction atomique — limitation mineure acceptée (voir spec, section
// États et erreurs).
export async function deplacerSectionBpu(
  appelOffresId: string,
  sectionId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true; sections: SectionBpu[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: sections, error: erreurLecture } = await supabase
    .from("section_bpu")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !sections) return { erreur: "Échec du déplacement. Réessayez." };

  const index = sections.findIndex((s) => s.id === sectionId);
  if (index === -1) return { erreur: "Section introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= sections.length) {
    return { succes: true as const, sections: sections as SectionBpu[] };
  }

  const section = sections[index];
  const voisine = sections[indexVoisin];
  const ordreSection = section.ordre;
  const ordreVoisine = voisine.ordre;

  const { error: erreurA } = await supabase
    .from("section_bpu")
    .update({ ordre: ordreVoisine })
    .eq("id", section.id);

  const { error: erreurB } = await supabase
    .from("section_bpu")
    .update({ ordre: ordreSection })
    .eq("id", voisine.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);

  const sectionsReordonnees = sections
    .map((s) => {
      if (s.id === section.id) return { ...s, ordre: ordreVoisine };
      if (s.id === voisine.id) return { ...s, ordre: ordreSection };
      return s;
    })
    .sort((a, b) => a.ordre - b.ordre);

  return { succes: true as const, sections: sectionsReordonnees as SectionBpu[] };
}

export async function supprimerSectionBpu(
  appelOffresId: string,
  sectionId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("section_bpu")
    .delete()
    .eq("id", sectionId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Section introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function creerLigneBpu(
  appelOffresId: string,
  sectionId: string,
  input: {
    codeArticle: string | null;
    designation: string;
    unite: string;
    quantite: string;
    prixUnitaire: string | null;
    debourseSec: string | null;
    tauxFraisStructure: string | null;
  },
): Promise<{ erreur: string } | { succes: true; ligne: LigneBpu }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneBpuSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: derniereLigne } = await supabase
    .from("ligne_bpu")
    .select("ordre")
    .eq("section_bpu_id", sectionId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = derniereLigne ? derniereLigne.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("ligne_bpu")
    .insert({
      section_bpu_id: sectionId,
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
      debourse_sec: parsed.data.debourseSec,
      taux_frais_structure: parsed.data.tauxFraisStructure,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout de la ligne. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, ligne: data as LigneBpu };
}

export async function modifierLigneBpu(
  appelOffresId: string,
  ligneId: string,
  input: {
    codeArticle: string | null;
    designation: string;
    unite: string;
    quantite: string;
    prixUnitaire: string | null;
    debourseSec: string | null;
    tauxFraisStructure: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneBpuSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ligne_bpu")
    .update({
      code_article: parsed.data.codeArticle,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      prix_unitaire: parsed.data.prixUnitaire,
      debourse_sec: parsed.data.debourseSec,
      taux_frais_structure: parsed.data.tauxFraisStructure,
    })
    .eq("id", ligneId)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Ligne introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Même mécanique de permutation que deplacerSectionBpu, scopée à la
// section (les lignes ne se déplacent jamais d'une section à l'autre
// dans ce sous-projet).
export async function deplacerLigneBpu(
  appelOffresId: string,
  sectionId: string,
  ligneId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true; lignes: LigneBpu[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: lignes, error: erreurLecture } = await supabase
    .from("ligne_bpu")
    .select("*")
    .eq("section_bpu_id", sectionId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !lignes) return { erreur: "Échec du déplacement. Réessayez." };

  const index = lignes.findIndex((l) => l.id === ligneId);
  if (index === -1) return { erreur: "Ligne introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= lignes.length) {
    return { succes: true as const, lignes: lignes as LigneBpu[] };
  }

  const ligne = lignes[index];
  const voisine = lignes[indexVoisin];
  const ordreLigne = ligne.ordre;
  const ordreVoisine = voisine.ordre;

  const { error: erreurA } = await supabase
    .from("ligne_bpu")
    .update({ ordre: ordreVoisine })
    .eq("id", ligne.id);

  const { error: erreurB } = await supabase
    .from("ligne_bpu")
    .update({ ordre: ordreLigne })
    .eq("id", voisine.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);

  const lignesReordonnees = lignes
    .map((l) => {
      if (l.id === ligne.id) return { ...l, ordre: ordreVoisine };
      if (l.id === voisine.id) return { ...l, ordre: ordreLigne };
      return l;
    })
    .sort((a, b) => a.ordre - b.ordre);

  return { succes: true as const, lignes: lignesReordonnees as LigneBpu[] };
}

export async function supprimerLigneBpu(
  appelOffresId: string,
  ligneId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ligne_bpu")
    .delete()
    .eq("id", ligneId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Ligne introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function modifierTauxFraisStructureDefaut(
  taux: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = tauxFraisStructureDefautSchema.safeParse({ taux });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Taux invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({ taux_frais_structure_defaut: parsed.data.taux })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres");
  return { succes: true as const };
}

export async function creerMembreGroupement(
  appelOffresId: string,
  input: { nom: string; role: string; pourcentage: string | null },
): Promise<{ erreur: string } | { succes: true; membre: MembreGroupement }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = membreGroupementSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: dernierMembre } = await supabase
    .from("membre_groupement")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = dernierMembre ? dernierMembre.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("membre_groupement")
    .insert({
      appel_offres_id: appelOffresId,
      nom: parsed.data.nom,
      role: parsed.data.role,
      pourcentage: parsed.data.pourcentage,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout du membre. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, membre: data as MembreGroupement };
}

export async function modifierMembreGroupement(
  appelOffresId: string,
  membreId: string,
  input: { nom: string; role: string; pourcentage: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = membreGroupementSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("membre_groupement")
    .update({
      nom: parsed.data.nom,
      role: parsed.data.role,
      pourcentage: parsed.data.pourcentage,
    })
    .eq("id", membreId)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Membre introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Même mécanique de permutation que deplacerSectionBpu, scopée
// directement à l'AO (pas de parent intermédiaire comme section_bpu
// pour ligne_bpu — membre_groupement est un niveau plat).
export async function deplacerMembreGroupement(
  appelOffresId: string,
  membreId: string,
  sens: "haut" | "bas",
): Promise<{ erreur: string } | { succes: true; membres: MembreGroupement[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: membres, error: erreurLecture } = await supabase
    .from("membre_groupement")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurLecture || !membres) return { erreur: "Échec du déplacement. Réessayez." };

  const index = membres.findIndex((m) => m.id === membreId);
  if (index === -1) return { erreur: "Membre introuvable." };

  const indexVoisin = sens === "haut" ? index - 1 : index + 1;
  if (indexVoisin < 0 || indexVoisin >= membres.length) {
    return { succes: true as const, membres: membres as MembreGroupement[] };
  }

  const membre = membres[index];
  const voisin = membres[indexVoisin];
  const ordreMembre = membre.ordre;
  const ordreVoisin = voisin.ordre;

  const { error: erreurA } = await supabase
    .from("membre_groupement")
    .update({ ordre: ordreVoisin })
    .eq("id", membre.id);

  const { error: erreurB } = await supabase
    .from("membre_groupement")
    .update({ ordre: ordreMembre })
    .eq("id", voisin.id);

  if (erreurA || erreurB) return { erreur: "Échec du déplacement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);

  const membresReordonnes = membres
    .map((m) => {
      if (m.id === membre.id) return { ...m, ordre: ordreVoisin };
      if (m.id === voisin.id) return { ...m, ordre: ordreMembre };
      return m;
    })
    .sort((a, b) => a.ordre - b.ordre);

  return { succes: true as const, membres: membresReordonnes as MembreGroupement[] };
}

export async function supprimerMembreGroupement(
  appelOffresId: string,
  membreId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("membre_groupement")
    .delete()
    .eq("id", membreId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Membre introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Même patron exact que basculerChecklistManuelle (existant plus haut
// dans ce fichier) : lecture par clé composite, delete si la ligne
// existe déjà, sinon insert. Contrairement à checklist_item_dossier,
// piece_membre_groupement ne trace pas d'auteur (coche_par) — la pièce
// d'un co-traitant externe n'a pas de notion d'auteur interne
// pertinente, seulement un état fourni/non fourni.
export async function basculerPieceMembreGroupement(
  appelOffresId: string,
  membreId: string,
  clePiece: ClePieceGroupement,
): Promise<{ erreur: string } | { succes: true; fournie: boolean }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: existant, error: erreurLecture } = await supabase
    .from("piece_membre_groupement")
    .select("id")
    .eq("membre_groupement_id", membreId)
    .eq("cle_piece", clePiece)
    .maybeSingle();

  if (erreurLecture) return { erreur: "Échec de la mise à jour. Réessayez." };

  if (existant) {
    const { error } = await supabase
      .from("piece_membre_groupement")
      .delete()
      .eq("id", existant.id);
    if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
    revalidatePath(`/appels-offres/${appelOffresId}`);
    return { succes: true as const, fournie: false };
  }

  const { error } = await supabase.from("piece_membre_groupement").insert({
    membre_groupement_id: membreId,
    cle_piece: clePiece,
  });
  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, fournie: true };
}

export async function televerserModeleCv(
  appelOffresId: string,
  formData: FormData,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = televerserDaoSchema.safeParse({ fichier: formData.get("fichier") });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const { fichier } = parsed.data;
  const cheminStockage = construireCheminStockageModeleCv(
    utilisateur.entreprise_id,
    appelOffresId,
    fichier.name,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, fichier, { contentType: fichier.type });

  if (erreurUpload) {
    return { erreur: "Échec de l'envoi du fichier. Réessayez." };
  }

  const buffer = Buffer.from(await fichier.arrayBuffer());
  // Best-effort, cohérent avec normaliserDocument (lib/documents/normalisation.ts) :
  // un modèle de CV illisible (PDF/DOCX corrompu, type inattendu) ne doit
  // pas faire échouer le téléversement — le modèle reste utilisable pour
  // l'affichage du nom de fichier même sans texte extrait.
  let markdown: string | null;
  try {
    const resultat = await normaliserDao(buffer, fichier.type);
    markdown = resultat.markdown;
  } catch (erreur) {
    console.error("Échec de la normalisation du modèle de CV :", erreur);
    markdown = null;
  }

  const { error: erreurMiseAJour } = await supabase
    .from("appel_offres")
    .update({
      modele_cv_path: cheminStockage,
      modele_cv_nom_original: fichier.name,
      modele_cv_markdown: markdown,
    })
    .eq("id", appelOffresId);

  if (erreurMiseAJour) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement du modèle. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function retirerModeleCv(
  appelOffresId: string,
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("appel_offres")
    .update({ modele_cv_path: null, modele_cv_nom_original: null, modele_cv_markdown: null })
    .eq("id", appelOffresId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function genererCvTransforme(
  appelOffresId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true; cvTransforme: CvTransforme }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: appelOffres, error: erreurAo } = await supabase
    .from("appel_offres")
    .select("modele_cv_markdown")
    .eq("id", appelOffresId)
    .maybeSingle();

  if (erreurAo || !appelOffres?.modele_cv_markdown) {
    return { erreur: "Aucun modèle de CV n'a été téléversé pour cet AO." };
  }

  const { data: document, error: erreurDocument } = await supabase
    .from("document")
    .select("contenu_markdown")
    .eq("id", documentId)
    .maybeSingle();

  if (erreurDocument || !document?.contenu_markdown) {
    return { erreur: "Ce CV n'a pas de contenu extrait. Réessayez de le téléverser." };
  }

  let contenuGenere: string;
  let bufferDocx: Buffer;
  try {
    contenuGenere = await genererContenuCvTransforme(
      document.contenu_markdown,
      appelOffres.modele_cv_markdown,
    );
    bufferDocx = await genererDocumentCvTransforme(contenuGenere);
  } catch {
    return { erreur: "Échec de la génération. Réessayez." };
  }
  const cheminExport = construireCheminStockageCvTransforme(
    utilisateur.entreprise_id,
    appelOffresId,
    documentId,
  );

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminExport, bufferDocx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de l'enregistrement du fichier généré. Réessayez." };
  }

  const { data, error: erreurUpsert } = await supabase
    .from("cv_transforme")
    .upsert(
      {
        appel_offres_id: appelOffresId,
        document_id: documentId,
        contenu_markdown: contenuGenere,
        export_path: cheminExport,
        genere_par: utilisateur.id,
        genere_le: new Date().toISOString(),
      },
      { onConflict: "appel_offres_id,document_id" },
    )
    .select("*")
    .maybeSingle();

  if (erreurUpsert || !data) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, cvTransforme: data as CvTransforme };
}

export async function genererUrlTelechargementCvTransforme(
  cheminStockage: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Impossible de générer le lien." };
  return { url: data.signedUrl };
}
