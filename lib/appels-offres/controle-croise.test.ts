import { describe, expect, it } from "vitest";
import {
  calculerControleExhaustivite,
  calculerControleValidite,
  calculerControleSaisie,
  calculerControleIdentite,
  calculerControleEngagements,
} from "./controle-croise";
import type { ExigenceAo } from "./types";
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
    // tel quel dans le dossier final — un texte d'exemple qui y traîne ne
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
