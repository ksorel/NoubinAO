"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifierQuotaDisponible } from "@/lib/abonnement/quota";
import { obtenirUtilisateurCourant } from "@/lib/utilisateur/queries";
import {
  demarrerTeleversementDaoSchema,
  televerserModeleCvSchema,
  modifierAppelOffresSchema,
  modifierStatutPipelineSchema,
  modifierResultatAoSchema,
  mettreAJourGoNoGoSchema,
  mettreAJourReponseGoNoGoSchema,
  typeMarcheGoNoGoSchema,
  questionGoNoGoSchema,
  modifierQuestionGoNoGoSchema,
  parametresGoNoGoSchema,
  creerJalonSchema,
  creerSectionBpuSchema,
  ligneBpuSchema,
  cotationFournisseurSchema,
  tauxFraisStructureDefautSchema,
  membreGroupementSchema,
  tourNegociationSchema,
  noteSimuleeSchema,
  articleDaoSchema,
  ligneSpecificationSchema,
  produitSchema,
  specificationProduitSchema,
  nomFichierPieceProduitSchema,
  dateValiditePieceProduitSchema,
  justificationKoSchema,
  conformiteForceeSchema,
  type TypePieceProduit,
  referenceProjetSchema,
  pvOuvertureSchema,
  pvOuvertureConcurrentSchema,
} from "./schema";
import {
  construireCheminStockageDao,
  construireCheminStockageExport,
  construireCheminStockageModeleCv,
  construireCheminStockageCvTransforme,
  construireCheminStockageExportBpu,
  construireCheminStockageExportGoNoGo,
  construireCheminStockageExportSectionIII,
  construireCheminStockageNegociationGreAGre,
  construireCheminStockagePieceProduit,
  construireCheminStockageDemandeAbe,
  construireCheminStockageExportPli,
} from "./storage-path";
import { construirePlanSectionIII } from "./export/section-iii";
import { genererDocumentSectionIII } from "./export/section-iii-docx";
import { produitKoSurAuMoinsUneLigne } from "./conformite-technique";
import { calculerAlertesIntegrite } from "./reference-integrite";
import { normaliserDocument } from "../documents/normalisation";
import { decouperParSection } from "./normalisation/markdown";
import { genererContenuCvTransforme } from "./cv-transformation";
import { genererDocumentCvTransforme } from "./export/cv-docx";
import { mettreEnFileTraitementDao, type FichierATraiter } from "./file-attente";
import {
  listerAppelsOffres,
  obtenirAppelOffres,
  listerBpu,
  obtenirOuCreerGoNoGo,
  listerTypesMarcheGoNoGo,
  listerQuestionsGoNoGo,
  listerReponsesGoNoGo,
  obtenirSyntheseGoNoGo,
  obtenirConformiteTechnique,
} from "./queries";
import { genererJalonsParDefaut, recalculerDatesJalonsSysteme } from "./retroplanning";
import {
  trouverMeilleureSuggestionPrix,
  type LigneBpuHistorique,
} from "./suggestion-prix-bpu";
import { construirePlanExport, type PlanExport } from "./export/plan";
import { genererDocumentWord } from "./export/docx";
import { genererPdfDossier } from "./export/pdf";
import type { LogoExport } from "./export/entete-pied-page";
import { genererClasseurExcelBpu, genererClasseurExcelDossier } from "./export/xlsx";
import { construirePlanExportGoNoGo } from "./export/go-no-go-plan";
import { genererDocumentWordGoNoGo } from "./export/go-no-go-docx";
import { genererClasseurExcelGoNoGo } from "./export/go-no-go-xlsx";
import { genererPdfGoNoGo } from "./export/go-no-go-pdf";
import { genererSectionRedaction } from "./redaction/generer";
import { genererSyntheseGoNoGo } from "./synthese-go-no-go/generer";
import { sommerMontants, compterLignesNonChiffrees } from "./bpu";
import { obtenirEntreprise, obtenirParametresGoNoGo } from "@/lib/utilisateur/queries";
import {
  identifierFormulaireStandard,
  genererLettreSoumission,
  genererDeclarationHonneur,
  genererPouvoirHabilitant,
  genererFormulaireIdentification,
  genererTableauDocuments,
  genererProforma,
  genererLettrePropositionRevisee,
  genererLettreDemandeAbe,
  genererFormulaireAbeVierge,
} from "./formulaires-standards";
import type {
  AppelOffres,
  AppelOffresReference,
  ArticleDao,
  ArticleProduit,
  CategorieQuestionGoNoGo,
  ClePieceGroupement,
  CleChecklistManuelle,
  ConformiteForcee,
  CotationFournisseur,
  CvTransforme,
  JalonRetroplanning,
  LigneBpu,
  LigneSpecification,
  MembreGroupement,
  Produit,
  PvOuvertureConcurrent,
  ReferenceProjet,
  ReponseGoNoGoValeur,
  SectionBpu,
  SpecificationProduit,
  StatutConformite,
  StatutPipelineAo,
  StatutSectionDossier,
  SyntheseGoNoGo,
  TourNegociationGreAGre,
} from "./types";
import type { Document } from "@/lib/documents/types";

export interface DemarrerUploadDao {
  nomOriginal: string;
  cheminStockage: string;
  token: string;
}

interface FichierATeleverserInput {
  nomOriginal: string;
  mimeType: string;
}

// Le corps d'une Server Action est plafonné par Vercel à ~4,5 Mo (voir le
// commentaire dans lib/appels-offres/schema.ts) : un DAO réel dépasse
// souvent ce plafond plateforme. demarrerTeleversementDao ne reçoit donc que
// les noms de fichiers et renvoie une URL signée par fichier ; le contenu
// est envoyé directement navigateur → Supabase Storage (voir
// televerser-dao-dialog.tsx), puis finaliserTeleversementDao enregistre
// l'appel d'offres une fois l'upload confirmé côté client.
export async function demarrerTeleversementDao(
  fichiers: FichierATeleverserInput[],
): Promise<
  { erreur: string } | { succes: true; appelOffresId: string; uploads: DemarrerUploadDao[] }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = demarrerTeleversementDaoSchema.safeParse({ fichiers });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const supabase = await createClient();

  try {
    const quota = await verifierQuotaDisponible(supabase, utilisateur.entreprise_id);
    if (!quota.autorise) {
      return {
        erreur: `Quota mensuel atteint (${quota.utilise}/${quota.quota} AO traités). Contactez-nous pour augmenter votre palier.`,
      };
    }
  } catch (erreur) {
    console.error("Échec de la vérification du quota avant téléversement DAO.", { erreur });
    return { erreur: "Échec de la vérification du quota. Réessayez." };
  }

  const appelOffresId = randomUUID();

  const uploads: DemarrerUploadDao[] = [];
  for (let i = 0; i < parsed.data.fichiers.length; i++) {
    const chemin = construireCheminStockageDao(
      utilisateur.entreprise_id,
      appelOffresId,
      parsed.data.fichiers[i].nomOriginal,
      i,
    );
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUploadUrl(chemin);

    if (error || !data) {
      return { erreur: "Échec de la préparation de l'envoi. Réessayez." };
    }

    uploads.push({
      nomOriginal: parsed.data.fichiers[i].nomOriginal,
      cheminStockage: chemin,
      token: data.token,
    });
  }

  return { succes: true as const, appelOffresId, uploads };
}

export async function finaliserTeleversementDao(
  appelOffresId: string,
  fichiers: FichierATeleverserInput[],
): Promise<{ erreur: string } | { succes: true; appelOffresId: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = demarrerTeleversementDaoSchema.safeParse({ fichiers });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };
  }

  const supabase = await createClient();

  // Chemins recalculés à l'identique de demarrerTeleversementDao (même
  // fonction déterministe, même ordre) - le client ne transmet que les noms,
  // jamais les chemins, pour ne pas lui faire confiance sur l'emplacement
  // final dans le stockage. Calculé avant le contrôle de quota car la
  // branche de refus ci-dessous en a désormais besoin pour nettoyer les
  // fichiers déjà envoyés dans le stockage.
  const cheminsFichiers = parsed.data.fichiers.map((fichier, index) =>
    construireCheminStockageDao(utilisateur.entreprise_id, appelOffresId, fichier.nomOriginal, index),
  );

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
    console.error("Échec de la vérification du quota lors de la finalisation du téléversement DAO.", {
      erreur,
    });
    return { erreur: "Échec de la vérification du quota. Réessayez." };
  }

  const { error: erreurInsertion } = await supabase.from("appel_offres").insert({
    id: appelOffresId,
    entreprise_id: utilisateur.entreprise_id,
    fichier_dao_path: cheminsFichiers[0],
    fichier_dao_nom_original: parsed.data.fichiers[0].nomOriginal,
    created_by: utilisateur.id,
  });

  if (erreurInsertion) {
    const { error: erreurSuppressionFichiers } = await supabase.storage
      .from("documents")
      .remove(cheminsFichiers);

    if (erreurSuppressionFichiers) {
      console.error(
        "Échec de la suppression des fichiers DAO après échec d'insertion appel_offres. " +
          "Fichiers orphelins dans le stockage.",
        { cheminsFichiers, erreur: erreurSuppressionFichiers.message },
      );
    }

    return { erreur: "Échec de l'enregistrement de l'appel d'offres. Réessayez." };
  }

  if (parsed.data.fichiers.length > 1) {
    const { error: erreurFichiersSupplementaires } = await supabase
      .from("fichier_dao_supplementaire")
      .insert(
        parsed.data.fichiers.slice(1).map((fichier, index) => ({
          appel_offres_id: appelOffresId,
          chemin_stockage: cheminsFichiers[index + 1],
          nom_original: fichier.nomOriginal,
          type_mime: fichier.mimeType,
          ordre: index + 1,
          created_by: utilisateur.id,
        })),
      );

    if (erreurFichiersSupplementaires) {
      const { error: erreurSuppression } = await supabase
        .from("appel_offres")
        .delete()
        .eq("id", appelOffresId);

      if (erreurSuppression) {
        console.error(
          "Échec du rollback appel_offres après échec d'insertion fichier_dao_supplementaire. " +
            "Ligne orpheline à nettoyer manuellement.",
          { appelOffresId, erreur: erreurSuppression.message },
        );
      } else {
        const { error: erreurSuppressionFichiers } = await supabase.storage
          .from("documents")
          .remove(cheminsFichiers);

        if (erreurSuppressionFichiers) {
          console.error(
            "Échec de la suppression des fichiers DAO après échec d'insertion fichier_dao_supplementaire. " +
              "Fichiers orphelins dans le stockage.",
            { cheminsFichiers, erreur: erreurSuppressionFichiers.message },
          );
        }
      }

      return { erreur: "Échec de l'enregistrement des fichiers du DAO. Réessayez." };
    }
  }

  try {
    const fichiersATraiter: FichierATraiter[] = parsed.data.fichiers.map((fichier, index) => ({
      cheminStockage: cheminsFichiers[index],
      mimeType: fichier.mimeType,
    }));
    await mettreEnFileTraitementDao(appelOffresId, fichiersATraiter);
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
      const { error: erreurSuppressionFichiers } = await supabase.storage
        .from("documents")
        .remove(cheminsFichiers);

      if (erreurSuppressionFichiers) {
        console.error(
          "Échec de la suppression des fichiers DAO après rollback appel_offres. " +
            "Fichiers orphelins dans le stockage.",
          { cheminsFichiers, erreur: erreurSuppressionFichiers.message },
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
  cheminStockage: string | null,
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

  if (cheminStockage) {
    await supabase.storage.from("documents").remove([cheminStockage]);
  }

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
    typeAcheteur: formData.get("typeAcheteur"),
    procedureMarche: formData.get("procedureMarche"),
    canalDepot: formData.get("canalDepot"),
    typePlis: formData.get("typePlis"),
    modeEvaluation: formData.get("modeEvaluation"),
    fourchettePrixBasse: formData.get("fourchettePrixBasse"),
    fourchettePrixHaute: formData.get("fourchettePrixHaute"),
    montantEstimatif: formData.get("montantEstimatif"),
    variationQuantiteHausse: formData.get("variationQuantiteHausse"),
    variationQuantiteBaisse: formData.get("variationQuantiteBaisse"),
    tauxRedevanceReglementation: formData.get("tauxRedevanceReglementation"),
    timbreRequis: formData.get("timbreRequis"),
    delaiLivraisonMaxJours: formData.get("delaiLivraisonMaxJours"),
    delaiLivraisonProposeJours: formData.get("delaiLivraisonProposeJours"),
    garantieExigeeJours: formData.get("garantieExigeeJours"),
    garantieProposeeJours: formData.get("garantieProposeeJours"),
    validiteOffreJours: formData.get("validiteOffreJours"),
    validiteOffreProposeJours: formData.get("validiteOffreProposeJours"),
    montantCaution: formData.get("montantCaution"),
    margePlancherPct: formData.get("margePlancherPct"),
    seuilQualificatifTechniquePct: formData.get("seuilQualificatifTechniquePct"),
    periodeReferencesDebut: formData.get("periodeReferencesDebut"),
    periodeReferencesFin: formData.get("periodeReferencesFin"),
    natureReferencesTags: formData.get("natureReferencesTags"),
    montantMinimalReference: formData.get("montantMinimalReference"),
    nombreReferencesExigees: formData.get("nombreReferencesExigees"),
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const {
    titre,
    acheteur,
    secteur,
    dateLimite,
    typeAcheteur,
    procedureMarche,
    canalDepot,
    typePlis,
    modeEvaluation,
    fourchettePrixBasse,
    fourchettePrixHaute,
    montantEstimatif,
    variationQuantiteHausse,
    variationQuantiteBaisse,
    tauxRedevanceReglementation,
    timbreRequis,
    delaiLivraisonMaxJours,
    delaiLivraisonProposeJours,
    garantieExigeeJours,
    garantieProposeeJours,
    validiteOffreJours,
    validiteOffreProposeJours,
    montantCaution,
    margePlancherPct,
    seuilQualificatifTechniquePct,
    periodeReferencesDebut,
    periodeReferencesFin,
    natureReferencesTags,
    montantMinimalReference,
    nombreReferencesExigees,
  } = parsed.data;
  const dateLimiteIso = dateLimite ? `${dateLimite}:00Z` : null;

  const supabase = await createClient();

  // Lue avant l'update pour savoir si date_limite change réellement - voir
  // docs/superpowers/specs/2026-10-30-recalcul-jalons-date-limite-design.md.
  const { data: avantUpdate } = await supabase
    .from("appel_offres")
    .select("date_limite")
    .eq("id", appelOffresId)
    .maybeSingle();
  const ancienneDateLimite = avantUpdate?.date_limite ?? null;

  const { error } = await supabase
    .from("appel_offres")
    .update({
      titre,
      acheteur,
      secteur,
      date_limite: dateLimiteIso,
      type_acheteur: typeAcheteur,
      procedure_marche: procedureMarche,
      canal_depot: canalDepot,
      type_plis: typePlis,
      mode_evaluation: modeEvaluation,
      fourchette_prix_basse: fourchettePrixBasse,
      fourchette_prix_haute: fourchettePrixHaute,
      montant_estimatif: montantEstimatif,
      variation_quantite_hausse: variationQuantiteHausse,
      variation_quantite_baisse: variationQuantiteBaisse,
      taux_redevance_reglementation: tauxRedevanceReglementation,
      timbre_requis: timbreRequis,
      delai_livraison_max_jours: delaiLivraisonMaxJours,
      delai_livraison_propose_jours: delaiLivraisonProposeJours,
      garantie_exigee_jours: garantieExigeeJours,
      garantie_proposee_jours: garantieProposeeJours,
      validite_offre_jours: validiteOffreJours,
      validite_offre_propose_jours: validiteOffreProposeJours,
      montant_caution: montantCaution,
      marge_plancher_pct: margePlancherPct,
      seuil_qualificatif_technique_pct: seuilQualificatifTechniquePct,
      periode_references_debut: periodeReferencesDebut,
      periode_references_fin: periodeReferencesFin,
      nature_references_tags: natureReferencesTags,
      montant_minimal_reference: montantMinimalReference,
      nombre_references_exigees: nombreReferencesExigees,
    })
    .eq("id", appelOffresId);

  if (error) {
    return { erreur: "Échec de l'enregistrement. Réessayez." };
  }

  // Comparaison par timestamp, pas par égalité de chaîne : Postgres/PostgREST
  // peut renvoyer "+00:00" là où dateLimiteIso utilise "Z" - une comparaison
  // de chaînes déclencherait le recalcul à chaque enregistrement du
  // formulaire Radar, même quand la date limite n'a pas réellement changé.
  if (
    dateLimiteIso !== null &&
    (ancienneDateLimite === null ||
      new Date(dateLimiteIso).getTime() !== new Date(ancienneDateLimite).getTime())
  ) {
    const { data: jalonsExistants } = await supabase
      .from("jalon_retroplanning")
      .select("id, libelle, coche")
      .eq("appel_offres_id", appelOffresId);

    if (jalonsExistants && jalonsExistants.length > 0) {
      const misesAJour = recalculerDatesJalonsSysteme(jalonsExistants, new Date(dateLimiteIso));
      await Promise.all(
        misesAJour.map(({ id, nouvelleDateCible }) =>
          supabase
            .from("jalon_retroplanning")
            .update({ date_cible: nouvelleDateCible })
            .eq("id", id),
        ),
      );
    }
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
  raisonResultat?: string | null,
  noteResultat?: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierStatutPipelineSchema.safeParse({
    statutPipeline,
    raisonResultat,
    noteResultat,
  });

  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Statut invalide" };
  }

  const supabase = await createClient();

  // Un appel "Passer" (raisonResultat/noteResultat tous deux undefined) ne
  // doit jamais écraser une raison déjà saisie lors d'un changement de
  // statut antérieur - ces clés ne sont incluses dans l'objet `update`
  // que lorsqu'elles ont été explicitement fournies à cette fonction.
  const miseAJour: {
    statut_pipeline: StatutPipelineAo;
    raison_resultat?: string | null;
    note_resultat?: string | null;
  } = { statut_pipeline: parsed.data.statutPipeline };

  if (raisonResultat !== undefined) {
    miseAJour.raison_resultat = parsed.data.raisonResultat ?? null;
  }
  if (noteResultat !== undefined) {
    miseAJour.note_resultat = parsed.data.noteResultat ?? null;
  }

  // `.select("id")` force la requête à renvoyer les lignes réellement
  // modifiées : sans lui, un id périmé ou appartenant à une autre
  // entreprise (filtré par les policies RLS sur .update()) renverrait
  // {succes: true} sans qu'aucune ligne n'ait été écrite. Défense en
  // profondeur - la liste affichée dans /pipeline est déjà scopée par
  // entreprise_id, donc ce cas n'est pas exploitable aujourd'hui.
  const { data, error } = await supabase
    .from("appel_offres")
    .update(miseAJour)
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour du statut. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath("/pipeline");
  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function modifierResultatAo(
  appelOffresId: string,
  raisonResultat: string | null,
  noteResultat: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierResultatAoSchema.safeParse({ raisonResultat, noteResultat });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appel_offres")
    .update({
      raison_resultat: parsed.data.raisonResultat,
      note_resultat: parsed.data.noteResultat,
    })
    .eq("id", appelOffresId)
    .select("id");

  if (error) {
    return { erreur: "Échec de la mise à jour. Réessayez." };
  }

  if (!data || data.length === 0) {
    return { erreur: "Appel d'offres introuvable." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// ---------------------------------------------------------------------------
// PV d'ouverture (Étape 9 "Après dépôt", parcours expert v2, voir
// CLAUDE.md) - même patron que mettreAJourGoNoGo (update par appel_offres_id,
// modifie_par/modifie_le) pour la ligne unique, et que reference-projet.ts
// pour les concurrents (table enfant, create/update/delete séparés).
// ---------------------------------------------------------------------------

export async function modifierPvOuverture(
  appelOffresId: string,
  input: {
    attributaireNom: string | null;
    attributairePrix: string | null;
    notreRang: string | null;
    motifRejet: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = pvOuvertureSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pv_ouverture")
    .update({
      attributaire_nom: parsed.data.attributaireNom,
      attributaire_prix: parsed.data.attributairePrix,
      notre_rang: parsed.data.notreRang,
      motif_rejet: parsed.data.motifRejet,
      modifie_par: utilisateur.id,
      modifie_le: new Date().toISOString(),
    })
    .eq("appel_offres_id", appelOffresId)
    .select("id");

  if (error) return { erreur: "Échec de l'enregistrement. Réessayez." };
  if (!data || data.length === 0) return { erreur: "PV d'ouverture introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function ajouterConcurrentPvOuverture(
  appelOffresId: string,
  pvOuvertureId: string,
  input: { nom: string; prix: string | null; rang: string | null },
): Promise<{ erreur: string } | { succes: true; concurrent: PvOuvertureConcurrent }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = pvOuvertureConcurrentSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: dernier } = await supabase
    .from("pv_ouverture_concurrent")
    .select("ordre")
    .eq("pv_ouverture_id", pvOuvertureId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("pv_ouverture_concurrent")
    .insert({
      pv_ouverture_id: pvOuvertureId,
      nom: parsed.data.nom,
      prix: parsed.data.prix,
      rang: parsed.data.rang,
      ordre: dernier ? dernier.ordre + 1 : 0,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout du concurrent. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, concurrent: data as PvOuvertureConcurrent };
}

export async function modifierConcurrentPvOuverture(
  appelOffresId: string,
  concurrentId: string,
  input: { nom: string; prix: string | null; rang: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = pvOuvertureConcurrentSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pv_ouverture_concurrent")
    .update({ nom: parsed.data.nom, prix: parsed.data.prix, rang: parsed.data.rang })
    .eq("id", concurrentId);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerConcurrentPvOuverture(
  appelOffresId: string,
  concurrentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("pv_ouverture_concurrent").delete().eq("id", concurrentId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
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
  // supprimées - même défense en profondeur que modifierStatutPipeline
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

// Partagée avec exporterGoNoGo (plus bas) : même trio de formats, mêmes
// types MIME.
const TYPES_MIME_EXPORT_DOCUMENT: Record<"docx" | "xlsx" | "pdf", string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

// Boutons Word/Excel/PDF par onglet (Radar, Offre technique, Offre
// financière) - même trio que l'export Go/No-Go. `genererClasseurExcelDossier`
// n'exige pas de BPU (contrairement à `genererClasseurExcelBpu`, réservé au
// bouton Excel ciblé de l'onglet BPU) : un pli technique sans BPU produit
// simplement un classeur sans feuille de prix plutôt que d'échouer.
async function genererBufferExportDossier(
  plan: PlanExport,
  format: "docx" | "xlsx" | "pdf",
  options: { compacterLettreSoumission?: boolean; versionFinale?: boolean },
): Promise<Buffer> {
  if (format === "xlsx") return genererClasseurExcelDossier(plan);
  if (format === "pdf") return genererPdfDossier(plan, options);
  return genererDocumentWord(plan, options);
}

// Partagé par exporterDossierReponse et exporterDossierReponsePli : les
// deux téléchargent logo, signature et cachet de la même façon (voir
// docs/superpowers/specs/2026-10-29-cachet-signature-representant-legal-design.md).
async function telechargerImageEntreprise(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cheminStockage: string | null,
  mimeType: string | null,
): Promise<LogoExport | null> {
  if (!cheminStockage || !mimeType) return null;
  const { data: blob } = await supabase.storage.from("documents").download(cheminStockage);
  if (!blob) return null;
  return {
    buffer: Buffer.from(await blob.arrayBuffer()),
    type: mimeType === "image/png" ? "png" : "jpg",
  };
}

export async function exporterDossierReponse(
  appelOffresId: string,
  format: "docx" | "xlsx" | "pdf" = "docx",
  options: { compacterLettreSoumission?: boolean; versionFinale?: boolean } = {},
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const supabase = await createClient();

  const { sections: sectionsBpu, lignesParSection: lignesParSectionBpu } =
    await listerBpu(appelOffresId);

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  const [logo, signature, cachet] = await Promise.all([
    telechargerImageEntreprise(supabase, entreprise?.logo_path ?? null, entreprise?.logo_mime_type ?? null),
    telechargerImageEntreprise(
      supabase,
      entreprise?.signature_path ?? null,
      entreprise?.signature_mime_type ?? null,
    ),
    telechargerImageEntreprise(supabase, entreprise?.cachet_path ?? null, entreprise?.cachet_mime_type ?? null),
  ]);

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
    sectionsBpu,
    lignesParSectionBpu,
    {
      nomEntreprise: entreprise?.nom ?? null,
      logo,
      signature,
      cachet,
      entete: {
        gauche: entreprise?.entete_gauche ?? null,
        centre: entreprise?.entete_centre ?? null,
        droite: entreprise?.entete_droite ?? null,
      },
      pied: {
        gauche: entreprise?.pied_gauche ?? null,
        centre: entreprise?.pied_centre ?? null,
        droite: entreprise?.pied_droite ?? null,
      },
    },
  );

  let buffer: Buffer;
  try {
    buffer = await genererBufferExportDossier(plan, format, options);
  } catch {
    return { erreur: "Échec de la génération de l'export. Réessayez." };
  }
  const cheminStockage = construireCheminStockageExport(utilisateur.entreprise_id, appelOffresId, format);

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: TYPES_MIME_EXPORT_DOCUMENT[format],
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

// Dossier scindé en 2 plis (sprint S8, parcours expert v2, voir CLAUDE.md,
// Étape 8, et TYPES_PLIS_AO) : un seul paramétré par `pli` plutôt que deux
// fonctions quasi identiques - même patron que genererDemandeAbe (type
// "lettre" | "formulaire-f6") plus haut. L'appelant (UI) invoque cette
// action une fois par pli, avec son propre état de chargement.
export async function exporterDossierReponsePli(
  appelOffresId: string,
  pli: "technique" | "financiere",
  format: "docx" | "xlsx" | "pdf" = "docx",
  options: { compacterLettreSoumission?: boolean; versionFinale?: boolean } = {},
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const supabase = await createClient();

  const { sections: sectionsBpu, lignesParSection: lignesParSectionBpu } =
    await listerBpu(appelOffresId);

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  const [logo, signature, cachet] = await Promise.all([
    telechargerImageEntreprise(supabase, entreprise?.logo_path ?? null, entreprise?.logo_mime_type ?? null),
    telechargerImageEntreprise(
      supabase,
      entreprise?.signature_path ?? null,
      entreprise?.signature_mime_type ?? null,
    ),
    telechargerImageEntreprise(supabase, entreprise?.cachet_path ?? null, entreprise?.cachet_mime_type ?? null),
  ]);

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
    sectionsBpu,
    lignesParSectionBpu,
    {
      nomEntreprise: entreprise?.nom ?? null,
      logo,
      signature,
      cachet,
      entete: {
        gauche: entreprise?.entete_gauche ?? null,
        centre: entreprise?.entete_centre ?? null,
        droite: entreprise?.entete_droite ?? null,
      },
      pied: {
        gauche: entreprise?.pied_gauche ?? null,
        centre: entreprise?.pied_centre ?? null,
        droite: entreprise?.pied_droite ?? null,
      },
    },
    pli,
  );

  let buffer: Buffer;
  try {
    buffer = await genererBufferExportDossier(plan, format, options);
  } catch {
    return { erreur: "Échec de la génération de l'export. Réessayez." };
  }
  const cheminStockage = construireCheminStockageExportPli(
    utilisateur.entreprise_id,
    appelOffresId,
    pli,
    format,
  );

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: TYPES_MIME_EXPORT_DOCUMENT[format],
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de la génération du dossier. Réessayez." };
  }

  const colonneExport = pli === "technique" ? "export_path_technique" : "export_path_financiere";
  const { error: erreurMiseAJour } = await supabase
    .from("dossier_reponse")
    .update({
      [colonneExport]: cheminStockage,
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

export async function exporterBpuExcel(
  appelOffresId: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const { sections: sectionsBpu, lignesParSection: lignesParSectionBpu } =
    await listerBpu(appelOffresId);

  const plan = construirePlanExport(
    resultat.appelOffres,
    resultat.exigences,
    resultat.documentsParExigence,
    resultat.sections,
    new Date(),
    sectionsBpu,
    lignesParSectionBpu,
  );

  if (plan.bpu === null) {
    return { erreur: "Aucune section BPU à exporter." };
  }

  let buffer: Buffer;
  try {
    buffer = await genererClasseurExcelBpu(plan);
  } catch {
    return { erreur: "Échec de la génération du classeur. Réessayez." };
  }

  const cheminStockage = construireCheminStockageExportBpu(utilisateur.entreprise_id, appelOffresId);

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });

  if (erreurUpload) {
    return { erreur: "Échec de la génération du classeur. Réessayez." };
  }

  const { data, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !data) return { erreur: "Impossible de générer le lien." };

  return { url: data.signedUrl };
}

export async function exporterGoNoGo(
  appelOffresId: string,
  format: "docx" | "xlsx" | "pdf",
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const [goNoGo, typesMarche, questions, synthese, parametres] = await Promise.all([
    obtenirOuCreerGoNoGo(appelOffresId, resultat.appelOffres.montant_caution),
    listerTypesMarcheGoNoGo(utilisateur.entreprise_id),
    listerQuestionsGoNoGo(utilisateur.entreprise_id),
    obtenirSyntheseGoNoGo(appelOffresId),
    obtenirParametresGoNoGo(utilisateur.entreprise_id),
  ]);
  const reponses = await listerReponsesGoNoGo(goNoGo.id);

  const plan = construirePlanExportGoNoGo(
    resultat.appelOffres,
    goNoGo,
    questions,
    reponses,
    typesMarche,
    synthese,
    parametres,
    new Date(),
  );

  let buffer: Buffer;
  try {
    if (format === "docx") buffer = await genererDocumentWordGoNoGo(plan);
    else if (format === "xlsx") buffer = await genererClasseurExcelGoNoGo(plan);
    else buffer = await genererPdfGoNoGo(plan);
  } catch {
    return { erreur: "Échec de la génération de l'export. Réessayez." };
  }

  const cheminStockage = construireCheminStockageExportGoNoGo(
    utilisateur.entreprise_id,
    appelOffresId,
    format,
  );

  const supabase = await createClient();

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: TYPES_MIME_EXPORT_DOCUMENT[format],
      upsert: true,
    });

  if (erreurUpload) return { erreur: "Échec de la génération de l'export. Réessayez." };

  const { data, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !data) return { erreur: "Impossible de générer le lien." };

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
  // l'appelant - la policy RLS sur appel_offres protège quelle LIGNE est
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
  // modifiées - même défense en profondeur que modifierStatutPipeline.
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

export async function mettreAJourGoNoGo(
  appelOffresId: string,
  input: {
    typeMarcheId: string | null;
    montantMarcheEstime: string | null;
    coutTotalRealisation: string | null;
    prixDao: string | null;
    cautionSoumission: string | null;
    fraisPreparation: string | null;
    avancePourcentage: string | null;
    delaiPaiementJours: string | null;
    argentDisponibleBanque: string | null;
    noteInteretStrategique: string | null;
    noteClientPaie: string | null;
    noteConcurrence: string | null;
    noteRisques: string | null;
    commentaireGlobal: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = mettreAJourGoNoGoSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  // Le type de marché, une fois choisi et enregistré, ne doit plus jamais
  // changer (demande explicite - un DAO ne change pas de nature en cours de
  // traitement, et les questions savoir-faire déjà répondues sont liées à
  // ce choix). Contrôle refait ici plutôt que fait confiance à l'UI
  // désactivée côté client : une requête forgée ne doit pas pouvoir le
  // contourner.
  const { data: ficheExistante } = await supabase
    .from("go_no_go")
    .select("type_marche_id")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();
  const typeMarcheId = ficheExistante?.type_marche_id ?? parsed.data.typeMarcheId;

  const { data, error } = await supabase
    .from("go_no_go")
    .update({
      type_marche_id: typeMarcheId,
      montant_marche_estime: parsed.data.montantMarcheEstime,
      cout_total_realisation: parsed.data.coutTotalRealisation,
      prix_dao: parsed.data.prixDao,
      caution_soumission: parsed.data.cautionSoumission,
      frais_preparation: parsed.data.fraisPreparation,
      avance_pourcentage: parsed.data.avancePourcentage,
      delai_paiement_jours: parsed.data.delaiPaiementJours,
      argent_disponible_banque: parsed.data.argentDisponibleBanque,
      note_interet_strategique: parsed.data.noteInteretStrategique,
      note_client_paie: parsed.data.noteClientPaie,
      note_concurrence: parsed.data.noteConcurrence,
      note_risques: parsed.data.noteRisques,
      commentaire_global: parsed.data.commentaireGlobal,
      modifie_par: utilisateur.id,
      modifie_le: new Date().toISOString(),
    })
    .eq("appel_offres_id", appelOffresId)
    .select("id");

  if (error) return { erreur: "Échec de l'enregistrement. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Fiche Go/No-Go introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function mettreAJourReponseGoNoGo(
  goNoGoId: string,
  appelOffresId: string,
  input: { questionId: string; texteQuestionSnapshot: string; reponse: ReponseGoNoGoValeur; commentaire: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = mettreAJourReponseGoNoGoSchema.safeParse({
    questionId: input.questionId,
    reponse: input.reponse,
    commentaire: input.commentaire,
  });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reponse_go_no_go").upsert(
    {
      go_no_go_id: goNoGoId,
      question_id: parsed.data.questionId,
      texte_question_snapshot: input.texteQuestionSnapshot,
      reponse: parsed.data.reponse,
      commentaire: parsed.data.commentaire,
      modifie_le: new Date().toISOString(),
    },
    { onConflict: "go_no_go_id,question_id" },
  );

  if (error) return { erreur: "Échec de l'enregistrement. Réessayez." };

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
    .select("date_limite, montant_caution")
    .eq("id", appelOffresId)
    .eq("entreprise_id", utilisateur.entreprise_id)
    .maybeSingle();

  if (erreurLecture || !appelOffres) return { erreur: "Appel d'offres introuvable." };
  if (!appelOffres.date_limite) return { erreur: "Date limite non renseignée." };

  const jalons = genererJalonsParDefaut(
    new Date(appelOffres.date_limite),
    new Date(),
    appelOffres.montant_caution,
  );

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
// transaction atomique - limitation mineure acceptée (voir spec, section
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

export async function listerCotationsLigne(
  ligneId: string,
): Promise<{ erreur: string } | { succes: true; cotations: CotationFournisseur[] }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cotation_fournisseur")
    .select("*")
    .eq("ligne_bpu_id", ligneId)
    .order("ordre", { ascending: true });

  if (error) return { erreur: "Échec du chargement des cotations. Réessayez." };
  return { succes: true as const, cotations: (data ?? []) as CotationFournisseur[] };
}

export async function ajouterCotation(
  appelOffresId: string,
  ligneId: string,
  input: {
    fournisseur: string;
    prix: string;
    delaiJours: string | null;
    validiteDate: string | null;
    incoterm: string | null;
  },
): Promise<{ erreur: string } | { succes: true; cotation: CotationFournisseur }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = cotationFournisseurSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: derniereCotation } = await supabase
    .from("cotation_fournisseur")
    .select("ordre")
    .eq("ligne_bpu_id", ligneId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainOrdre = derniereCotation ? derniereCotation.ordre + 1 : 0;

  const { data, error } = await supabase
    .from("cotation_fournisseur")
    .insert({
      ligne_bpu_id: ligneId,
      fournisseur: parsed.data.fournisseur,
      prix: parsed.data.prix,
      delai_jours: parsed.data.delaiJours,
      validite_date: parsed.data.validiteDate,
      incoterm: parsed.data.incoterm,
      ordre: prochainOrdre,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout de la cotation. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, cotation: data as CotationFournisseur };
}

export async function supprimerCotation(
  appelOffresId: string,
  cotationId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cotation_fournisseur")
    .delete()
    .eq("id", cotationId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Cotation introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Demande de propositions (Étape 6, parcours expert v2, voir CLAUDE.md) :
// note auto-déclarée sur un critère d'évaluation technique, pour simuler la
// note globale et déverrouiller l'offre financière sans attendre la
// commission - voir note-technique-simulee.ts.
export async function modifierNoteSimuleeExigence(
  appelOffresId: string,
  exigenceId: string,
  noteSimulee: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = noteSimuleeSchema.safeParse({ noteSimulee });
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Note invalide" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("exigence_ao")
    .update({ note_simulee: parsed.data.noteSimulee })
    .eq("id", exigenceId);

  if (error) return { erreur: "Échec de l'enregistrement de la note. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Gré à gré (Étape 6, parcours expert v2, voir CLAUDE.md) : historique des
// tours de négociation, numéroté séquentiellement par AO (contrainte unique
// appel_offres_id+numero côté DB) pour que la proforma/lettre révisée
// générée ensuite référence sans ambiguïté le bon tour.
export async function ajouterTourNegociation(
  appelOffresId: string,
  input: { montantPropose: string; dateTour: string; commentaire: string | null },
): Promise<{ erreur: string } | { succes: true; tour: TourNegociationGreAGre }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = tourNegociationSchema.safeParse(input);
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
  }

  const supabase = await createClient();

  const { data: dernierTour } = await supabase
    .from("tour_negociation_gre_a_gre")
    .select("numero")
    .eq("appel_offres_id", appelOffresId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prochainNumero = dernierTour ? dernierTour.numero + 1 : 1;

  const { data, error } = await supabase
    .from("tour_negociation_gre_a_gre")
    .insert({
      appel_offres_id: appelOffresId,
      numero: prochainNumero,
      montant_propose: parsed.data.montantPropose,
      date_tour: parsed.data.dateTour,
      commentaire: parsed.data.commentaire,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout du tour de négociation. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, tour: data as TourNegociationGreAGre };
}

export async function supprimerTourNegociation(
  appelOffresId: string,
  tourId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tour_negociation_gre_a_gre")
    .delete()
    .eq("id", tourId)
    .select("id");

  if (error) return { erreur: "Échec de la suppression. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Tour de négociation introuvable." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function genererDocumentNegociation(
  appelOffresId: string,
  tourId: string,
  type: "proforma" | "lettre-proposition-revisee",
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: tour, error: erreurTour } = await supabase
    .from("tour_negociation_gre_a_gre")
    .select("*")
    .eq("id", tourId)
    .maybeSingle();

  if (erreurTour || !tour) return { erreur: "Tour de négociation introuvable." };

  const resultatAo = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultatAo) return { erreur: "Appel d'offres introuvable." };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  const contenu =
    type === "proforma"
      ? genererProforma(entreprise, resultatAo.appelOffres, tour as TourNegociationGreAGre)
      : genererLettrePropositionRevisee(
          entreprise,
          resultatAo.appelOffres,
          tour as TourNegociationGreAGre,
        );

  // genererDocumentCvTransforme est un simple markdown -> docx générique
  // (découpage par paragraphe, pas de logique propre au CV) - réutilisé ici
  // tel quel plutôt que dupliqué.
  const bufferDocx = await genererDocumentCvTransforme(contenu);
  const cheminStockage = construireCheminStockageNegociationGreAGre(
    utilisateur.entreprise_id,
    appelOffresId,
    tourId,
    type,
  );

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, bufferDocx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) return { erreur: "Échec de la génération du document. Réessayez." };

  const { data: urlSignee, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !urlSignee) return { erreur: "Échec de la génération du lien. Réessayez." };

  return { url: urlSignee.signedUrl };
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
// pour ligne_bpu - membre_groupement est un niveau plat).
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
// piece_membre_groupement ne trace pas d'auteur (coche_par) - la pièce
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

  const parsed = televerserModeleCvSchema.safeParse({ fichier: formData.get("fichier") });
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
  // PDF/DOCX/DOC legacy tous couverts par normaliserDocument (lib/documents),
  // pas normaliserDao (PDF/DOCX seulement) - un modèle de CV, contrairement
  // au DAO, arrive parfois en .doc binaire. Déjà best-effort en interne
  // (jamais de throw) : un modèle illisible laisse markdown à null sans
  // faire échouer le téléversement - le modèle reste utilisable pour
  // l'affichage du nom de fichier même sans texte extrait.
  const { markdown } = await normaliserDocument(buffer, fichier.type);

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

export async function choisirModeleCvDepuisDao(
  appelOffresId: string,
  titreSection: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  // Re-découpé côté serveur à partir du dao_markdown en base, jamais à
  // partir d'un contenu de section envoyé par le client : `titreSection`
  // n'est qu'un identifiant, la source de vérité reste le DAO stocké.
  const { data: appelOffres, error: erreurAo } = await supabase
    .from("appel_offres")
    .select("dao_markdown")
    .eq("id", appelOffresId)
    .maybeSingle();

  if (erreurAo || !appelOffres?.dao_markdown) {
    return { erreur: "Le DAO n'a pas encore été traité." };
  }

  const section = decouperParSection(appelOffres.dao_markdown).find(
    (s) => s.titre === titreSection && s.contenu.trim().length > 0,
  );
  if (!section) {
    return { erreur: "Cette section n'existe plus dans le DAO. Rechargez la page." };
  }

  const { error } = await supabase
    .from("appel_offres")
    .update({
      modele_cv_path: null,
      modele_cv_nom_original: `Depuis le DAO : ${titreSection}`,
      modele_cv_markdown: section.contenu,
    })
    .eq("id", appelOffresId);

  if (error) return { erreur: "Échec de l'enregistrement du modèle. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function retirerModeleCv(
  appelOffresId: string,
  // Null quand le modèle vient d'une section du DAO (choisirModeleCvDepuisDao
  // ci-dessous) : rien n'a alors été téléversé dans le storage, il n'y a
  // donc rien à y supprimer.
  cheminStockage: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("appel_offres")
    .update({ modele_cv_path: null, modele_cv_nom_original: null, modele_cv_markdown: null })
    .eq("id", appelOffresId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  if (cheminStockage) {
    await supabase.storage.from("documents").remove([cheminStockage]);
  }

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

export async function genererContenuFormulaireStandard(
  appelOffresId: string,
  exigenceId: string,
): Promise<
  | { erreur: string }
  | { succes: true; sectionId: string; contenu: string; statut: StatutSectionDossier }
> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  const exigence = resultat.exigences.find((e) => e.id === exigenceId);
  if (!exigence) return { erreur: "Exigence introuvable." };

  const type = identifierFormulaireStandard(exigence.libelle);
  if (!type) return { erreur: "Ce type de formulaire n'est pas reconnu." };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  let contenu: string;
  if (type === "lettre_soumission") {
    const bpu = await listerBpu(appelOffresId);
    const toutesLesLignes = bpu.sections.flatMap((s) => bpu.lignesParSection[s.id] ?? []);
    const montantTotal = sommerMontants(toutesLesLignes);
    const lignesNonChiffrees = compterLignesNonChiffrees(toutesLesLignes);
    contenu = genererLettreSoumission(entreprise, resultat.appelOffres, montantTotal, lignesNonChiffrees);
  } else if (type === "declaration_honneur") {
    contenu = genererDeclarationHonneur(entreprise, resultat.appelOffres);
  } else if (type === "pouvoir_habilitant") {
    contenu = genererPouvoirHabilitant(entreprise, resultat.appelOffres);
  } else if (type === "formulaire_identification") {
    contenu = genererFormulaireIdentification(entreprise, resultat.appelOffres);
  } else if (type === "tableau_personnel") {
    contenu = genererTableauDocuments(
      resultat.documentsParExigence[exigenceId] ?? [],
      "TABLEAU DU PERSONNEL",
    );
  } else {
    contenu = genererTableauDocuments(
      resultat.documentsParExigence[exigenceId] ?? [],
      "TABLEAU DU MATÉRIEL",
    );
  }

  const supabase = await createClient();
  const { data: section, error: erreurUpsert } = await supabase
    .from("section_dossier")
    .upsert(
      {
        dossier_reponse_id: resultat.dossierReponse.id,
        titre: exigence.libelle,
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
    return { erreur: "Échec de l'enregistrement du formulaire. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, sectionId: section.id, contenu, statut: "brouillon" };
}

// Lecture seule, appelée depuis le client au blur du champ désignation
// (bpu-ligne-row.tsx). Best-effort : toute absence de résultat (aucun
// autre AO, aucune ligne chiffrée, aucun mot-clé commun) retourne null
// sans erreur, le bandeau de suggestion reste simplement absent.
export async function obtenirSuggestionPrixBpu(
  appelOffresId: string,
  designation: string,
  unite: string,
) {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return null;

  const uniteNormalisee = unite.trim().toLowerCase();
  if (designation.trim().length === 0 || uniteNormalisee.length === 0) return null;

  const supabase = await createClient();

  const { data: autresAppelsOffres, error: erreurAutresAppelsOffres } = await supabase
    .from("appel_offres")
    .select("id, titre, fichier_dao_nom_original, created_at")
    .eq("entreprise_id", utilisateur.entreprise_id)
    .neq("id", appelOffresId);

  if (erreurAutresAppelsOffres) {
    console.error("obtenirSuggestionPrixBpu: échec de la requête appel_offres.", {
      appelOffresId,
      erreur: erreurAutresAppelsOffres.message,
    });
    return null;
  }
  if (!autresAppelsOffres || autresAppelsOffres.length === 0) return null;

  const { data: sections, error: erreurSections } = await supabase
    .from("section_bpu")
    .select("id, appel_offres_id")
    .in(
      "appel_offres_id",
      autresAppelsOffres.map((ao) => ao.id),
    );

  if (erreurSections) {
    console.error("obtenirSuggestionPrixBpu: échec de la requête section_bpu.", {
      appelOffresId,
      erreur: erreurSections.message,
    });
    return null;
  }
  if (!sections || sections.length === 0) return null;

  const { data: lignes, error: erreurLignes } = await supabase
    .from("ligne_bpu")
    .select("designation, unite, prix_unitaire, section_bpu_id")
    .in(
      "section_bpu_id",
      sections.map((s) => s.id),
    )
    .not("prix_unitaire", "is", null);

  if (erreurLignes) {
    console.error("obtenirSuggestionPrixBpu: échec de la requête ligne_bpu.", {
      appelOffresId,
      erreur: erreurLignes.message,
    });
    return null;
  }
  if (!lignes || lignes.length === 0) return null;

  const aoParSection = new Map(sections.map((s) => [s.id, s.appel_offres_id]));
  const aoParId = new Map(autresAppelsOffres.map((ao) => [ao.id, ao]));

  const lignesHistoriques: LigneBpuHistorique[] = lignes
    .filter((l) => l.unite.trim().toLowerCase() === uniteNormalisee)
    .map((l) => {
      const idAppelOffres = aoParSection.get(l.section_bpu_id)!;
      const ao = aoParId.get(idAppelOffres)!;
      return {
        designation: l.designation,
        unite: l.unite,
        prixUnitaire: l.prix_unitaire as number,
        appelOffresId: idAppelOffres,
        appelOffresTitre: ao.titre ?? ao.fichier_dao_nom_original,
        appelOffresCreatedAt: ao.created_at,
      };
    });

  return trouverMeilleureSuggestionPrix(designation, uniteNormalisee, lignesHistoriques);
}

export async function genererQuestionnaireGoNoGo(
  appelOffresId: string,
): Promise<{ erreur: string } | { succes: true; synthese: SyntheseGoNoGo }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultat = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultat) return { erreur: "Appel d'offres introuvable." };

  if (!resultat.appelOffres.dao_markdown) {
    return { erreur: "Le DAO n'a pas encore été traité. Réessayez une fois le traitement terminé." };
  }

  // Même défense qu'autour de genererSectionRedaction (genererContenuSection
  // ci-dessus) : l'appel IA est isolé dans son propre try/catch avant toute
  // écriture, un échec ici ne doit jamais écraser un questionnaire déjà
  // généré avec succès lors d'une tentative précédente.
  let reponses;
  try {
    reponses = await genererSyntheseGoNoGo(resultat.appelOffres.dao_markdown);
  } catch {
    return { erreur: "Échec de la génération du questionnaire. Réessayez." };
  }

  const supabase = await createClient();

  const { data: existante } = await supabase
    .from("synthese_go_no_go")
    .select("id")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  const valeurs = {
    reponses,
    genere_par: utilisateur.id,
    genere_le: new Date().toISOString(),
  };

  const { data: synthese, error } = existante
    ? await supabase
        .from("synthese_go_no_go")
        .update(valeurs)
        .eq("appel_offres_id", appelOffresId)
        .select("*")
        .maybeSingle()
    : await supabase
        .from("synthese_go_no_go")
        .insert({ appel_offres_id: appelOffresId, ...valeurs })
        .select("*")
        .maybeSingle();

  if (error || !synthese) {
    return { erreur: "Échec de l'enregistrement du questionnaire. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, synthese: synthese as SyntheseGoNoGo };
}

export async function creerTypeMarcheGoNoGo(
  input: { nom: string },
): Promise<{ erreur: string } | { succes: true; id: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = typeMarcheGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("type_marche_go_no_go")
    .insert({ entreprise_id: utilisateur.entreprise_id, nom: parsed.data.nom })
    .select("id")
    .single();

  if (error || !data) return { erreur: "Échec de la création. Réessayez." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const, id: data.id as string };
}

export async function modifierTypeMarcheGoNoGo(
  id: string,
  input: { nom: string },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = typeMarcheGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("type_marche_go_no_go")
    .update({ nom: parsed.data.nom })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Type de marché introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function desactiverTypeMarcheGoNoGo(
  id: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("type_marche_go_no_go")
    .update({ actif: false })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la désactivation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Type de marché introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function creerQuestionGoNoGo(
  input: { categorie: CategorieQuestionGoNoGo; typeMarcheId: string | null; texte: string },
): Promise<{ erreur: string } | { succes: true; id: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = questionGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .insert({
      entreprise_id: utilisateur.entreprise_id,
      categorie: parsed.data.categorie,
      type_marche_id: parsed.data.typeMarcheId,
      texte: parsed.data.texte,
    })
    .select("id")
    .single();

  if (error || !data) return { erreur: "Échec de la création. Réessayez." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const, id: data.id as string };
}

export async function modifierQuestionGoNoGo(
  id: string,
  input: { texte: string },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = modifierQuestionGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .update({ texte: parsed.data.texte })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Question introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function desactiverQuestionGoNoGo(
  id: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .update({ actif: false })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de la désactivation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Question introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function activerQuestionGoNoGo(
  id: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("question_go_no_go")
    .update({ actif: true })
    .eq("id", id)
    .select("id");

  if (error) return { erreur: "Échec de l'activation. Réessayez." };
  if (!data || data.length === 0) return { erreur: "Question introuvable." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

export async function modifierParametresGoNoGo(
  input: { noteMinGo: string; margeMinVisee: string },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };
  // Les autres actions de paramétrage Go/No-Go sont filtrées par RLS admin
  // sur type_marche_go_no_go / question_go_no_go. Celle-ci écrit sur
  // `entreprise`, dont la seule policy UPDATE est au niveau membre : sans
  // ce contrôle, un membre non admin peut changer le seuil de GO de
  // l'entreprise en appelant la Server Action directement.
  if (utilisateur.role !== "admin") return { erreur: "Non autorisé" };

  const parsed = parametresGoNoGoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("entreprise")
    .update({
      note_min_go_defaut: parsed.data.noteMinGo,
      marge_min_visee_defaut: parsed.data.margeMinVisee,
    })
    .eq("id", utilisateur.entreprise_id);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/parametres/go-no-go");
  return { succes: true as const };
}

// ---------------------------------------------------------------------------
// Conformité technique article par article (sprint S6, parcours expert v2,
// voir CLAUDE.md, Étape 5.2 - "miroir") : TenderArticle/SpecLine/Product/
// ProductSpec de la spec. Voir lib/appels-offres/conformite-technique.ts
// pour le moteur de comparaison et lib/appels-offres/queries.ts pour la
// lecture groupée (obtenirConformiteTechnique).
// ---------------------------------------------------------------------------

export async function creerArticleDao(
  appelOffresId: string,
  input: { numero: string | null; designation: string; unite: string; quantite: string; ligneBpuId: string | null },
): Promise<{ erreur: string } | { succes: true; article: ArticleDao }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = articleDaoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();

  const { data: dernier } = await supabase
    .from("article_dao")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("article_dao")
    .insert({
      appel_offres_id: appelOffresId,
      numero: parsed.data.numero,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      ligne_bpu_id: parsed.data.ligneBpuId,
      ordre: dernier ? dernier.ordre + 1 : 0,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout de l'article. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, article: data as ArticleDao };
}

export async function modifierArticleDao(
  appelOffresId: string,
  articleId: string,
  input: { numero: string | null; designation: string; unite: string; quantite: string; ligneBpuId: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = articleDaoSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("article_dao")
    .update({
      numero: parsed.data.numero,
      designation: parsed.data.designation,
      unite: parsed.data.unite,
      quantite: parsed.data.quantite,
      ligne_bpu_id: parsed.data.ligneBpuId,
    })
    .eq("id", articleId);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerArticleDao(
  appelOffresId: string,
  articleId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("article_dao").delete().eq("id", articleId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function creerLigneSpecification(
  appelOffresId: string,
  articleId: string,
  input: {
    libelle: string;
    operateur: string;
    valeur: string;
    unite: string | null;
    sourceSection: string | null;
  },
): Promise<{ erreur: string } | { succes: true; ligne: LigneSpecification }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneSpecificationSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();

  const { data: derniere } = await supabase
    .from("ligne_specification")
    .select("ordre")
    .eq("article_dao_id", articleId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("ligne_specification")
    .insert({
      article_dao_id: articleId,
      libelle: parsed.data.libelle,
      operateur: parsed.data.operateur,
      valeur: parsed.data.valeur,
      unite: parsed.data.unite,
      source_section: parsed.data.sourceSection,
      ordre: derniere ? derniere.ordre + 1 : 0,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout de la ligne. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, ligne: data as LigneSpecification };
}

export async function modifierLigneSpecification(
  appelOffresId: string,
  ligneId: string,
  input: {
    libelle: string;
    operateur: string;
    valeur: string;
    unite: string | null;
    sourceSection: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = ligneSpecificationSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ligne_specification")
    .update({
      libelle: parsed.data.libelle,
      operateur: parsed.data.operateur,
      valeur: parsed.data.valeur,
      unite: parsed.data.unite,
      source_section: parsed.data.sourceSection,
    })
    .eq("id", ligneId);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerLigneSpecification(
  appelOffresId: string,
  ligneId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("ligne_specification").delete().eq("id", ligneId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Produit : réutilisable entre AO (pas de appel_offres_id), voir
// lib/appels-offres/types.ts. appelOffresId ne sert ici qu'à revalider
// l'écran courant après création depuis le tableau de conformité.
export async function creerProduit(
  appelOffresId: string,
  input: { marque: string; modele: string; reference: string | null },
): Promise<{ erreur: string } | { succes: true; produit: Produit }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = produitSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produit")
    .insert({
      entreprise_id: utilisateur.entreprise_id,
      marque: parsed.data.marque,
      modele: parsed.data.modele,
      reference: parsed.data.reference,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de la création du produit. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, produit: data as Produit };
}

export async function modifierProduit(
  appelOffresId: string,
  produitId: string,
  input: { marque: string; modele: string; reference: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = produitSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("produit")
    .update({
      marque: parsed.data.marque,
      modele: parsed.data.modele,
      reference: parsed.data.reference,
    })
    .eq("id", produitId);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerProduit(
  appelOffresId: string,
  produitId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: produit } = await supabase
    .from("produit")
    .select(
      "fiche_technique_path, autorisation_fabricant_path, certificat_etalonnage_path",
    )
    .eq("id", produitId)
    .maybeSingle();

  const { error } = await supabase.from("produit").delete().eq("id", produitId);
  if (error) {
    return {
      erreur:
        "Échec de la suppression. Ce produit est peut-être encore comparé sur un autre AO.",
    };
  }

  const chemins = [
    produit?.fiche_technique_path,
    produit?.autorisation_fabricant_path,
    produit?.certificat_etalonnage_path,
  ].filter((c): c is string => c !== null && c !== undefined);
  if (chemins.length > 0) {
    await supabase.storage.from("documents").remove(chemins);
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function ajouterSpecificationProduit(
  appelOffresId: string,
  produitId: string,
  input: { libelle: string; valeur: string; unite: string | null; sourceSection: string | null },
): Promise<{ erreur: string } | { succes: true; specification: SpecificationProduit }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = specificationProduitSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();

  const { data: derniere } = await supabase
    .from("specification_produit")
    .select("ordre")
    .eq("produit_id", produitId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("specification_produit")
    .insert({
      produit_id: produitId,
      libelle: parsed.data.libelle,
      valeur: parsed.data.valeur,
      unite: parsed.data.unite,
      source_section: parsed.data.sourceSection,
      ordre: derniere ? derniere.ordre + 1 : 0,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'ajout de la caractéristique. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, specification: data as SpecificationProduit };
}

export async function modifierSpecificationProduit(
  appelOffresId: string,
  specificationId: string,
  input: { libelle: string; valeur: string; unite: string | null; sourceSection: string | null },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = specificationProduitSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("specification_produit")
    .update({
      libelle: parsed.data.libelle,
      valeur: parsed.data.valeur,
      unite: parsed.data.unite,
      source_section: parsed.data.sourceSection,
    })
    .eq("id", specificationId);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerSpecificationProduit(
  appelOffresId: string,
  specificationId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("specification_produit")
    .delete()
    .eq("id", specificationId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function comparerProduitArticle(
  appelOffresId: string,
  articleId: string,
  produitId: string,
): Promise<{ erreur: string } | { succes: true; articleProduit: ArticleProduit }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: dernier } = await supabase
    .from("article_produit")
    .select("ordre")
    .eq("article_dao_id", articleId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("article_produit")
    .insert({
      article_dao_id: articleId,
      produit_id: produitId,
      ordre: dernier ? dernier.ordre + 1 : 0,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { erreur: "Échec de l'ajout du produit à comparer (déjà ajouté ?). Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, articleProduit: data as ArticleProduit };
}

export async function retirerProduitArticle(
  appelOffresId: string,
  articleProduitId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("article_produit").delete().eq("id", articleProduitId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Recalcule côté serveur si ce produit est ko sur au moins une ligne de cet
// article - jamais fait confiance à un booléen envoyé par le client, pour
// qu'on ne puisse pas contourner l'exigence de justification en la
// falsifiant depuis le navigateur.
async function produitEstKoPourArticle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  articleId: string,
  produitId: string,
): Promise<boolean> {
  const { data: lignes } = await supabase
    .from("ligne_specification")
    .select("*")
    .eq("article_dao_id", articleId);
  const lignesTypees = (lignes ?? []) as LigneSpecification[];
  if (lignesTypees.length === 0) return false;

  const { data: specsProduit } = await supabase
    .from("specification_produit")
    .select("*")
    .eq("produit_id", produitId);

  const { data: conformiteForcee } = await supabase
    .from("conformite_forcee")
    .select("ligne_specification_id, statut")
    .eq("produit_id", produitId)
    .in("ligne_specification_id", lignesTypees.map((l) => l.id));

  const statutsForces: Record<string, StatutConformite> = {};
  for (const cf of conformiteForcee ?? []) {
    statutsForces[cf.ligne_specification_id as string] = cf.statut as StatutConformite;
  }

  return produitKoSurAuMoinsUneLigne(
    lignesTypees,
    (specsProduit ?? []) as SpecificationProduit[],
    statutsForces,
  );
}

export async function basculerProduitRetenu(
  appelOffresId: string,
  articleId: string,
  articleProduitId: string,
  produitId: string,
  retenu: boolean,
  justificationKo: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsedJustification = justificationKoSchema.safeParse({ justification: justificationKo });
  if (!parsedJustification.success) {
    return { erreur: parsedJustification.error.issues[0]?.message ?? "Justification invalide" };
  }

  const supabase = await createClient();

  if (retenu) {
    const estKo = await produitEstKoPourArticle(supabase, articleId, produitId);
    if (estKo && parsedJustification.data.justification === null) {
      return {
        erreur:
          "Ce produit est non conforme sur au moins une ligne - une justification écrite est requise pour le retenir.",
      };
    }
  }

  const { error } = await supabase
    .from("article_produit")
    .update({
      retenu,
      justification_ko: retenu ? parsedJustification.data.justification : null,
    })
    .eq("id", articleProduitId);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function forcerConformiteLigne(
  appelOffresId: string,
  ligneSpecificationId: string,
  produitId: string,
  input: { statut: string; justification: string | null },
): Promise<{ erreur: string } | { succes: true; conformite: ConformiteForcee }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = conformiteForceeSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conformite_forcee")
    .upsert(
      {
        ligne_specification_id: ligneSpecificationId,
        produit_id: produitId,
        statut: parsed.data.statut,
        justification: parsed.data.justification,
        modifie_par: utilisateur.id,
        modifie_le: new Date().toISOString(),
      },
      { onConflict: "ligne_specification_id,produit_id" },
    )
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de l'enregistrement. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, conformite: data as ConformiteForcee };
}

export async function retirerConformiteForcee(
  appelOffresId: string,
  ligneSpecificationId: string,
  produitId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("conformite_forcee")
    .delete()
    .eq("ligne_specification_id", ligneSpecificationId)
    .eq("produit_id", produitId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

// Pièces jointes produit - même raisonnement que demarrerTeleversementDao
// (voir lib/appels-offres/schema.ts) : le corps d'une Server Action est
// plafonné par Vercel à ~4,5 Mo, une fiche technique PDF peut le dépasser.
// URL signée, upload direct navigateur → Supabase Storage.
export async function demarrerTeleversementPieceProduit(
  produitId: string,
  type: TypePieceProduit,
  nomOriginal: string,
  mimeType: string,
): Promise<{ erreur: string } | { succes: true; cheminStockage: string; token: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = nomFichierPieceProduitSchema.safeParse({ nomOriginal, mimeType });
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Fichier invalide" };

  const chemin = construireCheminStockagePieceProduit(
    utilisateur.entreprise_id,
    produitId,
    type,
    parsed.data.nomOriginal,
  );

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").createSignedUploadUrl(chemin);

  if (error || !data) return { erreur: "Échec de la préparation de l'envoi. Réessayez." };

  return { succes: true as const, cheminStockage: chemin, token: data.token };
}

export async function finaliserTeleversementPieceProduit(
  appelOffresId: string,
  produitId: string,
  type: TypePieceProduit,
  cheminStockage: string,
  nomOriginal: string,
  dateValidite: string | null,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsedDate = dateValiditePieceProduitSchema.safeParse({ dateValidite });
  if (!parsedDate.success) {
    return { erreur: parsedDate.error.issues[0]?.message ?? "Date invalide" };
  }

  const supabase = await createClient();

  const miseAJour: Record<string, string | null> = {
    [`${type}_path`]: cheminStockage,
    [`${type}_nom_original`]: nomOriginal,
  };
  if (type === "autorisation_fabricant") {
    miseAJour.autorisation_valide_jusquau = parsedDate.data.dateValidite;
  }
  if (type === "certificat_etalonnage") {
    miseAJour.certificat_etalonnage_valide_jusquau = parsedDate.data.dateValidite;
  }

  const { error } = await supabase.from("produit").update(miseAJour).eq("id", produitId);

  if (error) {
    await supabase.storage.from("documents").remove([cheminStockage]);
    return { erreur: "Échec de l'enregistrement de la pièce. Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function supprimerPieceProduit(
  appelOffresId: string,
  produitId: string,
  type: TypePieceProduit,
  cheminStockage: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const miseAJour: Record<string, string | null> = {
    [`${type}_path`]: null,
    [`${type}_nom_original`]: null,
  };
  if (type === "autorisation_fabricant") miseAJour.autorisation_valide_jusquau = null;
  if (type === "certificat_etalonnage") miseAJour.certificat_etalonnage_valide_jusquau = null;

  const { error } = await supabase.from("produit").update(miseAJour).eq("id", produitId);
  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  await supabase.storage.from("documents").remove([cheminStockage]);

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function genererUrlTelechargementPieceProduit(
  cheminStockage: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (error || !data) return { erreur: "Échec de la génération du lien. Réessayez." };
  return { url: data.signedUrl };
}

export async function genererTableauSectionIII(
  appelOffresId: string,
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const resultatAo = await obtenirAppelOffres(appelOffresId, utilisateur.entreprise_id);
  if (!resultatAo) return { erreur: "Appel d'offres introuvable." };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  const conformite = await obtenirConformiteTechnique(appelOffresId);
  if (conformite.articles.length === 0) {
    return { erreur: "Aucun article technique enregistré pour cet AO." };
  }

  const plan = construirePlanSectionIII(
    resultatAo.appelOffres,
    entreprise,
    conformite.articles,
    conformite.lignesParArticle,
    conformite.articleProduitsParArticle,
    conformite.produitsParId,
    conformite.specsProduitParProduit,
    conformite.conformiteForceeParLigneProduit,
  );

  const buffer = await genererDocumentSectionIII(plan);
  const cheminStockage = construireCheminStockageExportSectionIII(
    utilisateur.entreprise_id,
    appelOffresId,
  );

  const supabase = await createClient();
  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) return { erreur: "Échec de la génération du tableau. Réessayez." };

  const { data: urlSignee, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !urlSignee) return { erreur: "Échec de la génération du lien. Réessayez." };

  return { url: urlSignee.signedUrl };
}

// ---------------------------------------------------------------------------
// Références (sprint S7, parcours expert v2, voir CLAUDE.md, Étape 5.3) -
// catalogue entreprise réutilisable entre AO, même patron que `produit`
// (sprint S6). Les contrôles d'intégrité (reference-integrite.ts) bloquent
// la création/modification quand ils portent sur un fait objectivement
// incohérent (client créé après le début du marché, coordonnées partagées
// avec le soumissionnaire) ; "période modifiée après une première
// importation" n'est volontairement PAS bloqué ici - rendre les dates
// immodifiables après coup serait disproportionné pour corriger une
// simple faute de frappe - il reste signalé par REF-02 (contrôle croisé),
// qui bloque l'export tant qu'il n'est pas résolu.
// ---------------------------------------------------------------------------

export async function creerReferenceProjet(input: {
  clientNom: string;
  clientRccm: string | null;
  clientDateCreation: string | null;
  clientTelephone: string | null;
  clientEmail: string | null;
  clientAdresse: string | null;
  objet: string;
  natureTags: string;
  montant: string | null;
  role: string;
  dateDebut: string | null;
  dateFin: string | null;
}): Promise<{ erreur: string } | { succes: true; reference: ReferenceProjet }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = referenceProjetSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  const alertes = calculerAlertesIntegrite(
    {
      client_date_creation: parsed.data.clientDateCreation,
      date_debut: parsed.data.dateDebut,
      date_fin: parsed.data.dateFin,
      date_debut_origine: parsed.data.dateDebut,
      date_fin_origine: parsed.data.dateFin,
      client_telephone: parsed.data.clientTelephone,
      client_email: parsed.data.clientEmail,
      client_adresse: parsed.data.clientAdresse,
    },
    entreprise,
    null,
  );
  if (alertes.clientAnterieurAuDebut) {
    return { erreur: "Le client serait créé après le début du marché cité. Vérifie les dates." };
  }
  if (alertes.coordonneesPartagees) {
    return {
      erreur:
        "Les coordonnées du client (téléphone, e-mail ou adresse) sont identiques à celles de l'entreprise. Vérifie la saisie.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reference_projet")
    .insert({
      entreprise_id: utilisateur.entreprise_id,
      client_nom: parsed.data.clientNom,
      client_rccm: parsed.data.clientRccm,
      client_date_creation: parsed.data.clientDateCreation,
      client_telephone: parsed.data.clientTelephone,
      client_email: parsed.data.clientEmail,
      client_adresse: parsed.data.clientAdresse,
      objet: parsed.data.objet,
      nature_tags: parsed.data.natureTags,
      montant: parsed.data.montant,
      role: parsed.data.role,
      date_debut: parsed.data.dateDebut,
      date_fin: parsed.data.dateFin,
      date_debut_origine: parsed.data.dateDebut,
      date_fin_origine: parsed.data.dateFin,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) return { erreur: "Échec de la création de la référence. Réessayez." };

  revalidatePath("/appels-offres");
  return { succes: true as const, reference: data as ReferenceProjet };
}

export async function modifierReferenceProjet(
  referenceId: string,
  input: {
    clientNom: string;
    clientRccm: string | null;
    clientDateCreation: string | null;
    clientTelephone: string | null;
    clientEmail: string | null;
    clientAdresse: string | null;
    objet: string;
    natureTags: string;
    montant: string | null;
    role: string;
    dateDebut: string | null;
    dateFin: string | null;
  },
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const parsed = referenceProjetSchema.safeParse(input);
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  const alertes = calculerAlertesIntegrite(
    {
      client_date_creation: parsed.data.clientDateCreation,
      date_debut: parsed.data.dateDebut,
      date_fin: parsed.data.dateFin,
      date_debut_origine: parsed.data.dateDebut,
      date_fin_origine: parsed.data.dateFin,
      client_telephone: parsed.data.clientTelephone,
      client_email: parsed.data.clientEmail,
      client_adresse: parsed.data.clientAdresse,
    },
    entreprise,
    null,
  );
  if (alertes.clientAnterieurAuDebut) {
    return { erreur: "Le client serait créé après le début du marché cité. Vérifie les dates." };
  }
  if (alertes.coordonneesPartagees) {
    return {
      erreur:
        "Les coordonnées du client (téléphone, e-mail ou adresse) sont identiques à celles de l'entreprise. Vérifie la saisie.",
    };
  }

  const supabase = await createClient();
  // date_debut_origine/date_fin_origine volontairement absents de cette
  // mise à jour : elles restent figées à la première valeur importée (voir
  // commentaire de tête de section et la migration reference_projet).
  const { error } = await supabase
    .from("reference_projet")
    .update({
      client_nom: parsed.data.clientNom,
      client_rccm: parsed.data.clientRccm,
      client_date_creation: parsed.data.clientDateCreation,
      client_telephone: parsed.data.clientTelephone,
      client_email: parsed.data.clientEmail,
      client_adresse: parsed.data.clientAdresse,
      objet: parsed.data.objet,
      nature_tags: parsed.data.natureTags,
      montant: parsed.data.montant,
      role: parsed.data.role,
      date_debut: parsed.data.dateDebut,
      date_fin: parsed.data.dateFin,
    })
    .eq("id", referenceId);

  if (error) return { erreur: "Échec de la mise à jour. Réessayez." };

  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function supprimerReferenceProjet(
  referenceId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("reference_projet").delete().eq("id", referenceId);

  if (error) {
    return {
      erreur: "Échec de la suppression. Cette référence est peut-être encore utilisée sur un AO.",
    };
  }

  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function lierAbeDocument(
  appelOffresId: string,
  referenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { data: document } = await supabase
    .from("document")
    .select("mime_type")
    .eq("id", documentId)
    .maybeSingle();

  if (!document) return { erreur: "Document introuvable." };

  const alertes = calculerAlertesIntegrite(
    {
      client_date_creation: null,
      date_debut: null,
      date_fin: null,
      date_debut_origine: null,
      date_fin_origine: null,
      client_telephone: null,
      client_email: null,
      client_adresse: null,
    },
    { telephone: null, email: null, adresse: null },
    document as Pick<Document, "mime_type">,
  );
  if (alertes.abeFormatEditableSansSignature) {
    return {
      erreur:
        "Ce document est dans un format éditable (Word) sans passer par un scan - une ABE doit porter une signature manuscrite scannée. Joins plutôt un PDF scanné.",
    };
  }

  const { error } = await supabase
    .from("reference_projet")
    .update({ abe_document_id: documentId })
    .eq("id", referenceId);

  if (error) return { erreur: "Échec de l'association. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function retirerAbeDocument(
  appelOffresId: string,
  referenceId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reference_projet")
    .update({ abe_document_id: null })
    .eq("id", referenceId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function ajouterJustificatifReference(
  appelOffresId: string,
  referenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase.from("reference_projet_justificatif").insert({
    reference_projet_id: referenceId,
    document_id: documentId,
    created_by: utilisateur.id,
  });

  if (error) return { erreur: "Échec de l'ajout du justificatif (déjà ajouté ?). Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function retirerJustificatifReference(
  appelOffresId: string,
  referenceId: string,
  documentId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reference_projet_justificatif")
    .delete()
    .eq("reference_projet_id", referenceId)
    .eq("document_id", documentId);

  if (error) return { erreur: "Échec de la suppression. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  revalidatePath("/appels-offres");
  return { succes: true as const };
}

export async function ajouterReferenceAuDossier(
  appelOffresId: string,
  referenceId: string,
): Promise<{ erreur: string } | { succes: true; appelOffresReference: AppelOffresReference }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: dernier } = await supabase
    .from("appel_offres_reference")
    .select("ordre")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("appel_offres_reference")
    .insert({
      appel_offres_id: appelOffresId,
      reference_projet_id: referenceId,
      ordre: dernier ? dernier.ordre + 1 : 0,
      created_by: utilisateur.id,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return { erreur: "Échec de l'ajout de la référence au dossier (déjà ajoutée ?). Réessayez." };
  }

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const, appelOffresReference: data as AppelOffresReference };
}

export async function retirerReferenceDuDossier(
  appelOffresId: string,
  appelOffresReferenceId: string,
): Promise<{ erreur: string } | { succes: true }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appel_offres_reference")
    .delete()
    .eq("id", appelOffresReferenceId);

  if (error) return { erreur: "Échec du retrait. Réessayez." };

  revalidatePath(`/appels-offres/${appelOffresId}`);
  return { succes: true as const };
}

export async function genererDemandeAbe(
  referenceId: string,
  type: "lettre" | "formulaire-f6",
): Promise<{ erreur: string } | { url: string }> {
  const utilisateur = await obtenirUtilisateurCourant();
  if (!utilisateur) return { erreur: "Non authentifié" };

  const supabase = await createClient();

  const { data: reference, error: erreurReference } = await supabase
    .from("reference_projet")
    .select("*")
    .eq("id", referenceId)
    .maybeSingle();

  if (erreurReference || !reference) return { erreur: "Référence introuvable." };

  const entreprise = await obtenirEntreprise(utilisateur.entreprise_id);
  if (!entreprise) return { erreur: "Profil entreprise introuvable." };

  const contenu =
    type === "lettre"
      ? genererLettreDemandeAbe(entreprise, reference as ReferenceProjet)
      : genererFormulaireAbeVierge(entreprise);

  // genererDocumentCvTransforme est un simple markdown -> docx générique,
  // réutilisé ici comme pour la négociation gré à gré (voir plus haut).
  const bufferDocx = await genererDocumentCvTransforme(contenu);
  const cheminStockage = construireCheminStockageDemandeAbe(
    utilisateur.entreprise_id,
    referenceId,
    type,
  );

  const { error: erreurUpload } = await supabase.storage
    .from("documents")
    .upload(cheminStockage, bufferDocx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });

  if (erreurUpload) return { erreur: "Échec de la génération du document. Réessayez." };

  const { data: urlSignee, error: erreurUrl } = await supabase.storage
    .from("documents")
    .createSignedUrl(cheminStockage, 60);

  if (erreurUrl || !urlSignee) return { erreur: "Échec de la génération du lien. Réessayez." };

  return { url: urlSignee.signedUrl };
}
