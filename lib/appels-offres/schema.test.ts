import { describe, expect, it } from "vitest";
import {
  televerserDaoSchema,
  televerserModeleCvSchema,
  modifierAppelOffresSchema,
  demarrerTeleversementDaoSchema,
  modifierStatutPipelineSchema,
  modifierResultatAoSchema,
} from "./schema";
import { MIME_PDF, MIME_DOCX } from "./normalisation/normaliser";
import { MIME_DOC_LEGACY } from "../documents/normalisation";
import { RAISONS_RESULTAT_PERDU, RAISONS_RESULTAT_GAGNE } from "./types";

function creerFichier(taille: number, type: string, nom = "dao.pdf"): File {
  return new File([new Uint8Array(taille)], nom, { type });
}

describe("televerserDaoSchema", () => {
  it("accepte un PDF de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_PDF)],
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte un DOCX de taille valide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_DOCX, "dao.docx")],
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte plusieurs fichiers valides", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [
        creerFichier(1024, MIME_PDF, "aao.pdf"),
        creerFichier(1024, MIME_DOCX, "dpao.docx"),
      ],
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette un tableau vide", () => {
    const resultat = televerserDaoSchema.safeParse({ fichiers: [] });
    expect(resultat.success).toBe(false);
  });

  it("rejette si un seul fichier parmi plusieurs dépasse 20 Mo", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_PDF), creerFichier(21 * 1024 * 1024, MIME_PDF)],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un fichier de plus de 20 Mo", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(21 * 1024 * 1024, MIME_PDF)],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un fichier vide", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(0, MIME_PDF)],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un type MIME non supporté", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, "image/png")],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un .doc legacy (accepté pour le modèle de CV, pas pour le DAO)", () => {
    const resultat = televerserDaoSchema.safeParse({
      fichiers: [creerFichier(1024, MIME_DOC_LEGACY, "dao.doc")],
    });
    expect(resultat.success).toBe(false);
  });
});

describe("demarrerTeleversementDaoSchema", () => {
  it("accepte un fichier PDF", () => {
    const resultat = demarrerTeleversementDaoSchema.safeParse({
      fichiers: [{ nomOriginal: "dao.pdf", mimeType: MIME_PDF }],
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte plusieurs fichiers DOCX/PDF", () => {
    const resultat = demarrerTeleversementDaoSchema.safeParse({
      fichiers: [
        { nomOriginal: "aao.pdf", mimeType: MIME_PDF },
        { nomOriginal: "dpao.docx", mimeType: MIME_DOCX },
      ],
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette un tableau vide", () => {
    const resultat = demarrerTeleversementDaoSchema.safeParse({ fichiers: [] });
    expect(resultat.success).toBe(false);
  });

  it("rejette un type MIME non supporté", () => {
    const resultat = demarrerTeleversementDaoSchema.safeParse({
      fichiers: [{ nomOriginal: "dao.png", mimeType: "image/png" }],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un .doc legacy", () => {
    const resultat = demarrerTeleversementDaoSchema.safeParse({
      fichiers: [{ nomOriginal: "dao.doc", mimeType: MIME_DOC_LEGACY }],
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un nom de fichier vide", () => {
    const resultat = demarrerTeleversementDaoSchema.safeParse({
      fichiers: [{ nomOriginal: "", mimeType: MIME_PDF }],
    });
    expect(resultat.success).toBe(false);
  });
});

describe("televerserModeleCvSchema", () => {
  it("accepte un PDF de taille valide", () => {
    const resultat = televerserModeleCvSchema.safeParse({
      fichier: creerFichier(1024, MIME_PDF),
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte un DOCX de taille valide", () => {
    const resultat = televerserModeleCvSchema.safeParse({
      fichier: creerFichier(1024, MIME_DOCX, "modele.docx"),
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte un .doc legacy, contrairement à televerserDaoSchema", () => {
    const resultat = televerserModeleCvSchema.safeParse({
      fichier: creerFichier(1024, MIME_DOC_LEGACY, "modele.doc"),
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette un fichier de plus de 20 Mo", () => {
    const resultat = televerserModeleCvSchema.safeParse({
      fichier: creerFichier(21 * 1024 * 1024, MIME_PDF),
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un type MIME non supporté", () => {
    const resultat = televerserModeleCvSchema.safeParse({
      fichier: creerFichier(1024, "image/png"),
    });
    expect(resultat.success).toBe(false);
  });
});

function champsBase(montantCaution: string | null) {
  return { titre: null, acheteur: null, secteur: null, dateLimite: null, montantCaution };
}

describe("modifierAppelOffresSchema.montantCaution", () => {
  it("accepte un montant entier positif", () => {
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("545000"));
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.montantCaution).toBe(545000);
  });

  it("accepte une chaîne vide ou null comme absence de montant", () => {
    expect(modifierAppelOffresSchema.safeParse(champsBase(null)).success).toBe(true);
    expect(modifierAppelOffresSchema.safeParse(champsBase("")).success).toBe(true);
  });

  it("rejette un montant négatif", () => {
    // Number.isFinite(-500) est vrai : sans vérification du format de la
    // chaîne source, un montant négatif passait silencieusement.
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("-500"));
    expect(resultat.success).toBe(false);
  });

  it("rejette la notation scientifique", () => {
    // "1e10" et "10000000000" donnent le même nombre fini une fois
    // convertis par Number() — seule la chaîne source permet de les
    // distinguer.
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("1e10"));
    expect(resultat.success).toBe(false);
  });

  it("rejette un texte non numérique", () => {
    const resultat = modifierAppelOffresSchema.safeParse(champsBase("abc"));
    expect(resultat.success).toBe(false);
  });
});

describe("modifierStatutPipelineSchema", () => {
  it("accepte un statut sans raison ni note", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "perdu",
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte une raison valide pour le statut perdu", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "perdu",
      raisonResultat: "prix_trop_eleve",
      noteResultat: "Concurrent 15% moins cher",
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette une raison hors de la liste", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "perdu",
      raisonResultat: "raison_inexistante",
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette une note de plus de 2000 caractères", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "gagne",
      noteResultat: "a".repeat(2001),
    });
    expect(resultat.success).toBe(false);
  });

  it("normalise une raison null explicite", () => {
    const resultat = modifierStatutPipelineSchema.safeParse({
      statutPipeline: "gagne",
      raisonResultat: null,
      noteResultat: null,
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.raisonResultat).toBeNull();
      expect(resultat.data.noteResultat).toBeNull();
    }
  });
});

describe("modifierResultatAoSchema", () => {
  it("accepte une raison et une note valides", () => {
    const resultat = modifierResultatAoSchema.safeParse({
      raisonResultat: "references_solides",
      noteResultat: "Trois références comparables citées",
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte raison et note toutes deux null", () => {
    const resultat = modifierResultatAoSchema.safeParse({
      raisonResultat: null,
      noteResultat: null,
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette une raison hors de la liste", () => {
    const resultat = modifierResultatAoSchema.safeParse({
      raisonResultat: "pas_une_vraie_raison",
      noteResultat: null,
    });
    expect(resultat.success).toBe(false);
  });

  it("accepte toutes les valeurs des deux listes de raisons affichées en UI", () => {
    for (const raison of [...RAISONS_RESULTAT_PERDU, ...RAISONS_RESULTAT_GAGNE]) {
      const resultat = modifierResultatAoSchema.safeParse({ raisonResultat: raison, noteResultat: null });
      expect(resultat.success).toBe(true);
    }
  });
});
