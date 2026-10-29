import type {
  AppelOffres,
  GoNoGo,
  QuestionGoNoGo,
  ReponseGoNoGo,
  TypeMarcheGoNoGo,
  SyntheseGoNoGo,
  CategorieQuestionGoNoGo,
  ReponseGoNoGoValeur,
  CleQuestionGoNoGo,
} from "../types";
import { evaluerGoNoGo, type DecisionGoNoGo } from "../go-no-go";

// Génération serveur sans contexte locale/requête (même contrainte que
// export/docx.ts) : libellés statiques en français, le DAO source l'étant
// systématiquement.
const LIBELLES_GROUPE: Record<CategorieQuestionGoNoGo, string> = {
  administratif: "Peut-on déposer ?",
  savoir_faire: "Savons-nous faire ?",
  ouverture_marche: "Le marché est-il vraiment ouvert ?",
};

const LIBELLES_REPONSE: Record<ReponseGoNoGoValeur, string> = {
  oui: "Oui",
  non: "Non",
  a_confirmer: "À confirmer",
};

const LIBELLES_QUESTION_SYNTHESE: Record<CleQuestionGoNoGo, string> = {
  facteurs_eliminatoires: "Facteurs éliminatoires",
  personnel_qualifie: "Personnel qualifié demandé (CV)",
  offre_technique: "Exigences de l'offre technique",
  offre_financiere: "Exigences de l'offre financière",
  references_requises: "Références de projets exigées",
  garanties: "Garanties financières exigées",
  delai_contraintes: "Délai et contraintes de calendrier",
  points_vigilance: "Points de vigilance",
};

export { LIBELLES_GROUPE, LIBELLES_REPONSE };

export interface PlanExportGoNoGo {
  titre: string;
  acheteur: string | null;
  dateExport: string;
  typeMarcheNom: string | null;
  achatDaoEffectue: boolean;
  decision: DecisionGoNoGo;
  sectionA: {
    groupes: Array<{
      categorie: CategorieQuestionGoNoGo;
      titre: string;
      questions: Array<{
        texte: string;
        reponse: ReponseGoNoGoValeur | null;
        reponseLibelle: string;
        commentaire: string | null;
      }>;
    }>;
    nombreNon: number;
    questionsNonRepondues: number;
  };
  sectionB: {
    montantMarcheEstime: number | null;
    coutTotalRealisation: number | null;
    prixDao: number | null;
    cautionSoumission: number | null;
    fraisPreparation: number | null;
    avancePourcentage: number | null;
    delaiPaiementJours: number | null;
    argentDisponibleBanque: number | null;
    coutPourRepondre: number;
    beneficeEstime: number;
    margeEstimee: number;
    avanceRecue: number;
    argentAAvancer: number;
    couverture: number;
    moisATenir: number;
  };
  sectionC: {
    noteMarge: number;
    noteTresorerie: number;
    noteInteretStrategique: number | null;
    noteClientPaie: number | null;
    noteConcurrence: number | null;
    noteRisques: number | null;
    noteTotale: number;
  };
  commentaireGlobal: string | null;
  synthese: {
    genereLe: string;
    reponses: Array<{ libelle: string; reponse: string; sourceSection: string | null }>;
  } | null;
}

function formaterDate(date: Date): string {
  const jour = String(date.getUTCDate()).padStart(2, "0");
  const mois = String(date.getUTCMonth() + 1).padStart(2, "0");
  const annee = date.getUTCFullYear();
  return `${jour}/${mois}/${annee}`;
}

export function construirePlanExportGoNoGo(
  appelOffres: AppelOffres,
  goNoGo: GoNoGo,
  questions: QuestionGoNoGo[],
  reponses: ReponseGoNoGo[],
  typesMarche: TypeMarcheGoNoGo[],
  synthese: SyntheseGoNoGo | null,
  parametres: { noteMinGo: number; margeMinVisee: number },
  dateExport: Date,
): PlanExportGoNoGo {
  const achatDaoEffectue = appelOffres.fichier_dao_path !== null;
  const reponseParQuestion = new Map(reponses.map((r) => [r.question_id, r]));

  const montants = {
    montantMarcheEstime: goNoGo.montant_marche_estime,
    coutTotalRealisation: goNoGo.cout_total_realisation,
    prixDao: goNoGo.prix_dao,
    cautionSoumission: goNoGo.caution_soumission,
    fraisPreparation: goNoGo.frais_preparation,
    avancePourcentage: goNoGo.avance_pourcentage,
    delaiPaiementJours: goNoGo.delai_paiement_jours,
    argentDisponibleBanque: goNoGo.argent_disponible_banque,
  };
  const notesManuelles = {
    noteInteretStrategique: goNoGo.note_interet_strategique,
    noteClientPaie: goNoGo.note_client_paie,
    noteConcurrence: goNoGo.note_concurrence,
    noteRisques: goNoGo.note_risques,
  };

  const evaluation = evaluerGoNoGo({
    typeMarcheId: goNoGo.type_marche_id,
    questions: questions.map((q) => ({ id: q.id, categorie: q.categorie, typeMarcheId: q.type_marche_id })),
    reponseParQuestion: new Map(
      [...reponseParQuestion.entries()].map(([id, r]) => [id, r.reponse]),
    ),
    montants,
    achatDaoEffectue,
    notesManuelles,
    parametres,
  });

  const groupes = (["administratif", "savoir_faire", "ouverture_marche"] as const).map((categorie) => ({
    categorie,
    titre: LIBELLES_GROUPE[categorie],
    questions: questions
      .filter((q) => {
        if (q.categorie !== categorie) return false;
        if (categorie === "savoir_faire") return q.type_marche_id === goNoGo.type_marche_id;
        return true;
      })
      .map((q) => {
        const reponse = reponseParQuestion.get(q.id);
        return {
          texte: q.texte,
          reponse: reponse?.reponse ?? null,
          reponseLibelle: reponse ? LIBELLES_REPONSE[reponse.reponse] : "-",
          commentaire: reponse?.commentaire ?? null,
        };
      }),
  }));

  const resultatsB = (() => {
    const montantMarche = montants.montantMarcheEstime ?? 0;
    const coutRealisation = montants.coutTotalRealisation ?? 0;
    const prixDao = montants.prixDao ?? 0;
    const caution = montants.cautionSoumission ?? 0;
    const fraisPreparation = montants.fraisPreparation ?? 0;
    const avancePourcentage = montants.avancePourcentage ?? 0;
    const delaiPaiementJours = montants.delaiPaiementJours ?? 0;
    const argentDisponible = montants.argentDisponibleBanque ?? 0;
    const coutPourRepondre = prixDao + caution + fraisPreparation;
    const beneficeEstime = montantMarche - coutRealisation;
    const margeEstimee = montantMarche === 0 ? 0 : beneficeEstime / montantMarche;
    const avanceRecue = montantMarche * avancePourcentage;
    const argentAAvancer = Math.max(0, coutRealisation - avanceRecue + caution);
    const couverture = argentAAvancer === 0 ? 1 : argentDisponible / argentAAvancer;
    const moisATenir = delaiPaiementJours / 30;
    return { coutPourRepondre, beneficeEstime, margeEstimee, avanceRecue, argentAAvancer, couverture, moisATenir };
  })();

  const typeMarcheNom = typesMarche.find((t) => t.id === goNoGo.type_marche_id)?.nom ?? null;

  return {
    titre: appelOffres.titre ?? appelOffres.fichier_dao_nom_original ?? "Appel d'offres sans titre",
    acheteur: appelOffres.acheteur,
    dateExport: formaterDate(dateExport),
    typeMarcheNom,
    achatDaoEffectue,
    decision: evaluation.decision,
    sectionA: {
      groupes,
      nombreNon: evaluation.nombreNon,
      questionsNonRepondues: evaluation.questionsNonRepondues,
    },
    sectionB: { ...montants, ...resultatsB },
    sectionC: {
      noteMarge: evaluation.noteMarge,
      noteTresorerie: evaluation.noteTresorerie,
      ...notesManuelles,
      noteTotale: evaluation.noteTotale,
    },
    commentaireGlobal: goNoGo.commentaire_global,
    synthese: synthese
      ? {
          genereLe: formaterDate(new Date(synthese.genere_le)),
          reponses: synthese.reponses.map((r) => ({
            libelle: LIBELLES_QUESTION_SYNTHESE[r.cle],
            reponse: r.reponse,
            sourceSection: r.source_section,
          })),
        }
      : null,
  };
}
