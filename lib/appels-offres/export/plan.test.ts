import { describe, expect, it } from "vitest";
import { construirePlanExport } from "./plan";
import type { AppelOffres, ExigenceAo, SectionDossier, SectionBpu, LigneBpu } from "../types";
import type { Document } from "@/lib/documents/types";

function creerAppelOffres(overrides: Partial<AppelOffres> = {}): AppelOffres {
  return {
    id: "ao-1",
    entreprise_id: "ent-1",
    titre: "Construction d'un pont",
    acheteur: "Ministère des Infrastructures",
    secteur: "BTP",
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
    raison_resultat: null,
    note_resultat: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

function creerExigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exi-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: "IS 4.2",
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

function creerSection(overrides: Partial<SectionDossier> = {}): SectionDossier {
  return {
    id: "sec-1",
    dossier_reponse_id: "dr-1",
    titre: "Méthodologie",
    contenu: "Texte généré et validé.",
    statut: "validee",
    generated_at: "2026-09-07T00:00:00Z",
    created_by: null,
    created_at: "2026-09-07T00:00:00Z",
    ...overrides,
  };
}

function creerSectionBpu(overrides: Partial<SectionBpu> = {}): SectionBpu {
  return {
    id: "sbpu-1",
    appel_offres_id: "ao-1",
    titre: "Installation de chantier",
    ordre: 0,
    created_by: null,
    created_at: "2026-09-16T00:00:00Z",
    ...overrides,
  };
}

function creerLigneBpu(overrides: Partial<LigneBpu> = {}): LigneBpu {
  return {
    id: "lbpu-1",
    section_bpu_id: "sbpu-1",
    code_article: null,
    designation: "Amenée et repli du matériel",
    unite: "Ens",
    quantite: 1,
    prix_unitaire: 500000,
    debourse_sec: null,
    taux_frais_structure: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-09-16T00:00:00Z",
    ...overrides,
  };
}

describe("construirePlanExport", () => {
  it("liste les documents associés à une pièce requise", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence();
    const document = creerDocument();

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      { [exigence.id]: [document] },
      [],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([
      {
        libelle: "RCCM",
        documents: [{ nom: "RCCM K-Nowledge", type: "Pièce administrative" }],
      },
    ]);
  });

  it("laisse la liste de documents vide pour une pièce non mappée", () => {
    const appelOffres = creerAppelOffres();
    const exigence = creerExigence({ id: "exi-2", libelle: "Attestation CNPS" });

    const plan = construirePlanExport(
      appelOffres,
      [exigence],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.piecesRequises).toEqual([{ libelle: "Attestation CNPS", documents: [] }]);
  });

  it("inclut les critères d'évaluation avec leur pondération", () => {
    const appelOffres = creerAppelOffres();
    const critere = creerExigence({
      id: "exi-3",
      type_exigence: "critere_evaluation",
      libelle: "Qualité technique",
      ponderation: 60,
    });

    const plan = construirePlanExport(
      appelOffres,
      [critere],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.criteresEvaluation).toEqual([{ libelle: "Qualité technique", ponderation: 60 }]);
  });

  it("renvoie une liste de critères vide si aucun n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.criteresEvaluation).toEqual([]);
  });

  it("conserve sommaire_attendu tel quel quand présent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: ["Section A", "Section B"] });

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toEqual(["Section A", "Section B"]);
  });

  it("renvoie null pour sommaireAttendu quand absent", () => {
    const appelOffres = creerAppelOffres({ sommaire_attendu: null });

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.sommaireAttendu).toBeNull();
  });

  it("formate la date d'export en JJ/MM/AAAA (UTC)", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-01-05T23:00:00Z"));

    expect(plan.dateExport).toBe("05/01/2026");
  });

  it("utilise le nom de fichier original comme titre si le titre est absent", () => {
    const appelOffres = creerAppelOffres({ titre: null, fichier_dao_nom_original: "dao-brut.pdf" });

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.titre).toBe("dao-brut.pdf");
  });

  it("inclut une section validée avec du contenu", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSection();

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [section],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.sectionsRedigees).toEqual([
      { titre: "Méthodologie", contenu: "Texte généré et validé." },
    ]);
  });

  it("exclut une section en statut brouillon", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSection({ statut: "brouillon" });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [section],
      new Date("2026-09-10T12:00:00Z"),
    );

    expect(plan.sectionsRedigees).toEqual([]);
  });

  it("renvoie une liste vide de sectionsRedigees si aucune section n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.sectionsRedigees).toEqual([]);
  });
});

describe("construirePlanExport — bpu", () => {
  it("renvoie bpu à null si aucune section BPU n'existe", () => {
    const appelOffres = creerAppelOffres();

    const plan = construirePlanExport(appelOffres, [], {}, [], new Date("2026-09-10T12:00:00Z"));

    expect(plan.bpu).toBeNull();
  });

  it("construit une section avec ses lignes et son total", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSectionBpu();
    const ligne1 = creerLigneBpu({ id: "l1", quantite: 2, prix_unitaire: 1000 });
    const ligne2 = creerLigneBpu({ id: "l2", quantite: 3, prix_unitaire: 2000 });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
      [section],
      { [section.id]: [ligne1, ligne2] },
    );

    expect(plan.bpu).toEqual({
      sections: [
        {
          titre: "Installation de chantier",
          lignes: [
            {
              codeArticle: null,
              designation: "Amenée et repli du matériel",
              unite: "Ens",
              quantite: 2,
              prixUnitaire: 1000,
              montant: 2000,
            },
            {
              codeArticle: null,
              designation: "Amenée et repli du matériel",
              unite: "Ens",
              quantite: 3,
              prixUnitaire: 2000,
              montant: 6000,
            },
          ],
          totalSection: 8000,
        },
      ],
      totalGeneral: 8000,
    });
  });

  it("inclut une ligne non chiffrée avec montant null, exclue du total", () => {
    const appelOffres = creerAppelOffres();
    const section = creerSectionBpu();
    const ligneChiffree = creerLigneBpu({ id: "l1", quantite: 2, prix_unitaire: 1000 });
    const ligneNonChiffree = creerLigneBpu({ id: "l2", quantite: 5, prix_unitaire: null });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
      [section],
      { [section.id]: [ligneChiffree, ligneNonChiffree] },
    );

    expect(plan.bpu?.sections[0].lignes[1]).toEqual({
      codeArticle: null,
      designation: "Amenée et repli du matériel",
      unite: "Ens",
      quantite: 5,
      prixUnitaire: null,
      montant: null,
    });
    expect(plan.bpu?.sections[0].totalSection).toBe(2000);
  });

  it("calcule le total général comme la somme des totaux de section", () => {
    const appelOffres = creerAppelOffres();
    const section1 = creerSectionBpu({ id: "s1", titre: "Section 1" });
    const section2 = creerSectionBpu({ id: "s2", titre: "Section 2" });
    const ligne1 = creerLigneBpu({ id: "l1", section_bpu_id: "s1", quantite: 1, prix_unitaire: 1000 });
    const ligne2 = creerLigneBpu({ id: "l2", section_bpu_id: "s2", quantite: 1, prix_unitaire: 3000 });

    const plan = construirePlanExport(
      appelOffres,
      [],
      {},
      [],
      new Date("2026-09-10T12:00:00Z"),
      [section1, section2],
      { s1: [ligne1], s2: [ligne2] },
    );

    expect(plan.bpu?.totalGeneral).toBe(4000);
  });
});
