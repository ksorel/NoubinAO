import { describe, expect, it } from "vitest";
import {
  televerserDaoSchema,
  televerserModeleCvSchema,
  modifierAppelOffresSchema,
  demarrerTeleversementDaoSchema,
  modifierStatutPipelineSchema,
  modifierResultatAoSchema,
  mettreAJourGoNoGoSchema,
  mettreAJourReponseGoNoGoSchema,
  typeMarcheGoNoGoSchema,
  questionGoNoGoSchema,
  modifierQuestionGoNoGoSchema,
  parametresGoNoGoSchema,
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

const UUID_VALIDE = "11111111-1111-4111-8111-111111111111";

function champsGoNoGo(surcharge: Record<string, unknown> = {}) {
  return {
    typeMarcheId: null,
    montantMarcheEstime: null,
    coutTotalRealisation: null,
    prixDao: null,
    cautionSoumission: null,
    fraisPreparation: null,
    avancePourcentage: null,
    delaiPaiementJours: null,
    argentDisponibleBanque: null,
    noteInteretStrategique: null,
    noteClientPaie: null,
    noteConcurrence: null,
    noteRisques: null,
    commentaireGlobal: null,
    ...surcharge,
  };
}

describe("mettreAJourGoNoGoSchema", () => {
  it("accepte une fiche entièrement vide (saisie progressive)", () => {
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo());
    expect(resultat.success).toBe(true);
  });

  it("accepte des montants et notes valides", () => {
    const resultat = mettreAJourGoNoGoSchema.safeParse(
      champsGoNoGo({
        typeMarcheId: UUID_VALIDE,
        montantMarcheEstime: "50000000",
        coutTotalRealisation: "40000000.5",
        delaiPaiementJours: "90",
        noteInteretStrategique: "4",
        noteConcurrence: "2",
      }),
    );
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.montantMarcheEstime).toBe(50000000);
      expect(resultat.data.coutTotalRealisation).toBe(40000000.5);
      expect(resultat.data.delaiPaiementJours).toBe(90);
    }
  });

  it("rejette un montant négatif", () => {
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo({ montantMarcheEstime: "-500" }));
    expect(resultat.success).toBe(false);
  });

  it("rejette la notation scientifique comme montant", () => {
    // "1e5" donne un nombre fini positif une fois converti par Number() :
    // seule la vérification du format de la chaîne source l'écarte.
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo({ montantMarcheEstime: "1e5" }));
    expect(resultat.success).toBe(false);
  });

  it("rejette un pourcentage d'avance hors de 0-100", () => {
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo({ avancePourcentage: "150" }));
    expect(resultat.success).toBe(false);
  });

  it("convertit le pourcentage d'avance saisi en UI en fraction", () => {
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo({ avancePourcentage: "15" }));
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.avancePourcentage).toBe(0.15);
  });

  it("rejette un délai de paiement non entier", () => {
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo({ delaiPaiementJours: "90.5" }));
    expect(resultat.success).toBe(false);
  });

  it("rejette une note au-dessus de son barème", () => {
    // noteConcurrence est plafonnée à 2, pas au 4 de noteInteretStrategique.
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo({ noteConcurrence: "3" }));
    expect(resultat.success).toBe(false);
  });

  it("rejette un type de marché qui n'est pas un uuid", () => {
    const resultat = mettreAJourGoNoGoSchema.safeParse(champsGoNoGo({ typeMarcheId: "btp" }));
    expect(resultat.success).toBe(false);
  });
});

describe("mettreAJourReponseGoNoGoSchema", () => {
  it("accepte une réponse valide avec commentaire", () => {
    const resultat = mettreAJourReponseGoNoGoSchema.safeParse({
      questionId: UUID_VALIDE,
      reponse: "oui",
      commentaire: "Agrément BTP catégorie 3 en cours de validité",
    });
    expect(resultat.success).toBe(true);
  });

  it("normalise un commentaire vide en null", () => {
    const resultat = mettreAJourReponseGoNoGoSchema.safeParse({
      questionId: UUID_VALIDE,
      reponse: "a_confirmer",
      commentaire: "   ",
    });
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.commentaire).toBeNull();
  });

  it("rejette une réponse hors de la liste", () => {
    const resultat = mettreAJourReponseGoNoGoSchema.safeParse({
      questionId: UUID_VALIDE,
      reponse: "peut_etre",
      commentaire: null,
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un identifiant de question qui n'est pas un uuid", () => {
    const resultat = mettreAJourReponseGoNoGoSchema.safeParse({
      questionId: "question-1",
      reponse: "non",
      commentaire: null,
    });
    expect(resultat.success).toBe(false);
  });
});

describe("typeMarcheGoNoGoSchema", () => {
  it("accepte un nom valide et le normalise", () => {
    const resultat = typeMarcheGoNoGoSchema.safeParse({ nom: "  BTP / Travaux  " });
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.nom).toBe("BTP / Travaux");
  });

  it("rejette un nom vide ou réduit à des espaces", () => {
    expect(typeMarcheGoNoGoSchema.safeParse({ nom: "" }).success).toBe(false);
    expect(typeMarcheGoNoGoSchema.safeParse({ nom: "   " }).success).toBe(false);
  });

  it("rejette un nom de plus de 100 caractères", () => {
    const resultat = typeMarcheGoNoGoSchema.safeParse({ nom: "a".repeat(101) });
    expect(resultat.success).toBe(false);
  });
});

describe("questionGoNoGoSchema", () => {
  it("accepte une question savoir-faire liée à un type de marché", () => {
    const resultat = questionGoNoGoSchema.safeParse({
      categorie: "savoir_faire",
      typeMarcheId: UUID_VALIDE,
      texte: "Avons-nous le matériel minimum demandé ?",
    });
    expect(resultat.success).toBe(true);
  });

  it("accepte une question administrative sans type de marché", () => {
    const resultat = questionGoNoGoSchema.safeParse({
      categorie: "administratif",
      typeMarcheId: null,
      texte: "Nos attestations sont-elles à jour ?",
    });
    expect(resultat.success).toBe(true);
  });

  it("rejette une question savoir-faire sans type de marché", () => {
    const resultat = questionGoNoGoSchema.safeParse({
      categorie: "savoir_faire",
      typeMarcheId: null,
      texte: "Avons-nous le personnel clé demandé ?",
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette une question administrative rattachée à un type de marché", () => {
    const resultat = questionGoNoGoSchema.safeParse({
      categorie: "administratif",
      typeMarcheId: UUID_VALIDE,
      texte: "Nos attestations sont-elles à jour ?",
    });
    expect(resultat.success).toBe(false);
  });

  it("rejette un texte vide ou de plus de 500 caractères", () => {
    const base = { categorie: "ouverture_marche" as const, typeMarcheId: null };
    expect(questionGoNoGoSchema.safeParse({ ...base, texte: "   " }).success).toBe(false);
    expect(questionGoNoGoSchema.safeParse({ ...base, texte: "a".repeat(501) }).success).toBe(false);
  });
});

describe("modifierQuestionGoNoGoSchema", () => {
  it("accepte un texte valide et le normalise", () => {
    const resultat = modifierQuestionGoNoGoSchema.safeParse({ texte: "  Texte reformulé ?  " });
    expect(resultat.success).toBe(true);
    if (resultat.success) expect(resultat.data.texte).toBe("Texte reformulé ?");
  });

  it("rejette un texte vide ou de plus de 500 caractères", () => {
    expect(modifierQuestionGoNoGoSchema.safeParse({ texte: "   " }).success).toBe(false);
    expect(modifierQuestionGoNoGoSchema.safeParse({ texte: "a".repeat(501) }).success).toBe(false);
  });
});

describe("parametresGoNoGoSchema", () => {
  it("convertit la marge saisie en pourcentage en fraction", () => {
    const resultat = parametresGoNoGoSchema.safeParse({ noteMinGo: "14", margeMinVisee: "20" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.noteMinGo).toBe(14);
      expect(resultat.data.margeMinVisee).toBe(0.2);
    }
  });

  it("rejette une note minimale hors de 0-20", () => {
    const resultat = parametresGoNoGoSchema.safeParse({ noteMinGo: "21", margeMinVisee: "15" });
    expect(resultat.success).toBe(false);
  });

  it("rejette une marge hors de 0-100", () => {
    const resultat = parametresGoNoGoSchema.safeParse({ noteMinGo: "14", margeMinVisee: "150" });
    expect(resultat.success).toBe(false);
  });

  it("rejette une valeur négative ou non numérique", () => {
    expect(parametresGoNoGoSchema.safeParse({ noteMinGo: "-1", margeMinVisee: "15" }).success).toBe(false);
    expect(parametresGoNoGoSchema.safeParse({ noteMinGo: "quatorze", margeMinVisee: "15" }).success).toBe(false);
  });
});

describe("modifierAppelOffresSchema — profil procédure × canal × acheteur", () => {
  const BASE = {
    titre: null,
    acheteur: null,
    secteur: null,
    dateLimite: null,
    montantCaution: null,
  };

  it("accepte une valeur valide pour chacun des trois champs", () => {
    const resultat = modifierAppelOffresSchema.safeParse({
      ...BASE,
      typeAcheteur: "entreprise_publique",
      procedureMarche: "procedure_simplifiee",
      canalDepot: "sigomap",
    });

    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.typeAcheteur).toBe("entreprise_publique");
      expect(resultat.data.procedureMarche).toBe("procedure_simplifiee");
      expect(resultat.data.canalDepot).toBe("sigomap");
    }
  });

  it("convertit la sentinel '_non_renseigne' (option vide du <select>) en null", () => {
    const resultat = modifierAppelOffresSchema.safeParse({
      ...BASE,
      typeAcheteur: "_non_renseigne",
      procedureMarche: "_non_renseigne",
      canalDepot: "_non_renseigne",
    });

    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.typeAcheteur).toBeNull();
      expect(resultat.data.procedureMarche).toBeNull();
      expect(resultat.data.canalDepot).toBeNull();
    }
  });

  it("accepte null directement (appel hors formulaire)", () => {
    const resultat = modifierAppelOffresSchema.safeParse({
      ...BASE,
      typeAcheteur: null,
      procedureMarche: null,
      canalDepot: null,
    });

    expect(resultat.success).toBe(true);
  });

  it("rejette une valeur hors énumération", () => {
    const resultat = modifierAppelOffresSchema.safeParse({
      ...BASE,
      typeAcheteur: "invalide",
      procedureMarche: null,
      canalDepot: null,
    });

    expect(resultat.success).toBe(false);
  });
});
