import { describe, expect, it } from "vitest";
import { construirePlanExportGoNoGo } from "./go-no-go-plan";
import type {
  AppelOffres,
  GoNoGo,
  QuestionGoNoGo,
  ReponseGoNoGo,
  TypeMarcheGoNoGo,
} from "../types";

function appelOffres(partiel: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: "Construction d'un pont",
    acheteur: "Ministère des Travaux Publics",
    secteur: "btp",
    date_limite: null,
    montant_caution: null,
    contact_retrait: null,
    statut_pipeline: "identifie",
    statut_traitement: "termine",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-0-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    modele_cv_path: null,
    modele_cv_nom_original: null,
    modele_cv_markdown: null,
    dao_markdown: null,
    sommaire_attendu: null,
    type_acheteur: null,
    procedure_marche: null,
    canal_depot: null,
    mode_evaluation: null,
    fourchette_prix_basse: null,
    fourchette_prix_haute: null,
    montant_estimatif: null,
    variation_quantite_hausse: null,
    variation_quantite_baisse: null,
    taux_redevance_reglementation: null,
    timbre_requis: null,
    marge_plancher_pct: null,
    seuil_qualificatif_technique_pct: null,
    periode_references_debut: null,
    periode_references_fin: null,
    nature_references_tags: [],
    montant_minimal_reference: null,
    nombre_references_exigees: null,
    date_limite_questions: null,
    delai_livraison_max_jours: null,
    delai_livraison_propose_jours: null,
    garantie_exigee_jours: null,
    garantie_proposee_jours: null,
    validite_offre_jours: null,
    validite_offre_propose_jours: null,
    assigne_a: null,
    created_by: null,
    raison_resultat: null,
    note_resultat: null,
    created_at: new Date().toISOString(),
    ...partiel,
  };
}

function goNoGo(partiel: Partial<GoNoGo> = {}): GoNoGo {
  return {
    id: "gng-1",
    appel_offres_id: "ao-1",
    type_marche_id: "type-1",
    montant_marche_estime: 45_000_000,
    cout_total_realisation: 36_000_000,
    prix_dao: 100_000,
    caution_soumission: 900_000,
    frais_preparation: 150_000,
    avance_pourcentage: 0.15,
    delai_paiement_jours: 120,
    argent_disponible_banque: 12_000_000,
    note_interet_strategique: 4,
    note_client_paie: 3,
    note_concurrence: 2,
    note_risques: 3,
    commentaire_global: null,
    modifie_par: null,
    modifie_le: new Date().toISOString(),
    ...partiel,
  };
}

const typesMarche: TypeMarcheGoNoGo[] = [
  { id: "type-1", entreprise_id: "ent-1", nom: "Travaux routiers", actif: true, ordre: 0, created_at: "" },
];

const questions: QuestionGoNoGo[] = [
  {
    id: "q-admin",
    entreprise_id: "ent-1",
    type_marche_id: null,
    categorie: "administratif",
    texte: "Avons-nous le bon agrément ?",
    ordre: 0,
    actif: true,
    cle_suggestion: "agrement",
    created_at: "",
  },
  {
    id: "q-savoir",
    entreprise_id: "ent-1",
    type_marche_id: "type-1",
    categorie: "savoir_faire",
    texte: "Avons-nous déjà réalisé ce type de travaux ?",
    ordre: 0,
    actif: true,
    cle_suggestion: null,
    created_at: "",
  },
];

const reponses: ReponseGoNoGo[] = [
  {
    id: "r-1",
    go_no_go_id: "gng-1",
    question_id: "q-admin",
    texte_question_snapshot: "Avons-nous le bon agrément ?",
    reponse: "oui",
    commentaire: null,
    modifie_le: "",
  },
];

describe("construirePlanExportGoNoGo", () => {
  it("résout le nom du type de marché et calcule la décision à partir des valeurs persistées", () => {
    const plan = construirePlanExportGoNoGo(
      appelOffres(),
      goNoGo(),
      questions,
      reponses,
      typesMarche,
      null,
      { noteMinGo: 14, margeMinVisee: 0.15 },
      new Date("2026-10-19T00:00:00Z"),
    );

    expect(plan.typeMarcheNom).toBe("Travaux routiers");
    expect(plan.dateExport).toBe("19/10/2026");
    // Une question savoir-faire sans réponse -> à compléter, pas go/no-go.
    expect(plan.decision).toBe("a_completer");
    expect(plan.sectionA.questionsNonRepondues).toBe(1);
    expect(plan.sectionA.nombreNon).toBe(0);
    expect(plan.synthese).toBeNull();
  });

  it("type de marché non choisi -> nom null, groupe savoir-faire vide", () => {
    const plan = construirePlanExportGoNoGo(
      appelOffres(),
      goNoGo({ type_marche_id: null }),
      questions,
      reponses,
      typesMarche,
      null,
      { noteMinGo: 14, margeMinVisee: 0.15 },
      new Date(),
    );

    expect(plan.typeMarcheNom).toBeNull();
    const groupeSavoirFaire = plan.sectionA.groupes.find((g) => g.categorie === "savoir_faire");
    expect(groupeSavoirFaire?.questions).toHaveLength(0);
  });
});
