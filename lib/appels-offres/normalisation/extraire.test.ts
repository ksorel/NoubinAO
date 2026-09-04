import { describe, expect, it, vi } from "vitest";

const creerMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    get messages() {
      return { create: creerMock };
    }
  },
}));

import { construireContenuPertinent, extraireInformationsAo } from "./extraire";
import type { SectionMarkdown } from "./markdown";

const sections: SectionMarkdown[] = [
  { titre: "AVIS D'APPEL D'OFFRES", contenu: "Construction d'un pont, par le Ministère X." },
];

describe("extraireInformationsAo", () => {
  it("construit un prompt demandant les champs étendus (titre, acheteur, date ISO)", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            titre: null,
            acheteur: null,
            secteur: null,
            date_limite: null,
            montant_caution: null,
            sommaire_attendu: [],
            exigences: [],
          }),
        },
      ],
    });

    await extraireInformationsAo(sections);

    const promptEnvoye = creerMock.mock.calls[0][0].messages[0].content as string;
    expect(promptEnvoye).toContain("titre");
    expect(promptEnvoye).toContain("acheteur");
    expect(promptEnvoye).toContain("date_limite");
    expect(promptEnvoye).toContain("ISO 8601");
  });

  it("parse une réponse JSON valide en objet ExtractionAo", async () => {
    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            titre: "Construction d'un pont",
            acheteur: "Ministère X",
            secteur: "BTP",
            date_limite: "2026-11-03T12:00:00Z",
            montant_caution: 5000000,
            sommaire_attendu: ["Méthodologie"],
            exigences: [
              {
                type_exigence: "piece_requise",
                libelle: "RCCM",
                description: null,
                ponderation: null,
                source_section: "DPAO",
              },
            ],
          }),
        },
      ],
    });

    const resultat = await extraireInformationsAo(sections);

    expect(resultat.titre).toBe("Construction d'un pont");
    expect(resultat.exigences).toHaveLength(1);
  });

  it("propage une erreur si la réponse ne respecte pas le schéma", async () => {
    creerMock.mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ titre: 42 }) }],
    });

    await expect(extraireInformationsAo(sections)).rejects.toThrow();
  });

  it("envoie tout le contenu, y compris une section fragmentée par une fausse détection de titre", async () => {
    // Reproduit un DAO PDF réel (2026-09-03) : une phrase de réponse mise en
    // emphase ("Le présent appel d'offres a pour objet...") était détectée
    // comme un nouveau titre, fragmentant l'AAO en micro-sections orphelines
    // qu'une sélection par titre ne retrouvait plus. Puisqu'on envoie
    // désormais tout le contenu jusqu'à la borne, ce fragment reste inclus
    // quel que soit son titre.
    const sectionsFragmentees: SectionMarkdown[] = [
      { titre: "Section 0. AVIS D’APPEL D’OFFRES", contenu: "ARTICLE 1 : La Mairie de Dabou." },
      {
        titre: "Le présent appel d’offres a pour objet",
        contenu: "construction de deux salles de classes.",
      },
    ];

    creerMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            titre: null,
            acheteur: null,
            secteur: null,
            date_limite: null,
            montant_caution: null,
            sommaire_attendu: [],
            exigences: [],
          }),
        },
      ],
    });

    await extraireInformationsAo(sectionsFragmentees);

    const dernierAppel = creerMock.mock.calls.at(-1);
    const promptEnvoye = dernierAppel?.[0].messages[0].content as string;
    expect(promptEnvoye).toContain("La Mairie de Dabou");
    expect(promptEnvoye).toContain("construction de deux salles de classes");
  });
});

describe("construireContenuPertinent", () => {
  it("inclut toutes les sections quand aucune borne 'Formulaires de soumission' n'est trouvée", () => {
    const sections: SectionMarkdown[] = [
      { titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu AAO." },
      { titre: "DONNÉES PARTICULIÈRES", contenu: "Contenu DPAO." },
    ];

    const resultat = construireContenuPertinent(sections);

    expect(resultat).toContain("Contenu AAO.");
    expect(resultat).toContain("Contenu DPAO.");
  });

  it("s'arrête avant la section 'Formulaires de soumission', apostrophe typographique incluse", () => {
    const sections: SectionMarkdown[] = [
      { titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu AAO utile." },
      { titre: "Section IV. Formulaires de soumission", contenu: "Modèle de formulaire vierge." },
      { titre: "Formulaire PER-1", contenu: "Autre modèle vierge." },
    ];

    const resultat = construireContenuPertinent(sections);

    expect(resultat).toContain("Contenu AAO utile.");
    expect(resultat).not.toContain("Modèle de formulaire vierge.");
    expect(resultat).not.toContain("Autre modèle vierge.");
  });

  it("tronque le contenu au-delà de la longueur maximale de sécurité", () => {
    const contenuTresLong = "x".repeat(300000);
    const sections: SectionMarkdown[] = [{ titre: "Section unique", contenu: contenuTresLong }];

    const resultat = construireContenuPertinent(sections);

    expect(resultat.length).toBeLessThan(300000);
  });

  it("exclut la section Instructions aux Candidats, jamais porteuse de faits propres à l'AO", () => {
    // Reproduit la régression réelle du DOCX (2026-09-03) : cette section
    // fait une vingtaine de pages et gonflait le bloc continu au point de
    // repousser le DPAO/Critères au-delà du plafond de sécurité.
    const sections: SectionMarkdown[] = [
      { titre: "AVIS D'APPEL D'OFFRES", contenu: "Contenu AAO." },
      { titre: "Section I. Instructions aux Candidats", contenu: "Texte juridique standardisé." },
      { titre: "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES", contenu: "Contenu DPAO utile." },
    ];

    const resultat = construireContenuPertinent(sections);

    expect(resultat).toContain("Contenu AAO.");
    expect(resultat).toContain("Contenu DPAO utile.");
    expect(resultat).not.toContain("Texte juridique standardisé.");
  });

  it("exclut toutes les sous-sections d'Instructions aux Candidats même fragmentées sous des titres différents", () => {
    // Sur un PDF réel, cette section est parfois fragmentée en plusieurs
    // sous-titres (A. Généralités, B. Contenu du dossier...) par la
    // détection de titre — l'exclusion par plage d'index (et non par
    // correspondance de titre individuelle) doit rester efficace.
    const sections: SectionMarkdown[] = [
      { titre: "Section I. Instructions aux Candidats", contenu: "Intro." },
      { titre: "A. Généralités", contenu: "Fragment A à exclure." },
      { titre: "B. Contenu du Dossier d'appel d'offres", contenu: "Fragment B à exclure." },
      { titre: "DONNÉES PARTICULIÈRES", contenu: "Contenu DPAO." },
    ];

    const resultat = construireContenuPertinent(sections);

    expect(resultat).not.toContain("Fragment A à exclure.");
    expect(resultat).not.toContain("Fragment B à exclure.");
    expect(resultat).toContain("Contenu DPAO.");
  });
});
