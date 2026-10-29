"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { StatutTraitementBadge } from "../statut-traitement-badge";
import {
  modifierAppelOffres,
  genererUrlTelechargementDao,
  exporterDossierReponse,
  exporterDossierReponsePli,
  modifierNoteSimuleeExigence,
} from "@/lib/appels-offres/actions";
import { versValeurDatetimeLocal } from "@/lib/appels-offres/datetime-local";
import { classifierTypeFichierDao } from "@/lib/appels-offres/normalisation/classification-fichier";
import {
  TYPES_ACHETEUR_AO,
  PROCEDURES_AO,
  CANAUX_DEPOT_AO,
  TYPES_PLIS_AO,
  MODES_EVALUATION_AO,
  type AppelOffres,
  type AppelOffresReference,
  type ArticleDao,
  type ArticleProduit,
  type ClePieceGroupement,
  type CleChecklistManuelle,
  type ConformiteForcee,
  type CvTransforme,
  type ExigenceAo,
  type FichierDaoSupplementaire,
  type GoNoGo as GoNoGoFiche,
  type JalonRetroplanning,
  type LigneBpu,
  type LigneSpecification,
  type MembreGroupement,
  type PointFlouAo,
  type Produit,
  type PvOuverture,
  type PvOuvertureConcurrent,
  type QuestionGoNoGo,
  type ReferenceProjet,
  type ReponseGoNoGo,
  type SectionBpu,
  type SpecificationProduit,
  type SyntheseGoNoGo,
  type TourNegociationGreAGre,
  type TypeMarcheGoNoGo,
} from "@/lib/appels-offres/types";
import type { SuggestionAdministrative } from "@/lib/appels-offres/go-no-go-suggestions";
import { DocumentsExigence } from "./documents-exigence";
import { identifierFormulaireStandard } from "@/lib/appels-offres/formulaires-standards";
import type { Document } from "@/lib/documents/types";
import { SectionRedaction } from "./section-redaction";
import type { SectionDossier } from "@/lib/appels-offres/types";
import { FilSuivi } from "./fil-suivi";
import type { EmailResume } from "@/lib/email/types";
import type { RegimeFiscal } from "@/lib/utilisateur/types";
import { ChecklistSoumission } from "./checklist-soumission";
import type { ItemChecklistAutomatique } from "@/lib/appels-offres/checklist";
import { GoNoGo, VARIANT_DECISION } from "./go-no-go";
import { QuestionnaireGoNoGo } from "./questionnaire-go-no-go";
import { ResultatCard } from "./resultat-card";
import { PvOuvertureCard } from "./pv-ouverture";
import { Retroplanning } from "./retroplanning";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { classifierPieceRequise } from "@/lib/appels-offres/classification-piece";
import { Bpu } from "./bpu";
import { GroupementCard } from "./groupement-card";
import { ModeleCv } from "./modele-cv";
import { NegociationGreAGre } from "./negociation-gre-a-gre";
import { ConformiteTechnique } from "./conformite-technique";
import { References } from "./references";
import { evaluerGoNoGo } from "@/lib/appels-offres/go-no-go";
import { sommerMontants, compterLignesNonChiffrees, formaterMontant } from "@/lib/appels-offres/bpu";
import { calculerIndicateursChiffrage } from "@/lib/appels-offres/indicateurs-chiffrage";
import { construireRecapGerant } from "@/lib/appels-offres/recap-gerant";
import {
  calculerControleExhaustivite,
  calculerControleValidite,
  calculerControleSaisie,
  calculerControleIdentite,
  calculerControleEngagements,
  calculerControleTechnique,
  calculerControleReferences,
} from "@/lib/appels-offres/controle-croise";
import { calculerEtatPreparation, calculerProchaineAction } from "@/lib/appels-offres/radar";
import {
  calculerNoteTechniqueSimulee,
  offreFinanciereVerrouillee,
} from "@/lib/appels-offres/note-technique-simulee";

// Radix <Select.Item> interdit une value="" (voir components/ui/select.tsx) -
// sentinel dédiée pour l'option "Non renseigné", reconnue et convertie en
// null par champEnumOptionnel (lib/appels-offres/schema.ts) à la soumission.
const VALEUR_NON_RENSEIGNE = "_non_renseigne";

// Clés de traduction camelCase pour chaque valeur d'énumération (snake_case)
// du profil procédure × canal × acheteur - même convention que CLES_LIBELLE
// dans statut-pipeline-select.tsx.
const CLES_TYPE_ACHETEUR: Record<(typeof TYPES_ACHETEUR_AO)[number], string> = {
  public: "public",
  entreprise_publique: "entreprisePublique",
  bailleur: "bailleur",
  prive: "prive",
  ong: "ong",
};

const CLES_PROCEDURE: Record<(typeof PROCEDURES_AO)[number], string> = {
  ao_ouvert: "aoOuvert",
  ao_restreint: "aoRestreint",
  ao_deux_etapes: "aoDeuxEtapes",
  procedure_simplifiee: "procedureSimplifiee",
  gre_a_gre: "greAGre",
  ami: "ami",
  demande_propositions: "demandePropositions",
  consultation_privee: "consultationPrivee",
  procedure_bailleur: "procedureBailleur",
};

const CLES_CANAL_DEPOT: Record<(typeof CANAUX_DEPOT_AO)[number], string> = {
  sigomap: "sigomap",
  papier: "papier",
  email: "email",
  portail_acheteur: "portailAcheteur",
  portail_bailleur: "portailBailleur",
  remise_main_propre: "remiseMainPropre",
};

const CLES_TYPE_PLIS: Record<(typeof TYPES_PLIS_AO)[number], string> = {
  single: "single",
  tech_fin: "techFin",
};

const CLES_MODE_EVALUATION: Record<(typeof MODES_EVALUATION_AO)[number], string> = {
  points: "points",
  conformite_moins_disant: "conformiteMoinsDisant",
};

export function AppelOffresDetail({
  appelOffres,
  exigences,
  documentsParExigence,
  bibliotheque,
  sections,
  documentsParSection,
  emailsLies,
  suggestions,
  dossierReponseId,
  pointsFlous,
  checklistAutomatique,
  checklistManuelle,
  goNoGo,
  typesMarcheGoNoGo,
  questionsGoNoGo,
  reponsesGoNoGo,
  parametresGoNoGo,
  suggestionAgrement,
  suggestionAttestations,
  syntheseGoNoGo,
  jalons,
  dateLimiteConnue,
  bpu,
  tauxFraisStructureDefaut,
  regimeFiscal,
  groupement,
  nomEntreprise,
  cvTransformeParDocument: cvTransformeParDocumentInitial,
  fichiersSupplementaires,
  toursNegociation,
  conformiteTechnique,
  produitsEntreprise,
  referencesAppelOffres,
  catalogueReferences,
  entrepriseContact,
  pvOuverture,
  concurrentsPvOuverture,
}: {
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  documentsParExigence: Record<string, Document[]>;
  bibliotheque: Document[];
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
  emailsLies: EmailResume[];
  suggestions: EmailResume[];
  dossierReponseId: string;
  pointsFlous: PointFlouAo[];
  checklistAutomatique: ItemChecklistAutomatique[];
  checklistManuelle: CleChecklistManuelle[];
  goNoGo: GoNoGoFiche;
  typesMarcheGoNoGo: TypeMarcheGoNoGo[];
  questionsGoNoGo: QuestionGoNoGo[];
  reponsesGoNoGo: ReponseGoNoGo[];
  parametresGoNoGo: { noteMinGo: number; margeMinVisee: number };
  suggestionAgrement: SuggestionAdministrative;
  suggestionAttestations: SuggestionAdministrative;
  syntheseGoNoGo: SyntheseGoNoGo | null;
  jalons: JalonRetroplanning[];
  dateLimiteConnue: boolean;
  bpu: { sections: SectionBpu[]; lignesParSection: Record<string, LigneBpu[]> };
  tauxFraisStructureDefaut: number | null;
  regimeFiscal: RegimeFiscal | null;
  groupement: { membres: MembreGroupement[]; piecesParMembre: Record<string, ClePieceGroupement[]> };
  nomEntreprise: string | null;
  cvTransformeParDocument: Record<string, CvTransforme>;
  fichiersSupplementaires: FichierDaoSupplementaire[];
  toursNegociation: TourNegociationGreAGre[];
  conformiteTechnique: {
    articles: ArticleDao[];
    lignesParArticle: Record<string, LigneSpecification[]>;
    articleProduitsParArticle: Record<string, ArticleProduit[]>;
    produitsParId: Record<string, Produit>;
    specsProduitParProduit: Record<string, SpecificationProduit[]>;
    conformiteForceeParLigneProduit: Record<string, ConformiteForcee>;
  };
  produitsEntreprise: Produit[];
  referencesAppelOffres: {
    appelOffresReferences: AppelOffresReference[];
    referencesParId: Record<string, ReferenceProjet>;
    justificatifsParReference: Record<string, Document[]>;
    abeDocumentParReference: Record<string, Document | null>;
  };
  catalogueReferences: ReferenceProjet[];
  entrepriseContact: { telephone: string | null; email: string | null; adresse: string | null };
  pvOuverture: PvOuverture;
  concurrentsPvOuverture: PvOuvertureConcurrent[];
}) {
  const t = useTranslations("AppelsOffres.detail");
  const [envoi, setEnvoi] = useState(false);
  // Chemin du fichier en cours de téléchargement (pas un simple booléen) :
  // plusieurs boutons de téléchargement peuvent être affichés côte à côte
  // (DAO multi-fichiers) et cliquer sur l'un ne doit faire tourner le
  // spinner que sur celui-là, pas sur tous.
  const [telechargementEnCours, setTelechargementEnCours] = useState<string | null>(null);
  // Boutons Word/Excel/PDF par onglet (Radar, Offre technique, Offre
  // financière - même trio que l'onglet Go/No-Go) : un seul état combinant
  // le contexte (dossier entier ou pli) et le format, pour que seul le
  // bouton réellement cliqué affiche son spinner.
  const [exportEnCours, setExportEnCours] = useState<{
    contexte: "dossier" | "technique" | "financiere";
    format: "docx" | "xlsx" | "pdf";
  } | null>(null);
  const [compacterLettreSoumission, setCompacterLettreSoumission] = useState(true);
  // Version finale (sprint S8, voir CLAUDE.md, Étape 8) : off par défaut -
  // c'est la version de travail, avec ses repères de saisie, qui reste le
  // comportement historique.
  const [versionFinale, setVersionFinale] = useState(false);
  // Note simulée par critère technique (demande de propositions, voir
  // note-technique-simulee.ts) : état local plutôt que relecture de la
  // liste `exigences` (figée depuis l'extraction), seule façon de refléter
  // une saisie sans recharger toute la page.
  const [notesSimulees, setNotesSimulees] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(exigences.map((e) => [e.id, e.note_simulee])),
  );
  // Levé au parent (et non local à DocumentsExigence) : un même CV peut
  // être associé à plusieurs exigences (table exigence_document,
  // many-to-many), donc plusieurs instances de DocumentsExigence peuvent
  // rendre le même document. Sans cet état partagé, transformer un CV
  // depuis une instance ne met pas à jour les autres, qui restent
  // capables de redéclencher un appel Claude payant pour la même
  // transformation.
  const [cvTransformes, setCvTransformes] = useState(cvTransformeParDocumentInitial);
  // Levé au parent pour la même raison que cvTransformes ci-dessus : un
  // même CV peut être associé à plusieurs exigences, donc rendu par
  // plusieurs instances de DocumentsExigence, qui doivent toutes savoir
  // qu'une génération est déjà en cours pour ce document (voir
  // documents-exigence.tsx).
  const [documentIdEnCours, setDocumentIdEnCours] = useState<string | null>(null);

  const pret = appelOffres.statut_traitement === "termine";

  async function onSubmit(formData: FormData) {
    setEnvoi(true);
    const resultat = await modifierAppelOffres(appelOffres.id, formData);
    setEnvoi(false);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }

    toast.success(t("form.toastEnregistre"));
  }

  async function telecharger(cheminStockage: string) {
    setTelechargementEnCours(cheminStockage);
    const resultat = await genererUrlTelechargementDao(cheminStockage);
    setTelechargementEnCours(null);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  async function exporterDossierFormat(format: "docx" | "xlsx" | "pdf") {
    setExportEnCours({ contexte: "dossier", format });
    const resultat = await exporterDossierReponse(appelOffres.id, format, {
      compacterLettreSoumission,
      versionFinale,
    });
    setExportEnCours(null);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  async function exporterPliFormat(pli: "technique" | "financiere", format: "docx" | "xlsx" | "pdf") {
    setExportEnCours({ contexte: pli, format });
    const resultat = await exporterDossierReponsePli(appelOffres.id, pli, format, {
      compacterLettreSoumission,
      versionFinale,
    });
    setExportEnCours(null);

    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
      return;
    }
    window.open(resultat.url, "_blank");
  }

  // Trio Word/Excel/PDF (sprint "boutons par onglet", même patron que
  // l'onglet Go/No-Go) : factorisé une fois, réutilisé par l'onglet Radar
  // (dossier entier ou par pli selon type_plis) et par les onglets Offre
  // technique / Offre financière (toujours leur propre pli, qu'il y ait ou
  // non 2 plis au dépôt final - exporter "juste la partie technique" reste
  // utile même en pli unique, pour relire/partager cette seule partie).
  function boutonsExportFormat(
    contexte: "dossier" | "technique" | "financiere",
    onExporter: (format: "docx" | "xlsx" | "pdf") => void,
  ) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {(["docx", "xlsx", "pdf"] as const).map((format) => (
          <Button
            key={format}
            variant="outline"
            size="sm"
            disabled={exportEnCours !== null}
            onClick={() => onExporter(format)}
          >
            {exportEnCours?.contexte === contexte && exportEnCours.format === format && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {t(`export.bouton${format === "docx" ? "Word" : format === "xlsx" ? "Excel" : "Pdf"}`)}
          </Button>
        ))}
      </div>
    );
  }

  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const criteresEvaluation = exigences.filter((e) => e.type_exigence === "critere_evaluation");
  const piecesTechniques = piecesRequises.filter(
    (e) => classifierPieceRequise(e.libelle) === "technique",
  );
  const piecesFinancieres = piecesRequises.filter(
    (e) => classifierPieceRequise(e.libelle) === "financiere",
  );
  const criteresTechniques = criteresEvaluation.filter(
    (e) => classifierPieceRequise(e.libelle) === "technique",
  );
  const criteresFinanciers = criteresEvaluation.filter(
    (e) => classifierPieceRequise(e.libelle) === "financiere",
  );

  // Demande de propositions (Étape 6, parcours expert v2, voir CLAUDE.md) :
  // l'offre financière reste verrouillée tant que la note technique simulée
  // n'atteint pas appelOffres.seuil_qualificatif_technique_pct.
  const noteTechniqueSimulee = calculerNoteTechniqueSimulee(
    criteresTechniques.map((e) => ({
      ponderation: e.ponderation,
      noteSimulee: notesSimulees[e.id] ?? null,
    })),
  );
  const offreFinanciereVerrouilleeParNote =
    appelOffres.procedure_marche === "demande_propositions" &&
    offreFinanciereVerrouillee(noteTechniqueSimulee, appelOffres.seuil_qualificatif_technique_pct);

  async function enregistrerNoteSimulee(exigenceId: string, valeur: string) {
    setNotesSimulees((map) => ({
      ...map,
      [exigenceId]: valeur.trim().length > 0 ? Number(valeur) : null,
    }));
    const resultat = await modifierNoteSimuleeExigence(
      appelOffres.id,
      exigenceId,
      valeur.trim().length > 0 ? valeur : null,
    );
    if ("erreur" in resultat) {
      toast.error(resultat.erreur);
    }
  }
  // Sections narratives du sommaire (ni pièce requise, ni formulaire
  // standard pré-rempli) : réparties entre les deux onglets par le même
  // classifieur mots-clés que les pièces requises, pour que la rédaction
  // assistée se fasse au plus près de l'item concerné plutôt que
  // regroupée dans la Vue d'ensemble.
  const sectionsNarratives = (appelOffres.sommaire_attendu ?? []).filter(
    (titreSection) => identifierFormulaireStandard(titreSection) === null,
  );
  const sectionsNarrativesTechnique = sectionsNarratives.filter(
    (titre) => classifierPieceRequise(titre) === "technique",
  );
  const sectionsNarrativesFinanciere = sectionsNarratives.filter(
    (titre) => classifierPieceRequise(titre) === "financiere",
  );

  // Récapitulatif affiché en Vue d'ensemble : calculé à partir des mêmes
  // valeurs persistées que la fiche Go/No-Go (pas des éditions locales en
  // cours dans l'onglet Go/No-Go, qui ne sont pas encore enregistrées).
  const achatDaoEffectue = appelOffres.fichier_dao_path !== null;
  const evaluationGoNoGo = evaluerGoNoGo({
    typeMarcheId: goNoGo.type_marche_id,
    questions: questionsGoNoGo.map((q) => ({
      id: q.id,
      categorie: q.categorie,
      typeMarcheId: q.type_marche_id,
    })),
    reponseParQuestion: new Map(reponsesGoNoGo.map((r) => [r.question_id, r.reponse])),
    montants: {
      montantMarcheEstime: goNoGo.montant_marche_estime,
      coutTotalRealisation: goNoGo.cout_total_realisation,
      prixDao: goNoGo.prix_dao,
      cautionSoumission: goNoGo.caution_soumission,
      fraisPreparation: goNoGo.frais_preparation,
      avancePourcentage: goNoGo.avance_pourcentage,
      delaiPaiementJours: goNoGo.delai_paiement_jours,
      argentDisponibleBanque: goNoGo.argent_disponible_banque,
    },
    achatDaoEffectue,
    notesManuelles: {
      noteInteretStrategique: goNoGo.note_interet_strategique,
      noteClientPaie: goNoGo.note_client_paie,
      noteConcurrence: goNoGo.note_concurrence,
      noteRisques: goNoGo.note_risques,
    },
    parametres: parametresGoNoGo,
  });

  function compterFournies(pieces: ExigenceAo[]) {
    return pieces.filter((p) => (documentsParExigence[p.id]?.length ?? 0) > 0).length;
  }
  function compterEliminatoiresManquantes(pieces: ExigenceAo[]) {
    return pieces.filter(
      (p) =>
        p.categorie_exigence === "eliminatoire" &&
        (documentsParExigence[p.id]?.length ?? 0) === 0,
    ).length;
  }

  const lignesBpuTotal = Object.values(bpu.lignesParSection).flat();
  const totalBpu = sommerMontants(lignesBpuTotal);
  const lignesBpuNonChiffrees = compterLignesNonChiffrees(lignesBpuTotal);
  const controleExhaustivite = calculerControleExhaustivite(
    exigences,
    documentsParExigence,
    lignesBpuTotal,
  );
  const controleValidite = calculerControleValidite(
    documentsParExigence,
    appelOffres.date_limite ? new Date(appelOffres.date_limite) : new Date(),
  );
  const controleSaisie = calculerControleSaisie(documentsParExigence, sections);
  const controleIdentite = calculerControleIdentite(documentsParExigence, sections);
  const controleEngagements = calculerControleEngagements(appelOffres);
  const controleTechnique = calculerControleTechnique(
    conformiteTechnique.articles,
    conformiteTechnique.lignesParArticle,
    conformiteTechnique.articleProduitsParArticle,
    conformiteTechnique.specsProduitParProduit,
    conformiteTechnique.conformiteForceeParLigneProduit,
    conformiteTechnique.produitsParId,
  );
  const controleReferences = calculerControleReferences(
    appelOffres,
    referencesAppelOffres.appelOffresReferences,
    referencesAppelOffres.referencesParId,
    Object.fromEntries(
      Object.entries(referencesAppelOffres.justificatifsParReference).map(([id, docs]) => [
        id,
        docs.length,
      ]),
    ),
    referencesAppelOffres.abeDocumentParReference,
    entrepriseContact,
  );
  const controleCroise = [
    ...controleExhaustivite,
    ...controleValidite,
    ...controleSaisie,
    ...controleIdentite,
    ...controleEngagements,
    ...controleTechnique,
    ...controleReferences,
  ];
  const etatPreparation = calculerEtatPreparation(exigences, documentsParExigence);
  const prochaineAction = calculerProchaineAction(
    exigences,
    documentsParExigence,
    controleCroise,
    jalons,
  );
  const controleBloquantesKo = controleCroise.filter(
    (r) => r.severite === "bloquante" && !r.ok,
  ).length;
  const controleAvertissementsKo = controleCroise.filter(
    (r) => r.severite === "avertissement" && !r.ok,
  ).length;

  // Récapitulatif gérant (sprint S8, voir CLAUDE.md, Étape 8) : les points
  // faibles sont les règles bloquantes en échec - un avertissement n'est
  // pas, par définition, ce qui met l'offre en péril. Libellés résolus ici
  // (next-intl) avant d'être passés au builder sans dépendance à la locale.
  const indicateursChiffrage = calculerIndicateursChiffrage(
    lignesBpuTotal,
    regimeFiscal,
    appelOffres.fourchette_prix_basse,
    appelOffres.fourchette_prix_haute,
    appelOffres.montant_estimatif,
    appelOffres.marge_plancher_pct,
  );
  const pointsFaiblesRecap = controleCroise
    .filter((r) => r.severite === "bloquante" && !r.ok)
    .map((r) => t(`controleCroise.rules.${r.id}.titre`));
  const recapGerantTexte = construireRecapGerant({
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original ?? t("recap.titreSansNom"),
    montantHtFcfa: indicateursChiffrage.totalHt,
    margePourcentage: indicateursChiffrage.margeBrutePourcentage,
    piecesDeposees: compterFournies(piecesRequises),
    piecesTotal: piecesRequises.length,
    pointsFaibles: pointsFaiblesRecap,
  });

  // Badge affiché uniquement pour les deux catégories qui demandent une
  // attention particulière ("notee" est déjà signalée par le badge de
  // pondération juste à côté, "formelle" est le cas par défaut sans enjeu).
  function badgeCategorieExigence(categorie: ExigenceAo["categorie_exigence"]) {
    if (categorie === "eliminatoire") {
      return <Badge variant="destructive">{t("exigences.eliminatoire")}</Badge>;
    }
    if (categorie === "qualification") {
      return <Badge variant="secondary">{t("exigences.qualification")}</Badge>;
    }
    return null;
  }

  function listePieces(pieces: ExigenceAo[]) {
    return pieces.length === 0 ? (
      <p className="text-sm text-muted-foreground">{t("exigences.aucunePiece")}</p>
    ) : (
      <ul className="flex flex-col gap-3">
        {pieces.map((exigence) => (
          <li key={exigence.id} className="border-b pb-2">
            <div className="flex items-center gap-2">
              <p className="font-medium">{exigence.libelle}</p>
              {badgeCategorieExigence(exigence.categorie_exigence)}
            </div>
            {exigence.description && (
              <p className="text-sm text-muted-foreground">{exigence.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("exigences.source")} : {exigence.source_section}
            </p>
            <div className="mt-2">
              <DocumentsExigence
                appelOffresId={appelOffres.id}
                exigenceId={exigence.id}
                libelleExigence={exigence.libelle}
                documentsAssocies={documentsParExigence[exigence.id] ?? []}
                bibliotheque={bibliotheque}
                modeleCvDisponible={appelOffres.modele_cv_markdown !== null}
                cvTransformeParDocument={cvTransformes}
                onCvTransforme={(documentId, cv) =>
                  setCvTransformes((carte) => ({ ...carte, [documentId]: cv }))
                }
                documentIdEnCours={documentIdEnCours}
                onDocumentIdEnCoursChange={setDocumentIdEnCours}
                typeFormulaireStandard={identifierFormulaireStandard(exigence.libelle)}
                sectionFormulaire={sections.find((s) => s.titre === exigence.libelle)}
                criteresQualification={criteresEvaluation}
              />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function listeCriteres(criteres: ExigenceAo[], editableNoteSimulee = false) {
    const afficherNoteSimulee =
      editableNoteSimulee && appelOffres.procedure_marche === "demande_propositions";
    return criteres.length === 0 ? (
      <p className="text-sm text-muted-foreground">{t("exigences.aucunCritere")}</p>
    ) : (
      <ul className="flex flex-col gap-3">
        {criteres.map((exigence) => (
          <li key={exigence.id} className="flex items-center justify-between border-b pb-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{exigence.libelle}</p>
                {badgeCategorieExigence(exigence.categorie_exigence)}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("exigences.source")} : {exigence.source_section}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {afficherNoteSimulee && (
                <div className="flex items-center gap-1">
                  <Label htmlFor={`note-simulee-${exigence.id}`} className="text-xs text-muted-foreground">
                    {t("exigences.noteSimulee")}
                  </Label>
                  <Input
                    id={`note-simulee-${exigence.id}`}
                    type="number"
                    defaultValue={notesSimulees[exigence.id] ?? ""}
                    onBlur={(e) => enregistrerNoteSimulee(exigence.id, e.target.value)}
                    className="w-20"
                  />
                </div>
              )}
              {exigence.ponderation !== null && (
                <Badge variant="outline">{exigence.ponderation}%</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  function listeRedaction(titresSection: string[]) {
    if (titresSection.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("redaction.titre")}</h2>
        {titresSection.map((titreSection) => {
          const section = sections.find((s) => s.titre === titreSection);
          return (
            <SectionRedaction
              key={titreSection}
              appelOffresId={appelOffres.id}
              titreSection={titreSection}
              section={section}
              documentsSource={section ? (documentsParSection[section.id] ?? []) : []}
              bibliotheque={bibliotheque}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <StatutTraitementBadge
          statut={appelOffres.statut_traitement}
          erreurTraitement={appelOffres.erreur_traitement}
          dateCreation={appelOffres.created_at}
        />
        {appelOffres.fichier_dao_path && fichiersSupplementaires.length === 0 && (
          <Button
            variant="outline"
            onClick={() => telecharger(appelOffres.fichier_dao_path!)}
            disabled={telechargementEnCours !== null}
          >
            {telechargementEnCours === appelOffres.fichier_dao_path && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {t("boutonTelecharger")}
          </Button>
        )}
        {appelOffres.fichier_dao_path && fichiersSupplementaires.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              title={appelOffres.fichier_dao_nom_original ?? undefined}
              onClick={() => telecharger(appelOffres.fichier_dao_path!)}
              disabled={telechargementEnCours !== null}
            >
              {telechargementEnCours === appelOffres.fichier_dao_path && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {t(
                classifierTypeFichierDao(appelOffres.fichier_dao_nom_original ?? "") === "dpao"
                  ? "boutonTelechargerDpa"
                  : "boutonTelechargerDaoCourt",
              )}
            </Button>
            {fichiersSupplementaires.map((f) => (
              <Button
                key={f.id}
                variant="outline"
                size="sm"
                title={f.nom_original}
                onClick={() => telecharger(f.chemin_stockage)}
                disabled={telechargementEnCours !== null}
              >
                {telechargementEnCours === f.chemin_stockage && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t(
                  classifierTypeFichierDao(f.nom_original) === "dpao"
                    ? "boutonTelechargerDpa"
                    : "boutonTelechargerDaoCourt",
                )}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Uniquement renseigné pour un AO importé du catalogue national :
          aucun fichier DAO n'est joint dans ce cas, et ce contact est le
          seul moyen pour le client d'aller retirer le dossier complet
          (voir spec veille BOMP). Rendu tout en haut, à côté du bloc de
          statut, pour ne pas être noyé dans le formulaire. */}
      {appelOffres.contact_retrait && (
        <div className="rounded-md border border-dashed p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("labelContactRetrait")}
          </p>
          <p className="text-sm whitespace-pre-line">{appelOffres.contact_retrait}</p>
        </div>
      )}

      {!pret && (
        <p className="text-muted-foreground">
          {appelOffres.statut_traitement === "erreur"
            ? appelOffres.erreur_traitement
            : t("messageTraitementEnCours")}
        </p>
      )}

      <Tabs defaultValue="radar">
        <TabsList>
          <TabsTrigger value="radar">{t("onglets.radar")}</TabsTrigger>
          <TabsTrigger value="go-no-go">{t("onglets.goNoGo")}</TabsTrigger>
          <TabsTrigger value="offre-technique">{t("onglets.offreTechnique")}</TabsTrigger>
          <TabsTrigger value="offre-financiere">{t("onglets.offreFinanciere")}</TabsTrigger>
        </TabsList>

        <TabsContent
          value="radar"
          className="flex flex-col gap-6 data-[state=inactive]:hidden"
          forceMount
        >
          <form action={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="titre">{t("form.champTitre")}</Label>
              <Input
                id="titre"
                name="titre"
                defaultValue={appelOffres.titre ?? ""}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="acheteur">{t("form.champAcheteur")}</Label>
              <Input
                id="acheteur"
                name="acheteur"
                defaultValue={appelOffres.acheteur ?? ""}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="secteur">{t("form.champSecteur")}</Label>
              <Input
                id="secteur"
                name="secteur"
                defaultValue={appelOffres.secteur ?? ""}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dateLimite">{t("form.champDateLimite")}</Label>
              <Input
                id="dateLimite"
                name="dateLimite"
                type="datetime-local"
                defaultValue={versValeurDatetimeLocal(appelOffres.date_limite)}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="montantCaution">{t("form.champMontantCaution")}</Label>
              <Input
                id="montantCaution"
                name="montantCaution"
                type="number"
                defaultValue={appelOffres.montant_caution ?? ""}
                disabled={!pret}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="typeAcheteur">{t("form.champTypeAcheteur")}</Label>
              <Select
                name="typeAcheteur"
                defaultValue={appelOffres.type_acheteur ?? VALEUR_NON_RENSEIGNE}
                disabled={!pret}
              >
                <SelectTrigger id="typeAcheteur" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VALEUR_NON_RENSEIGNE}>{t("form.optionNonRenseigne")}</SelectItem>
                  {TYPES_ACHETEUR_AO.map((valeur) => (
                    <SelectItem key={valeur} value={valeur}>
                      {t(`form.optionsTypeAcheteur.${CLES_TYPE_ACHETEUR[valeur]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="procedureMarche">{t("form.champProcedure")}</Label>
              <Select
                name="procedureMarche"
                defaultValue={appelOffres.procedure_marche ?? VALEUR_NON_RENSEIGNE}
                disabled={!pret}
              >
                <SelectTrigger id="procedureMarche" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VALEUR_NON_RENSEIGNE}>{t("form.optionNonRenseigne")}</SelectItem>
                  {PROCEDURES_AO.map((valeur) => (
                    <SelectItem key={valeur} value={valeur}>
                      {t(`form.optionsProcedure.${CLES_PROCEDURE[valeur]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="canalDepot">{t("form.champCanalDepot")}</Label>
              <Select
                name="canalDepot"
                defaultValue={appelOffres.canal_depot ?? VALEUR_NON_RENSEIGNE}
                disabled={!pret}
              >
                <SelectTrigger id="canalDepot" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VALEUR_NON_RENSEIGNE}>{t("form.optionNonRenseigne")}</SelectItem>
                  {CANAUX_DEPOT_AO.map((valeur) => (
                    <SelectItem key={valeur} value={valeur}>
                      {t(`form.optionsCanalDepot.${CLES_CANAL_DEPOT[valeur]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="typePlis">{t("form.champTypePlis")}</Label>
              <Select
                name="typePlis"
                defaultValue={appelOffres.type_plis ?? VALEUR_NON_RENSEIGNE}
                disabled={!pret}
              >
                <SelectTrigger id="typePlis" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VALEUR_NON_RENSEIGNE}>{t("form.optionNonRenseigne")}</SelectItem>
                  {TYPES_PLIS_AO.map((valeur) => (
                    <SelectItem key={valeur} value={valeur}>
                      {t(`form.optionsTypePlis.${CLES_TYPE_PLIS[valeur]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <h3 className="mt-2 text-sm font-semibold text-muted-foreground">
              {t("form.titreParametresEvaluation")}
            </h3>

            <div className="flex flex-col gap-2">
              <Label htmlFor="modeEvaluation">{t("form.champModeEvaluation")}</Label>
              <Select
                name="modeEvaluation"
                defaultValue={appelOffres.mode_evaluation ?? VALEUR_NON_RENSEIGNE}
                disabled={!pret}
              >
                <SelectTrigger id="modeEvaluation" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={VALEUR_NON_RENSEIGNE}>{t("form.optionNonRenseigne")}</SelectItem>
                  {MODES_EVALUATION_AO.map((valeur) => (
                    <SelectItem key={valeur} value={valeur}>
                      {t(`form.optionsModeEvaluation.${CLES_MODE_EVALUATION[valeur]}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fourchettePrixBasse">{t("form.champFourchettePrixBasse")}</Label>
                <Input
                  id="fourchettePrixBasse"
                  name="fourchettePrixBasse"
                  type="number"
                  defaultValue={appelOffres.fourchette_prix_basse ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="fourchettePrixHaute">{t("form.champFourchettePrixHaute")}</Label>
                <Input
                  id="fourchettePrixHaute"
                  name="fourchettePrixHaute"
                  type="number"
                  defaultValue={appelOffres.fourchette_prix_haute ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="montantEstimatif">{t("form.champMontantEstimatif")}</Label>
                <Input
                  id="montantEstimatif"
                  name="montantEstimatif"
                  type="number"
                  defaultValue={appelOffres.montant_estimatif ?? ""}
                  disabled={!pret}
                />
                <p className="text-xs text-muted-foreground">
                  {t("form.aideMontantEstimatif")}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="variationQuantiteHausse">
                  {t("form.champVariationQuantiteHausse")}
                </Label>
                <Input
                  id="variationQuantiteHausse"
                  name="variationQuantiteHausse"
                  type="number"
                  defaultValue={appelOffres.variation_quantite_hausse ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="variationQuantiteBaisse">
                  {t("form.champVariationQuantiteBaisse")}
                </Label>
                <Input
                  id="variationQuantiteBaisse"
                  name="variationQuantiteBaisse"
                  type="number"
                  defaultValue={appelOffres.variation_quantite_baisse ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tauxRedevanceReglementation">{t("form.champTauxRedevance")}</Label>
                <Input
                  id="tauxRedevanceReglementation"
                  name="tauxRedevanceReglementation"
                  type="number"
                  defaultValue={appelOffres.taux_redevance_reglementation ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="timbreRequis">{t("form.champTimbreRequis")}</Label>
                <Select
                  name="timbreRequis"
                  defaultValue={
                    appelOffres.timbre_requis === null
                      ? VALEUR_NON_RENSEIGNE
                      : appelOffres.timbre_requis
                        ? "oui"
                        : "non"
                  }
                  disabled={!pret}
                >
                  <SelectTrigger id="timbreRequis" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={VALEUR_NON_RENSEIGNE}>{t("form.optionNonRenseigne")}</SelectItem>
                    <SelectItem value="oui">{t("form.optionOui")}</SelectItem>
                    <SelectItem value="non">{t("form.optionNon")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="margePlancherPct">{t("form.champMargePlancher")}</Label>
                <Input
                  id="margePlancherPct"
                  name="margePlancherPct"
                  type="number"
                  defaultValue={appelOffres.marge_plancher_pct ?? ""}
                  disabled={!pret}
                />
                <p className="text-xs text-muted-foreground">{t("form.aideMargePlancher")}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="seuilQualificatifTechniquePct">
                  {t("form.champSeuilQualificatifTechnique")}
                </Label>
                <Input
                  id="seuilQualificatifTechniquePct"
                  name="seuilQualificatifTechniquePct"
                  type="number"
                  defaultValue={appelOffres.seuil_qualificatif_technique_pct ?? ""}
                  disabled={!pret}
                />
                <p className="text-xs text-muted-foreground">
                  {t("form.aideSeuilQualificatifTechnique")}
                </p>
              </div>
            </div>

            <h3 className="mt-2 text-sm font-semibold text-muted-foreground">
              {t("form.titreReferences")}
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="periodeReferencesDebut">{t("form.champPeriodeReferencesDebut")}</Label>
                <Input
                  id="periodeReferencesDebut"
                  name="periodeReferencesDebut"
                  type="date"
                  defaultValue={appelOffres.periode_references_debut ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="periodeReferencesFin">{t("form.champPeriodeReferencesFin")}</Label>
                <Input
                  id="periodeReferencesFin"
                  name="periodeReferencesFin"
                  type="date"
                  defaultValue={appelOffres.periode_references_fin ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="natureReferencesTags">{t("form.champNatureReferencesTags")}</Label>
                <Input
                  id="natureReferencesTags"
                  name="natureReferencesTags"
                  defaultValue={appelOffres.nature_references_tags.join(", ")}
                  placeholder={t("form.natureReferencesTagsPlaceholder")}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="montantMinimalReference">
                  {t("form.champMontantMinimalReference")}
                </Label>
                <Input
                  id="montantMinimalReference"
                  name="montantMinimalReference"
                  type="number"
                  defaultValue={appelOffres.montant_minimal_reference ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="nombreReferencesExigees">
                  {t("form.champNombreReferencesExigees")}
                </Label>
                <Input
                  id="nombreReferencesExigees"
                  name="nombreReferencesExigees"
                  type="number"
                  defaultValue={appelOffres.nombre_references_exigees ?? ""}
                  disabled={!pret}
                />
              </div>
            </div>

            <h3 className="mt-2 text-sm font-semibold text-muted-foreground">
              {t("form.titreEngagements")}
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="delaiLivraisonMaxJours">{t("form.champDelaiLivraisonMax")}</Label>
                <Input
                  id="delaiLivraisonMaxJours"
                  name="delaiLivraisonMaxJours"
                  type="number"
                  defaultValue={appelOffres.delai_livraison_max_jours ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="delaiLivraisonProposeJours">
                  {t("form.champDelaiLivraisonPropose")}
                </Label>
                <Input
                  id="delaiLivraisonProposeJours"
                  name="delaiLivraisonProposeJours"
                  type="number"
                  defaultValue={appelOffres.delai_livraison_propose_jours ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="garantieExigeeJours">{t("form.champGarantieExigee")}</Label>
                <Input
                  id="garantieExigeeJours"
                  name="garantieExigeeJours"
                  type="number"
                  defaultValue={appelOffres.garantie_exigee_jours ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="garantieProposeeJours">{t("form.champGarantieProposee")}</Label>
                <Input
                  id="garantieProposeeJours"
                  name="garantieProposeeJours"
                  type="number"
                  defaultValue={appelOffres.garantie_proposee_jours ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="validiteOffreJours">{t("form.champValiditeOffreExigee")}</Label>
                <Input
                  id="validiteOffreJours"
                  name="validiteOffreJours"
                  type="number"
                  defaultValue={appelOffres.validite_offre_jours ?? ""}
                  disabled={!pret}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="validiteOffreProposeJours">
                  {t("form.champValiditeOffreProposee")}
                </Label>
                <Input
                  id="validiteOffreProposeJours"
                  name="validiteOffreProposeJours"
                  type="number"
                  defaultValue={appelOffres.validite_offre_propose_jours ?? ""}
                  disabled={!pret}
                />
              </div>
            </div>

            <Button type="submit" disabled={!pret || envoi}>
              {envoi && <Loader2 className="h-4 w-4 animate-spin" />}
              {envoi ? t("form.envoiEnCours") : t("form.boutonEnregistrer")}
            </Button>
          </form>

          {(appelOffres.statut_pipeline === "soumis" ||
            appelOffres.statut_pipeline === "en_attente" ||
            appelOffres.statut_pipeline === "gagne" ||
            appelOffres.statut_pipeline === "perdu") && (
            <PvOuvertureCard
              appelOffresId={appelOffres.id}
              pvOuverture={pvOuverture}
              concurrentsInitiaux={concurrentsPvOuverture}
              statutPipeline={appelOffres.statut_pipeline}
              notrePrixTotal={totalBpu}
              fourchettePrixBasse={appelOffres.fourchette_prix_basse}
              fourchettePrixHaute={appelOffres.fourchette_prix_haute}
              montantEstimatif={appelOffres.montant_estimatif}
              decisionPrevue={evaluationGoNoGo.decision}
              noteTotalePrevue={evaluationGoNoGo.noteTotale}
            />
          )}

          {(appelOffres.statut_pipeline === "gagne" || appelOffres.statut_pipeline === "perdu") && (
            <ResultatCard
              appelOffresId={appelOffres.id}
              statutPipeline={appelOffres.statut_pipeline}
              raisonInitiale={appelOffres.raison_resultat}
              noteInitiale={appelOffres.note_resultat}
            />
          )}

          <GroupementCard
            appelOffresId={appelOffres.id}
            membresInitiaux={groupement.membres}
            piecesParMembreInitial={groupement.piecesParMembre}
            nomEntreprise={nomEntreprise}
          />

          <ModeleCv
            appelOffresId={appelOffres.id}
            modeleCvPath={appelOffres.modele_cv_path}
            modeleCvNomOriginal={appelOffres.modele_cv_nom_original}
            modeleCvMarkdown={appelOffres.modele_cv_markdown}
            daoMarkdown={appelOffres.dao_markdown}
          />

          <Retroplanning
            appelOffresId={appelOffres.id}
            dateLimiteConnue={dateLimiteConnue}
            jalonsInitiaux={jalons}
          />

          {pret && (
            <>
              <div className="flex flex-col gap-4 border rounded-lg p-4 sm:flex-row sm:items-center">
                <div
                  className="relative h-20 w-20 shrink-0 rounded-full"
                  style={{
                    background: `conic-gradient(hsl(var(--primary)) ${etatPreparation.preparationPct * 3.6}deg, hsl(var(--muted)) 0deg)`,
                  }}
                >
                  <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-background text-sm font-semibold">
                    {etatPreparation.preparationPct}%
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{t("radar.preparation")}</span>
                    <span>·</span>
                    <span>
                      {t("radar.eliminatoiresLeves", {
                        leves: etatPreparation.eliminatoiresLevees,
                        total: etatPreparation.eliminatoiresTotal,
                      })}
                    </span>
                    <span>·</span>
                    <span>
                      {t("radar.controleResume", {
                        bloquantes: controleBloquantesKo,
                        avertissements: controleAvertissementsKo,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("radar.prochaineAction.titre")}
                    </span>
                    <p className="text-sm font-medium">
                      {prochaineAction === null
                        ? t("radar.prochaineAction.aucune")
                        : prochaineAction.type === "eliminatoire_manquante"
                          ? t("radar.prochaineAction.eliminatoireManquante", {
                              libelle: prochaineAction.libelle,
                            })
                          : prochaineAction.type === "piece_perimee"
                            ? t("radar.prochaineAction.piecePerimee")
                            : prochaineAction.type === "controle_bloquant"
                              ? t("radar.prochaineAction.controleBloquant", {
                                  titre: t(
                                    `controleCroise.rules.${prochaineAction.libelle}.titre`,
                                  ),
                                })
                              : t("radar.prochaineAction.jalonEnRetard", {
                                  libelle: prochaineAction.libelle,
                                })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 border rounded-lg p-4">
                <h2 className="text-lg font-semibold">{t("controleCroise.titre")}</h2>
                <p className="text-sm text-muted-foreground">{t("controleCroise.sousTitre")}</p>
                <ul className="flex flex-col gap-2">
                  {controleCroise.map((resultat) => (
                    <li
                      key={resultat.id}
                      className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
                    >
                      <p className="text-sm">
                        {t(`controleCroise.rules.${resultat.id}.titre`)}
                      </p>
                      <Badge
                        variant={
                          resultat.ok
                            ? "secondary"
                            : resultat.severite === "bloquante"
                              ? "destructive"
                              : "default"
                        }
                        className="shrink-0"
                      >
                        {resultat.ok
                          ? t("controleCroise.badgeOk")
                          : t(`controleCroise.rules.${resultat.id}.messageKo`, {
                              nombre: resultat.nombre,
                            })}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>

              {pointsFlous.length > 0 && (
                <div className="flex flex-col gap-2 border rounded-lg p-4">
                  <h2 className="text-lg font-semibold">{t("pointsFlous.titre")}</h2>
                  {appelOffres.date_limite_questions && (
                    <p className="text-sm text-muted-foreground">
                      {t("pointsFlous.rappelDateLimite", {
                        date: new Date(appelOffres.date_limite_questions).toLocaleDateString(
                          "fr-FR",
                        ),
                      })}
                    </p>
                  )}
                  <ul className="flex flex-col gap-3">
                    {pointsFlous.map((point) => (
                      <li key={point.id} className="border-b pb-2 last:border-b-0 last:pb-0">
                        <p className="text-sm">{point.description}</p>
                        {point.source_section && (
                          <p className="text-xs text-muted-foreground">
                            {t("exigences.source")} : {point.source_section}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {appelOffres.sommaire_attendu && appelOffres.sommaire_attendu.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-semibold">{t("exigences.titreSommaire")}</h2>
                  <ul className="list-disc pl-5 text-sm">
                    {appelOffres.sommaire_attendu.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2 border rounded-lg p-4">
                  <h3 className="font-medium">{t("recap.titreGoNoGo")}</h3>
                  <Badge variant={VARIANT_DECISION[evaluationGoNoGo.decision]} className="w-fit">
                    {t(
                      `goNoGo.decision.${achatDaoEffectue ? "postAchat" : "achatDao"}.${evaluationGoNoGo.decision}`,
                    )}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {t("recap.noteSur20", { note: evaluationGoNoGo.noteTotale })}
                  </p>
                </div>

                <div className="flex flex-col gap-2 border rounded-lg p-4">
                  <h3 className="font-medium">{t("recap.titreOffreTechnique")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("recap.piecesFournies", {
                      fournies: compterFournies(piecesTechniques),
                      total: piecesTechniques.length,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("recap.eliminatoiresManquantes", {
                      count: compterEliminatoiresManquantes(piecesTechniques),
                    })}
                  </p>
                </div>

                <div className="flex flex-col gap-2 border rounded-lg p-4">
                  <h3 className="font-medium">{t("recap.titreOffreFinanciere")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("recap.piecesFournies", {
                      fournies: compterFournies(piecesFinancieres),
                      total: piecesFinancieres.length,
                    })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lignesBpuTotal.length === 0
                      ? t("recap.aucuneLigneBpu")
                      : t("recap.totalBpu", { montant: formaterMontant(totalBpu) })}
                  </p>
                  {lignesBpuNonChiffrees > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("recap.bpuNonChiffre", { count: lignesBpuNonChiffrees })}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 border rounded-lg p-4">
                <h2 className="text-lg font-semibold">{t("recap.titreGerant")}</h2>
                <p className="text-sm text-muted-foreground">{t("recap.explicationGerant")}</p>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {recapGerantTexte}
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(recapGerantTexte)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("recap.boutonWhatsapp")}
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`mailto:?subject=${encodeURIComponent(t("recap.sujetEmail", { titre: appelOffres.titre ?? "" }))}&body=${encodeURIComponent(recapGerantTexte)}`}
                    >
                      {t("recap.boutonEmail")}
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(recapGerantTexte);
                        toast.success(t("recap.toastCopie"));
                      } catch {
                        toast.error(t("recap.erreurCopie"));
                      }
                    }}
                  >
                    {t("recap.boutonCopier")}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{t("filSuivi.titre")}</h2>
                <FilSuivi
                  appelOffresId={appelOffres.id}
                  emailsLies={emailsLies}
                  suggestions={suggestions}
                />
              </div>

              <ChecklistSoumission
                appelOffresId={appelOffres.id}
                dossierReponseId={dossierReponseId}
                checklistAutomatique={checklistAutomatique}
                checklistManuelle={checklistManuelle}
              />

              <div className="flex items-center gap-2">
                <Checkbox
                  id="compacter-lettre-soumission"
                  checked={compacterLettreSoumission}
                  onCheckedChange={(v) => setCompacterLettreSoumission(v === true)}
                />
                <Label htmlFor="compacter-lettre-soumission" className="text-sm text-muted-foreground">
                  {t("export.compacterLettreSoumission")}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="version-finale"
                  checked={versionFinale}
                  onCheckedChange={(v) => setVersionFinale(v === true)}
                />
                <Label htmlFor="version-finale" className="text-sm text-muted-foreground">
                  {t("export.versionFinale")}
                </Label>
              </div>

              {appelOffres.type_plis === "tech_fin" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-muted-foreground">
                      {t("export.groupeTechnique")}
                    </span>
                    {boutonsExportFormat("technique", (format) => exporterPliFormat("technique", format))}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-muted-foreground">
                      {t("export.groupeFinanciere")}
                    </span>
                    {boutonsExportFormat("financiere", (format) => exporterPliFormat("financiere", format))}
                  </div>
                </div>
              ) : (
                boutonsExportFormat("dossier", exporterDossierFormat)
              )}
            </>
          )}
        </TabsContent>

        <TabsContent
          value="go-no-go"
          className="flex flex-col gap-6 data-[state=inactive]:hidden"
          forceMount
        >
          <QuestionnaireGoNoGo appelOffresId={appelOffres.id} syntheseInitiale={syntheseGoNoGo} />
          <GoNoGo
            appelOffresId={appelOffres.id}
            achatDaoEffectue={achatDaoEffectue}
            goNoGo={goNoGo}
            typesMarche={typesMarcheGoNoGo}
            questions={questionsGoNoGo}
            reponses={reponsesGoNoGo}
            parametres={parametresGoNoGo}
            suggestionAgrement={suggestionAgrement}
            suggestionAttestations={suggestionAttestations}
          />
        </TabsContent>

        <TabsContent
          value="offre-technique"
          className="flex flex-col gap-6 data-[state=inactive]:hidden"
          forceMount
        >
          {pret && (
            <>
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{t("exigences.titrePiecesRequises")}</h2>
                {listePieces(piecesTechniques)}
              </div>

              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">{t("exigences.titreCriteres")}</h2>
                {listeCriteres(criteresTechniques, true)}
              </div>

              <ConformiteTechnique
                appelOffresId={appelOffres.id}
                articlesInitiaux={conformiteTechnique.articles}
                lignesParArticleInitial={conformiteTechnique.lignesParArticle}
                articleProduitsParArticleInitial={conformiteTechnique.articleProduitsParArticle}
                produitsParIdInitial={conformiteTechnique.produitsParId}
                specsProduitParProduitInitial={conformiteTechnique.specsProduitParProduit}
                conformiteForceeInitiale={conformiteTechnique.conformiteForceeParLigneProduit}
                produitsEntreprise={produitsEntreprise}
                lignesBpu={lignesBpuTotal}
              />

              <References
                appelOffresId={appelOffres.id}
                appelOffresReferencesInitiales={referencesAppelOffres.appelOffresReferences}
                referencesParIdInitial={referencesAppelOffres.referencesParId}
                justificatifsParReferenceInitial={referencesAppelOffres.justificatifsParReference}
                abeDocumentParReferenceInitial={referencesAppelOffres.abeDocumentParReference}
                catalogueReferences={catalogueReferences}
                bibliotheque={bibliotheque}
                entrepriseContact={entrepriseContact}
                criteresAo={{
                  periodeDebut: appelOffres.periode_references_debut,
                  periodeFin: appelOffres.periode_references_fin,
                  natureTags: appelOffres.nature_references_tags,
                  montantMinimal: appelOffres.montant_minimal_reference,
                }}
              />

              {listeRedaction(sectionsNarrativesTechnique)}

              <div className="flex flex-col gap-1 border-t pt-3">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("export.titreOffreTechnique")}
                </span>
                {boutonsExportFormat("technique", (format) => exporterPliFormat("technique", format))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent
          value="offre-financiere"
          className="flex flex-col gap-6 data-[state=inactive]:hidden"
          forceMount
        >
          {appelOffres.procedure_marche === "ami" ? (
            <p className="text-sm text-muted-foreground">
              {t("offreFinanciere.desactiveeAmi")}
            </p>
          ) : offreFinanciereVerrouilleeParNote ? (
            <p className="text-sm text-muted-foreground">
              {appelOffres.seuil_qualificatif_technique_pct !== null &&
                t("offreFinanciere.verrouilleeDemandePropositions", {
                  seuil: appelOffres.seuil_qualificatif_technique_pct,
                  note:
                    noteTechniqueSimulee === null
                      ? t("offreFinanciere.noteInconnue")
                      : noteTechniqueSimulee.toLocaleString("fr-FR", {
                          maximumFractionDigits: 1,
                        }),
                })}
            </p>
          ) : (
            <>
              {appelOffres.procedure_marche === "gre_a_gre" && (
                <NegociationGreAGre
                  appelOffresId={appelOffres.id}
                  toursInitiaux={toursNegociation}
                />
              )}

              {pret && (
                <>
                  <div className="flex flex-col gap-2">
                    <h2 className="text-lg font-semibold">
                      {t("exigences.titrePiecesRequises")}
                    </h2>
                    {listePieces(piecesFinancieres)}
                  </div>

                  <div className="flex flex-col gap-2">
                    <h2 className="text-lg font-semibold">{t("exigences.titreCriteres")}</h2>
                    {listeCriteres(criteresFinanciers)}
                  </div>

                  {listeRedaction(sectionsNarrativesFinanciere)}
                </>
              )}

              <Bpu
                appelOffresId={appelOffres.id}
                sectionsInitiales={bpu.sections}
                lignesParSectionInitiales={bpu.lignesParSection}
                tauxFraisStructureDefaut={tauxFraisStructureDefaut}
                regimeFiscal={regimeFiscal}
                fourchettePrixBasse={appelOffres.fourchette_prix_basse}
                fourchettePrixHaute={appelOffres.fourchette_prix_haute}
                montantEstimatif={appelOffres.montant_estimatif}
                margePlancherPct={appelOffres.marge_plancher_pct}
              />

              {pret && (
                <div className="flex flex-col gap-1 border-t pt-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t("export.titreOffreFinanciere")}
                  </span>
                  {boutonsExportFormat("financiere", (format) => exporterPliFormat("financiere", format))}
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
