import { describe, expect, it } from "vitest";
import {
  calculerControleExhaustivite,
  calculerControleValidite,
  calculerControleSaisie,
  calculerControleIdentite,
  calculerControleEngagements,
  calculerControleTechnique,
  calculerControleReferences,
} from "./controle-croise";
import type {
  ArticleDao,
  ArticleProduit,
  ConformiteForcee,
  ExigenceAo,
  LigneSpecification,
  Produit,
  ReferenceProjet,
  SpecificationProduit,
} from "./types";
import type { Document } from "@/lib/documents/types";

function creerDocument(overrides: Partial<Document> = {}): Document {
  return {
    id: "doc-1",
    entreprise_id: "ent-1",
    type: "piece_administrative",
    nom: "RCCM",
    fichier_path: "ent-1/documents/doc-1.pdf",
    fichier_nom_original: "RCCM.pdf",
    mime_type: "application/pdf",
    taille_octets: 1024,
    date_expiration: null,
    contenu_markdown: null,
    source_ocr: false,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function creerExigence(overrides: Partial<ExigenceAo> = {}): ExigenceAo {
  return {
    id: "exigence-1",
    appel_offres_id: "ao-1",
    type_exigence: "piece_requise",
    libelle: "RCCM",
    description: null,
    ponderation: null,
    source_section: "DPAO",
    categorie_exigence: "formelle",
    note_simulee: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const UN_DOCUMENT = [{ id: "doc-1" } as Document];

describe("calculerControleExhaustivite", () => {
  it("EXH-01 et EXH-02 ok quand toutes les pièces sont fournies et le BPU entièrement chiffré", () => {
    const exigences = [creerExigence({ id: "e1" }), creerExigence({ id: "e2" })];
    const documentsParExigence = { e1: UN_DOCUMENT, e2: UN_DOCUMENT };
    const lignesBpu = [{ quantite: 1, prix_unitaire: 1000 }, { quantite: 1, prix_unitaire: 2000 }];

    const resultats = calculerControleExhaustivite(exigences, documentsParExigence, lignesBpu);

    expect(resultats.find((r) => r.id === "EXH-01")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "EXH-02")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("EXH-01 signale les lignes du BPU sans prix unitaire", () => {
    const lignesBpu = [
      { quantite: 1, prix_unitaire: 1000 },
      { quantite: 1, prix_unitaire: null },
      { quantite: 1, prix_unitaire: null },
    ];

    const resultats = calculerControleExhaustivite([], {}, lignesBpu);

    expect(resultats.find((r) => r.id === "EXH-01")).toMatchObject({
      ok: false,
      nombre: 2,
      severite: "bloquante",
    });
  });

  it("EXH-02 signale les pièces requises sans document associé", () => {
    const exigences = [
      creerExigence({ id: "e1" }),
      creerExigence({ id: "e2" }),
      // Un critère d'évaluation ne doit jamais compter comme pièce manquante.
      creerExigence({ id: "e3", type_exigence: "critere_evaluation" }),
    ];
    const documentsParExigence = { e1: UN_DOCUMENT };

    const resultats = calculerControleExhaustivite(exigences, documentsParExigence, []);

    expect(resultats.find((r) => r.id === "EXH-02")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("EXH-01 ok trivialement quand le BPU n'a aucune ligne", () => {
    const resultats = calculerControleExhaustivite([], {}, []);

    expect(resultats.find((r) => r.id === "EXH-01")).toMatchObject({ ok: true, nombre: 0 });
  });
});

describe("calculerControleValidite", () => {
  const dateDepot = new Date("2026-11-03T12:00:00Z");

  it("VAL-01 ok quand aucune pièce n'expire avant la date de dépôt", () => {
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", date_expiration: "2026-12-01T00:00:00Z" })],
      e2: [creerDocument({ id: "d2", date_expiration: null })],
    };

    const resultats = calculerControleValidite(documentsParExigence, dateDepot);

    expect(resultats.find((r) => r.id === "VAL-01")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("VAL-01 signale une pièce qui expirera avant le dépôt, même si valide aujourd'hui", () => {
    // Cas réel que la checklist existante (checklist.ts, comparaison à
    // "maintenant") ne détecte pas : un document valide aujourd'hui mais
    // dont l'expiration tombe avant la date de dépôt de l'offre.
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", date_expiration: "2026-10-30T00:00:00Z" })],
    };

    const resultats = calculerControleValidite(documentsParExigence, dateDepot);

    expect(resultats.find((r) => r.id === "VAL-01")).toMatchObject({
      ok: false,
      nombre: 1,
      severite: "bloquante",
    });
  });

  it("VAL-01 ne compte pas deux fois un même document associé à plusieurs exigences", () => {
    const documentPerime = creerDocument({ id: "d1", date_expiration: "2026-10-30T00:00:00Z" });
    const documentsParExigence = {
      e1: [documentPerime],
      e2: [documentPerime],
    };

    const resultats = calculerControleValidite(documentsParExigence, dateDepot);

    expect(resultats.find((r) => r.id === "VAL-01")).toMatchObject({ nombre: 1 });
  });
});

describe("calculerControleSaisie", () => {
  it("ok quand aucun document ni section ne contient de texte d'exemple ou de note interne", () => {
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", contenu_markdown: "RCCM n°CI-ABJ-2012-B-1234." })],
    };
    const sections = [{ contenu: "La méthodologie proposée s'appuie sur une équipe dédiée." }];

    const resultats = calculerControleSaisie(documentsParExigence, sections);

    expect(resultats.find((r) => r.id === "SAI-01")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "SAI-02")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("SAI-01 détecte un texte d'exemple oublié dans un document de bibliothèque", () => {
    // Cas réel du dossier pilote : "(insérer les numéros et date d'émission…)"
    const documentsParExigence = {
      e1: [
        creerDocument({
          id: "d1",
          contenu_markdown: "Référence du marché : (insérer les numéros et date d'émission…)",
        }),
      ],
    };

    const resultats = calculerControleSaisie(documentsParExigence, []);

    expect(resultats.find((r) => r.id === "SAI-01")).toMatchObject({
      ok: false,
      nombre: 1,
      severite: "bloquante",
    });
  });

  it("SAI-01 détecte une ligne à blanc non remplie, sans se déclencher sur une ellipse normale", () => {
    const documentsAvecBlanc = {
      e1: [creerDocument({ id: "d1", contenu_markdown: "Montant : ………………" })],
    };
    const sectionsAvecEllipseNormale = [
      { contenu: "Le soumissionnaire s'engage à respecter le délai..." },
    ];

    expect(
      calculerControleSaisie(documentsAvecBlanc, []).find((r) => r.id === "SAI-01"),
    ).toMatchObject({ ok: false, nombre: 1 });
    expect(
      calculerControleSaisie({}, sectionsAvecEllipseNormale).find((r) => r.id === "SAI-01"),
    ).toMatchObject({ ok: true, nombre: 0 });
  });

  it("SAI-02 détecte une note interne oubliée dans une section rédigée", () => {
    // Cas réel du dossier pilote : "OPTION (Section III…)"
    const sections = [{ contenu: "Libellé du poste OPTION (Section III, à retirer si non applicable)" }];

    const resultats = calculerControleSaisie({}, sections);

    expect(resultats.find((r) => r.id === "SAI-02")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("ne scanne que documentsParExigence et sections, pas documentsParSection", () => {
    // documentsParSection n'est délibérément pas un paramètre de la fonction :
    // c'est du matériel source pour la rédaction assistée, jamais exporté
    // tel quel dans le dossier final - un texte d'exemple qui y traîne ne
    // doit pas remonter comme un faux signal sur le dossier lui-même.
    const resultats = calculerControleSaisie({}, []);

    expect(resultats.find((r) => r.id === "SAI-01")).toMatchObject({ ok: true, nombre: 0 });
  });
});

describe("calculerControleIdentite", () => {
  it("IDN-01 ok quand une seule adresse e-mail apparaît dans tout le dossier", () => {
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", contenu_markdown: "Contact : contact@aet-ingenierie.ci" })],
    };
    const sections = [{ contenu: "Pour toute question : contact@aet-ingenierie.ci" }];

    const resultats = calculerControleIdentite(documentsParExigence, sections);

    expect(resultats.find((r) => r.id === "IDN-01")).toMatchObject({
      ok: true,
      nombre: 0,
      severite: "avertissement",
    });
  });

  it("IDN-01 ok trivialement quand aucune adresse e-mail n'apparaît", () => {
    const resultats = calculerControleIdentite({}, [{ contenu: "Aucune adresse ici." }]);

    expect(resultats.find((r) => r.id === "IDN-01")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("IDN-01 détecte plusieurs adresses e-mail différentes (cas réel : 3 e-mails)", () => {
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", contenu_markdown: "alynimosarl@gmail.com" })],
      e2: [creerDocument({ id: "d2", contenu_markdown: "alynimo@ymail.com" })],
    };
    const sections = [{ contenu: "Contact direct : alynimo@gmail.com" }];

    const resultats = calculerControleIdentite(documentsParExigence, sections);

    expect(resultats.find((r) => r.id === "IDN-01")).toMatchObject({ ok: false, nombre: 3 });
  });

  it("IDN-01 n'est pas sensible à la casse pour distinguer deux adresses identiques", () => {
    const documentsParExigence = {
      e1: [creerDocument({ id: "d1", contenu_markdown: "Contact@AET-Ingenierie.ci" })],
      e2: [creerDocument({ id: "d2", contenu_markdown: "contact@aet-ingenierie.ci" })],
    };

    const resultats = calculerControleIdentite(documentsParExigence, []);

    expect(resultats.find((r) => r.id === "IDN-01")).toMatchObject({ ok: true, nombre: 0 });
  });
});

function creerEngagements(
  overrides: Partial<{
    delai_livraison_max_jours: number | null;
    delai_livraison_propose_jours: number | null;
    garantie_exigee_jours: number | null;
    garantie_proposee_jours: number | null;
    validite_offre_jours: number | null;
    validite_offre_propose_jours: number | null;
  }> = {},
) {
  return {
    delai_livraison_max_jours: null,
    delai_livraison_propose_jours: null,
    garantie_exigee_jours: null,
    garantie_proposee_jours: null,
    validite_offre_jours: null,
    validite_offre_propose_jours: null,
    ...overrides,
  };
}

describe("calculerControleEngagements", () => {
  it("ok trivialement quand aucune des deux valeurs n'est renseignée", () => {
    const resultats = calculerControleEngagements(creerEngagements());

    expect(resultats.find((r) => r.id === "ENG-01")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "ENG-02")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "ENG-03")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("ENG-01 ok quand le délai proposé est inférieur ou égal au délai exigé", () => {
    const resultats = calculerControleEngagements(
      creerEngagements({ delai_livraison_max_jours: 30, delai_livraison_propose_jours: 30 }),
    );

    expect(resultats.find((r) => r.id === "ENG-01")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("ENG-01 signale un délai proposé supérieur au délai exigé, avec l'écart en jours", () => {
    const resultats = calculerControleEngagements(
      creerEngagements({ delai_livraison_max_jours: 30, delai_livraison_propose_jours: 45 }),
    );

    expect(resultats.find((r) => r.id === "ENG-01")).toMatchObject({
      ok: false,
      nombre: 15,
      severite: "bloquante",
    });
  });

  it("ENG-02 signale une garantie proposée inférieure à la garantie exigée (cas réel : '01 mois' au lieu de 12)", () => {
    const resultats = calculerControleEngagements(
      creerEngagements({ garantie_exigee_jours: 365, garantie_proposee_jours: 30 }),
    );

    expect(resultats.find((r) => r.id === "ENG-02")).toMatchObject({ ok: false, nombre: 335 });
  });

  it("ENG-03 ok quand la validité proposée est supérieure ou égale à la validité exigée", () => {
    const resultats = calculerControleEngagements(
      creerEngagements({ validite_offre_jours: 60, validite_offre_propose_jours: 90 }),
    );

    expect(resultats.find((r) => r.id === "ENG-03")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("ne contrôle que les paires dont les deux valeurs sont renseignées", () => {
    const resultats = calculerControleEngagements(
      creerEngagements({ delai_livraison_max_jours: 30 }), // propose encore null
    );

    expect(resultats.find((r) => r.id === "ENG-01")).toMatchObject({ ok: true, nombre: 0 });
  });
});

function creerArticle(overrides: Partial<ArticleDao> = {}): ArticleDao {
  return {
    id: "article-1",
    appel_offres_id: "ao-1",
    numero: "6.1",
    designation: "Pince ampèremétrique",
    unite: "u",
    quantite: 1,
    ligne_bpu_id: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function creerLigneSpec(overrides: Partial<LigneSpecification> = {}): LigneSpecification {
  return {
    id: "ligne-1",
    article_dao_id: "article-1",
    libelle: "Intensité nominale",
    operateur: ">=",
    valeur: "1500",
    unite: "A",
    source_section: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function creerArticleProduit(overrides: Partial<ArticleProduit> = {}): ArticleProduit {
  return {
    id: "ap-1",
    article_dao_id: "article-1",
    produit_id: "produit-1",
    retenu: true,
    justification_ko: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function creerSpecProduit(overrides: Partial<SpecificationProduit> = {}): SpecificationProduit {
  return {
    id: "spec-1",
    produit_id: "produit-1",
    libelle: "Intensité nominale",
    valeur: "1500",
    unite: "A",
    source_section: null,
    ordre: 0,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function creerProduitFixture(overrides: Partial<Produit> = {}): Produit {
  return {
    id: "produit-1",
    entreprise_id: "ent-1",
    marque: "Marque",
    modele: "Modèle",
    reference: null,
    fiche_technique_path: "ent-1/produits/produit-1-fiche.pdf",
    fiche_technique_nom_original: "fiche.pdf",
    autorisation_fabricant_path: null,
    autorisation_fabricant_nom_original: null,
    autorisation_valide_jusquau: null,
    certificat_etalonnage_path: null,
    certificat_etalonnage_nom_original: null,
    certificat_etalonnage_valide_jusquau: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("calculerControleTechnique", () => {
  const articles = [creerArticle()];

  it("tout ok quand le produit retenu est conforme et a sa fiche technique", () => {
    const resultats = calculerControleTechnique(
      articles,
      { "article-1": [creerLigneSpec()] },
      { "article-1": [creerArticleProduit()] },
      { "produit-1": [creerSpecProduit()] },
      {},
      { "produit-1": creerProduitFixture() },
    );

    expect(resultats.find((r) => r.id === "TEC-01")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "TEC-02")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "TEC-03")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("TEC-01 signale une ligne dont le statut est inconnu pour le produit retenu", () => {
    const resultats = calculerControleTechnique(
      articles,
      { "article-1": [creerLigneSpec({ libelle: "Autre caractéristique" })] },
      { "article-1": [creerArticleProduit()] },
      { "produit-1": [creerSpecProduit()] }, // libellé différent -> inconnu
      {},
      { "produit-1": creerProduitFixture() },
    );

    expect(resultats.find((r) => r.id === "TEC-01")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("TEC-02 signale un produit retenu ko sans justification écrite", () => {
    const resultats = calculerControleTechnique(
      articles,
      { "article-1": [creerLigneSpec({ valeur: "1500", unite: "A" })] },
      { "article-1": [creerArticleProduit({ justification_ko: null })] },
      { "produit-1": [creerSpecProduit({ valeur: "1000", unite: "A" })] }, // ko
      {},
      { "produit-1": creerProduitFixture() },
    );

    expect(resultats.find((r) => r.id === "TEC-02")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("TEC-02 n'est pas déclenché quand le produit ko retenu a une justification écrite", () => {
    const resultats = calculerControleTechnique(
      articles,
      { "article-1": [creerLigneSpec({ valeur: "1500", unite: "A" })] },
      { "article-1": [creerArticleProduit({ justification_ko: "Validé par le client malgré l'écart" })] },
      { "produit-1": [creerSpecProduit({ valeur: "1000", unite: "A" })] },
      {},
      { "produit-1": creerProduitFixture() },
    );

    expect(resultats.find((r) => r.id === "TEC-02")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("une dérogation forcée en ok retire la ligne du calcul TEC-02", () => {
    const conformiteForcee: Record<string, ConformiteForcee> = {
      "ligne-1:produit-1": {
        id: "cf-1",
        ligne_specification_id: "ligne-1",
        produit_id: "produit-1",
        statut: "ok",
        justification: "Vérifié manuellement",
        modifie_par: null,
        modifie_le: "2026-01-01T00:00:00Z",
      },
    };
    const resultats = calculerControleTechnique(
      articles,
      { "article-1": [creerLigneSpec({ valeur: "1500", unite: "A" })] },
      { "article-1": [creerArticleProduit({ justification_ko: null })] },
      { "produit-1": [creerSpecProduit({ valeur: "1000", unite: "A" })] },
      conformiteForcee,
      { "produit-1": creerProduitFixture() },
    );

    expect(resultats.find((r) => r.id === "TEC-02")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("TEC-03 signale un produit retenu sans fiche technique", () => {
    const resultats = calculerControleTechnique(
      articles,
      { "article-1": [creerLigneSpec()] },
      { "article-1": [creerArticleProduit()] },
      { "produit-1": [creerSpecProduit()] },
      {},
      { "produit-1": creerProduitFixture({ fiche_technique_path: null }) },
    );

    expect(resultats.find((r) => r.id === "TEC-03")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("ignore les produits comparés mais non retenus", () => {
    const resultats = calculerControleTechnique(
      articles,
      { "article-1": [creerLigneSpec({ valeur: "1500", unite: "A" })] },
      { "article-1": [creerArticleProduit({ retenu: false })] },
      { "produit-1": [creerSpecProduit({ valeur: "1000", unite: "A" })] }, // serait ko
      {},
      { "produit-1": creerProduitFixture({ fiche_technique_path: null }) },
    );

    expect(resultats.every((r) => r.ok)).toBe(true);
  });

  it("tout ok trivialement sans aucun article", () => {
    const resultats = calculerControleTechnique([], {}, {}, {}, {}, {});
    expect(resultats.every((r) => r.ok)).toBe(true);
  });
});

function creerAppelOffresReferences(appelOffres: Partial<{
  periode_references_debut: string | null;
  periode_references_fin: string | null;
  nature_references_tags: string[];
  montant_minimal_reference: number | null;
  nombre_references_exigees: number | null;
}> = {}) {
  return {
    periode_references_debut: null,
    periode_references_fin: null,
    nature_references_tags: [],
    montant_minimal_reference: null,
    nombre_references_exigees: null,
    ...appelOffres,
  };
}

function creerReference(overrides: Partial<ReferenceProjet> = {}): ReferenceProjet {
  return {
    id: "ref-1",
    entreprise_id: "ent-1",
    client_nom: "CI-ENERGIES",
    client_rccm: null,
    client_date_creation: "2010-01-01",
    client_telephone: "+225 01 00 00 00 00",
    client_email: "client@ci-energies.ci",
    client_adresse: "Abidjan",
    objet: "Fourniture d'équipements",
    nature_tags: ["energie_climat"],
    montant: 80_000_000,
    role: "principal",
    date_debut: "2022-01-01",
    date_fin: "2023-01-01",
    date_debut_origine: "2022-01-01",
    date_fin_origine: "2023-01-01",
    abe_document_id: "doc-abe-1",
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const ENTREPRISE_REF = { telephone: "+225 27 00 00 00 00", email: "contact@entreprise.ci", adresse: "Plateau" };

describe("calculerControleReferences", () => {
  it("ok quand aucun nombre exigé n'est paramétré et aucune alerte d'intégrité", () => {
    const reference = creerReference();
    const resultats = calculerControleReferences(
      creerAppelOffresReferences(),
      [{ reference_projet_id: reference.id }],
      { [reference.id]: reference },
      { [reference.id]: 1 },
      { [reference.id]: { mime_type: "application/pdf" } },
      ENTREPRISE_REF,
    );

    expect(resultats.find((r) => r.id === "REF-01")).toMatchObject({ ok: true, nombre: 0 });
    expect(resultats.find((r) => r.id === "REF-02")).toMatchObject({ ok: true, nombre: 0 });
  });

  it("REF-01 signale un manque de références recevables vs le nombre exigé", () => {
    const reference = creerReference();
    const resultats = calculerControleReferences(
      creerAppelOffresReferences({ nombre_references_exigees: 3 }),
      [{ reference_projet_id: reference.id }],
      { [reference.id]: reference },
      { [reference.id]: 1 },
      { [reference.id]: { mime_type: "application/pdf" } },
      ENTREPRISE_REF,
    );

    expect(resultats.find((r) => r.id === "REF-01")).toMatchObject({ ok: false, nombre: 2 });
  });

  it("REF-01 ne compte pas une référence sans ABE ni justificatif comme recevable", () => {
    const reference = creerReference({ abe_document_id: null });
    const resultats = calculerControleReferences(
      creerAppelOffresReferences({ nombre_references_exigees: 1 }),
      [{ reference_projet_id: reference.id }],
      { [reference.id]: reference },
      { [reference.id]: 0 },
      {},
      ENTREPRISE_REF,
    );

    expect(resultats.find((r) => r.id === "REF-01")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("REF-01 ne compte pas une référence hors période exigée", () => {
    const reference = creerReference({ date_fin: "2019-01-01" });
    const resultats = calculerControleReferences(
      creerAppelOffresReferences({
        nombre_references_exigees: 1,
        periode_references_debut: "2022-01-01",
        periode_references_fin: "2025-12-31",
      }),
      [{ reference_projet_id: reference.id }],
      { [reference.id]: reference },
      { [reference.id]: 1 },
      { [reference.id]: { mime_type: "application/pdf" } },
      ENTREPRISE_REF,
    );

    expect(resultats.find((r) => r.id === "REF-01")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("REF-02 signale une référence avec une alerte d'intégrité", () => {
    const reference = creerReference({ client_telephone: ENTREPRISE_REF.telephone });
    const resultats = calculerControleReferences(
      creerAppelOffresReferences(),
      [{ reference_projet_id: reference.id }],
      { [reference.id]: reference },
      { [reference.id]: 1 },
      { [reference.id]: { mime_type: "application/pdf" } },
      ENTREPRISE_REF,
    );

    expect(resultats.find((r) => r.id === "REF-02")).toMatchObject({ ok: false, nombre: 1 });
  });

  it("ignore les références du catalogue non retenues pour cet AO", () => {
    const resultats = calculerControleReferences(
      creerAppelOffresReferences({ nombre_references_exigees: 5 }),
      [],
      {},
      {},
      {},
      ENTREPRISE_REF,
    );

    // REF-01 signale bien le manque (0 recevable < 5 exigées) même sans
    // aucune référence retenue - seul REF-02 n'a rien à signaler.
    expect(resultats.find((r) => r.id === "REF-01")).toMatchObject({ ok: false, nombre: 5 });
    expect(resultats.find((r) => r.id === "REF-02")).toMatchObject({ ok: true, nombre: 0 });
  });
});
