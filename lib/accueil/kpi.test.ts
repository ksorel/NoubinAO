import { describe, expect, it } from "vitest";
import {
  calculerKpiAccueil,
  calculerRepartitionPipeline,
  listerAoEcheanceProche,
  listerDocumentsExpirant,
} from "./kpi";
import type { AppelOffres } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";

function creerAppelOffres(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "btp",
    date_limite: null,
    montant_caution: null,
    contact_retrait: null,
    statut_pipeline: "identifie",
    statut_traitement: "termine",
    erreur_traitement: null,
    fichier_dao_path: "ent-1/appels-offres/ao-1-dao.pdf",
    fichier_dao_nom_original: "dao.pdf",
    modele_cv_path: null,
    modele_cv_nom_original: null,
    modele_cv_markdown: null,
    dao_markdown: null,
    sommaire_attendu: ["Offre technique", "Offre financière"],
    assigne_a: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "piece_administrative",
    nom: "RCCM K-Nowledge",
    fichier_path: "ent-1/documents/rccm.pdf",
    fichier_nom_original: "rccm.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: false,
    created_by: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

const AUJOURDHUI = new Date("2026-09-30T00:00:00Z");

describe("calculerKpiAccueil", () => {
  it("retourne des zéros sans AO/document", () => {
    const kpi = calculerKpiAccueil([], [], 0, AUJOURDHUI);
    expect(kpi).toEqual({
      aoEnCours: 0,
      aoEcheanceProche: 0,
      documentsExpirant: 0,
      notificationsNonLues: 0,
    });
  });

  it("exclut gagne/perdu/sans_suite du compte aoEnCours", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", statut_pipeline: "identifie" }),
      creerAppelOffres({ id: "ao-2", statut_pipeline: "gagne" }),
      creerAppelOffres({ id: "ao-3", statut_pipeline: "perdu" }),
      creerAppelOffres({ id: "ao-4", statut_pipeline: "sans_suite" }),
      creerAppelOffres({ id: "ao-5", statut_pipeline: "en_preparation" }),
    ];
    const kpi = calculerKpiAccueil(appelsOffres, [], 0, AUJOURDHUI);
    expect(kpi.aoEnCours).toBe(2);
  });

  it("compte aoEcheanceProche seulement parmi les AO en cours, rouge ou dépassée", () => {
    const appelsOffres = [
      // en cours, dépassée (< aujourd'hui)
      creerAppelOffres({ id: "ao-1", statut_pipeline: "identifie", date_limite: "2026-09-01" }),
      // en cours, rouge (< 30 jours)
      creerAppelOffres({ id: "ao-2", statut_pipeline: "en_preparation", date_limite: "2026-10-10" }),
      // en cours, orange (> 30 jours) — ne compte pas
      creerAppelOffres({ id: "ao-3", statut_pipeline: "soumis", date_limite: "2026-12-01" }),
      // gagné avec échéance dépassée — fermé, ne compte pas malgré la date
      creerAppelOffres({ id: "ao-4", statut_pipeline: "gagne", date_limite: "2026-09-01" }),
      // en cours, pas de date limite — ne compte pas
      creerAppelOffres({ id: "ao-5", statut_pipeline: "identifie", date_limite: null }),
    ];
    const kpi = calculerKpiAccueil(appelsOffres, [], 0, AUJOURDHUI);
    expect(kpi.aoEcheanceProche).toBe(2);
  });

  it("compte documentsExpirant seulement en statut rouge", () => {
    const documents = [
      creerDocument({ id: "doc-1", date_expiration: "2026-10-10" }), // rouge
      creerDocument({ id: "doc-2", date_expiration: "2026-12-25" }), // orange
      creerDocument({ id: "doc-3", date_expiration: null }), // pas de date, exclu
    ];
    const kpi = calculerKpiAccueil([], documents, 0, AUJOURDHUI);
    expect(kpi.documentsExpirant).toBe(1);
  });

  it("passe notificationsNonLues tel quel", () => {
    const kpi = calculerKpiAccueil([], [], 7, AUJOURDHUI);
    expect(kpi.notificationsNonLues).toBe(7);
  });
});

describe("calculerRepartitionPipeline", () => {
  it("retourne une liste vide sans AO", () => {
    expect(calculerRepartitionPipeline([])).toEqual([]);
  });

  it("regroupe tous les AO (y compris fermés) par statut, ordre de l'enum", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", statut_pipeline: "soumis" }),
      creerAppelOffres({ id: "ao-2", statut_pipeline: "identifie" }),
      creerAppelOffres({ id: "ao-3", statut_pipeline: "identifie" }),
      creerAppelOffres({ id: "ao-4", statut_pipeline: "gagne" }),
    ];
    expect(calculerRepartitionPipeline(appelsOffres)).toEqual([
      { statut: "identifie", nombre: 2 },
      { statut: "soumis", nombre: 1 },
      { statut: "gagne", nombre: 1 },
    ]);
  });

  it("n'inclut pas de statut absent des données", () => {
    const appelsOffres = [creerAppelOffres({ id: "ao-1", statut_pipeline: "identifie" })];
    const repartition = calculerRepartitionPipeline(appelsOffres);
    expect(repartition).toHaveLength(1);
    expect(repartition.find((r) => r.statut === "en_preparation")).toBeUndefined();
  });
});

describe("listerAoEcheanceProche", () => {
  it("retourne une liste vide sans AO éligible", () => {
    expect(listerAoEcheanceProche([], AUJOURDHUI)).toEqual([]);
  });

  it("trie par date limite croissante (le plus urgent d'abord)", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", titre: "B", date_limite: "2026-10-15" }),
      creerAppelOffres({ id: "ao-2", titre: "A", date_limite: "2026-09-25" }),
    ];
    const resultat = listerAoEcheanceProche(appelsOffres, AUJOURDHUI);
    expect(resultat.map((r) => r.id)).toEqual(["ao-2", "ao-1"]);
  });

  it("tronque à la limite fournie", () => {
    const appelsOffres = Array.from({ length: 8 }, (_, i) =>
      creerAppelOffres({ id: `ao-${i}`, date_limite: "2026-10-10" }),
    );
    expect(listerAoEcheanceProche(appelsOffres, AUJOURDHUI, 5)).toHaveLength(5);
  });

  it("exclut les AO fermés et ceux hors seuil rouge/dépassée", () => {
    const appelsOffres = [
      creerAppelOffres({ id: "ao-1", statut_pipeline: "gagne", date_limite: "2026-10-01" }),
      creerAppelOffres({ id: "ao-2", statut_pipeline: "identifie", date_limite: "2026-12-25" }),
    ];
    expect(listerAoEcheanceProche(appelsOffres, AUJOURDHUI)).toEqual([]);
  });

  it("inclut fichierDaoNomOriginal pour le fallback d'affichage", () => {
    const appelsOffres = [
      creerAppelOffres({
        id: "ao-1",
        titre: null,
        fichier_dao_nom_original: "dao-lot-3.pdf",
        date_limite: "2026-10-01",
      }),
    ];
    expect(listerAoEcheanceProche(appelsOffres, AUJOURDHUI)).toEqual([
      { id: "ao-1", titre: null, fichierDaoNomOriginal: "dao-lot-3.pdf", dateLimite: "2026-10-01" },
    ]);
  });
});

describe("listerDocumentsExpirant", () => {
  it("retourne une liste vide sans document éligible", () => {
    expect(listerDocumentsExpirant([], AUJOURDHUI)).toEqual([]);
  });

  it("trie par date d'expiration croissante", () => {
    const documents = [
      creerDocument({ id: "doc-1", nom: "B", date_expiration: "2026-10-15" }),
      creerDocument({ id: "doc-2", nom: "A", date_expiration: "2026-09-25" }),
    ];
    const resultat = listerDocumentsExpirant(documents, AUJOURDHUI);
    expect(resultat.map((r) => r.id)).toEqual(["doc-2", "doc-1"]);
  });

  it("tronque à la limite fournie", () => {
    const documents = Array.from({ length: 8 }, (_, i) =>
      creerDocument({ id: `doc-${i}`, date_expiration: "2026-10-10" }),
    );
    expect(listerDocumentsExpirant(documents, AUJOURDHUI, 5)).toHaveLength(5);
  });

  it("exclut les documents sans date d'expiration ou hors seuil rouge", () => {
    const documents = [
      creerDocument({ id: "doc-1", date_expiration: null }),
      creerDocument({ id: "doc-2", date_expiration: "2026-12-25" }),
    ];
    expect(listerDocumentsExpirant(documents, AUJOURDHUI)).toEqual([]);
  });
});
