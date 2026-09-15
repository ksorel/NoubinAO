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
} from "./schema";
import { construireCheminStockageDao, construireCheminStockageExport } from "./storage-path";
import { mettreEnFileTraitementDao } from "./file-attente";
import { listerAppelsOffres, obtenirAppelOffres } from "./queries";
import { genererJalonsParDefaut } from "./retroplanning";
import { construirePlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import { genererSectionRedaction } from "./redaction/generer";
import type {
  AppelOffres,
  CleChecklistManuelle,
  CritereGoNoGo,
  JalonRetroplanning,
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
