import { describe, expect, it } from "vitest";
import { decouperEnAvis } from "./chunking";

// Fixture condensée depuis un extrait réel du BOMP n°1896 (pages 48-49) :
// deux légendes de référence groupées après le contenu ARTICLE 1-13 de DEUX
// avis consécutifs (artefact de mise en page réel, pas une simplification
// de test), avec un marqueur (suite) sur la première légende désignant un
// avis déjà entamé sur la page précédente (donc à ignorer, pas un 3e avis).
const EXTRAIT_REEL = `
ARTICLE 1 : AUTORITE CONTRACTANTE
Le présent appel d'offres est lancé par la Mairie de Ouragahio.
ARTICLE 2 : OBJET
Le présent appel d'offres a pour objet les travaux d'extension du réseau
électrique de Kpapekou.
ARTICLE 8 : REMISE DES OFFRES
Les offres seront déposées au plus tard le 23 octobre 2026 à 09 heures.
ARTICLE 13 : LEGISLATION REGISSANT LE MARCHE
Le présent appel d'offres est soumis aux lois en vigueur.
N° T 1363/2026 (suite)
TRAVAUX DE CONSTRUCTION D'UN PREAU DE REUNIONS
N° T 1364/2026
TRAVAUX D'EXTENSION DU RESEAU ELECTRIQUE DE KPAPEKOU
ARTICLE 1 : AUTORITE CONTRACTANTE
Le présent appel d'offres est lancé par la Mairie de Sandégué.
ARTICLE 2 : OBJET
Le présent appel d'offres a pour objet les travaux de construction d'un
bâtiment de 03 salles de classes au Groupe Scolaire Sandégué.
ARTICLE 13 : LEGISLATION REGISSANT LE MARCHE
Le présent appel d'offres est soumis aux lois en vigueur.
N° T 1365/2026
TRAVAUX DE CONSTRUCTION D'UN BATIMENT DE 03 SALLES DE CLASSES
`;

describe("decouperEnAvis", () => {
  it("découpe le texte en un bloc par occurrence de ARTICLE 1", () => {
    const avis = decouperEnAvis(EXTRAIT_REEL);
    expect(avis).toHaveLength(2);
  });

  it("associe la bonne référence à chaque bloc (par position, légendes (suite) ignorées)", () => {
    const avis = decouperEnAvis(EXTRAIT_REEL);
    expect(avis[0].reference).toBe("T 1364/2026");
    expect(avis[1].reference).toBe("T 1365/2026");
  });

  it("le texte brut de chaque bloc contient son propre contenu ARTICLE, pas celui du bloc voisin", () => {
    const avis = decouperEnAvis(EXTRAIT_REEL);
    expect(avis[0].texteBrut).toContain("Ouragahio");
    expect(avis[0].texteBrut).not.toContain("Sandégué");
    expect(avis[1].texteBrut).toContain("Sandégué");
    expect(avis[1].texteBrut).not.toContain("Ouragahio");
  });

  it("génère une référence de repli si aucune légende n'est trouvée", () => {
    const texteSansLegende = `
ARTICLE 1 : AUTORITE CONTRACTANTE
Le présent appel d'offres est lancé par la Mairie de Diabo.
ARTICLE 13 : LEGISLATION REGISSANT LE MARCHE
Fin.
`;
    const avis = decouperEnAvis(texteSansLegende);
    expect(avis).toHaveLength(1);
    expect(avis[0].reference).toBe("SANS-REF-1");
  });

  it("bascule TOUS les blocs en repli si une légende manque au milieu de la séquence", () => {
    // Cas réellement dangereux : la 2e légende sur 3 n'est pas reconnue
    // (pdfjs a fusionné ses deux lignes, le motif attend un saut de ligne
    // après la référence). Un appariement positionnel donnerait alors la
    // référence du 3e avis au 2e — faux mais parfaitement plausible, donc
    // invisible à la relecture. Aucun bloc ne doit garder de référence.
    const texteLegendeManquanteAuMilieu = `
ARTICLE 1 : AUTORITE CONTRACTANTE
Mairie A.
N° T 1401/2026
TRAVAUX A
ARTICLE 1 : AUTORITE CONTRACTANTE
Mairie B.
N° T 1402/2026 TRAVAUX B SUR LA MEME LIGNE
ARTICLE 1 : AUTORITE CONTRACTANTE
Mairie C.
N° T 1403/2026
TRAVAUX C
`;
    const avis = decouperEnAvis(texteLegendeManquanteAuMilieu);
    expect(avis).toHaveLength(3);
    expect(avis.map((a) => a.reference)).toEqual([
      "SANS-REF-1",
      "SANS-REF-2",
      "SANS-REF-3",
    ]);
  });

  it("bascule TOUS les blocs en repli s'il y a plus de légendes que de blocs", () => {
    // Symétrique du cas précédent : une légende parasite (ex. un renvoi
    // dans un récapitulatif) décale l'appariement dès le premier bloc.
    const texteLegendeEnTrop = `
N° T 1500/2026
RECAPITULATIF HORS PERIMETRE
ARTICLE 1 : AUTORITE CONTRACTANTE
Mairie D.
N° T 1501/2026
TRAVAUX D
`;
    const avis = decouperEnAvis(texteLegendeEnTrop);
    expect(avis).toHaveLength(1);
    expect(avis[0].reference).toBe("SANS-REF-1");
  });

  it("retourne un tableau vide si aucun motif ARTICLE 1 n'est trouvé", () => {
    expect(decouperEnAvis("Texte sans structure reconnue.")).toEqual([]);
  });

  it("tronque le dernier bloc avant la section suivante et ignore ses fausses légendes", () => {
    // Extrait fidèle (2026-09-23, BOMP n°1896 réel en production) : après le
    // dernier avis nouveau, le document enchaîne sur une section de
    // programmation dont le tableau contient sa propre colonne "N° APPELS
    // D'OFFRES" ("of 77/2026" etc.) — un format de légende proche mais qui
    // ne doit jamais être confondu avec une vraie légende d'avis, ni gonfler
    // le texteBrut du dernier avis avec des centaines de lignes hors sujet.
    const texteAvecSectionSuivante = `
ARTICLE 1 : AUTORITE CONTRACTANTE
Le présent appel d'offres est lancé par la Mairie de Diabo.
ARTICLE 13 : LEGISLATION REGISSANT LE MARCHE
Le présent appel d'offres est soumis aux lois en vigueur.
N° T 1501/2026
TRAVAUX DE CONSTRUCTION D'UN PREAU
OBJETS DES APPELS D'OFFRES
AUTORITES CONTRACTANTES
ADRESSES DE RETRAIT DES DOSSIERS ET DE
RENSEIGNEMENTS COMPLEMENTAIRES
N° APPELS
D'OFFRES
DATES ET HEURES
LIMITES DE REMISE
DES PLIS
of 77/2026
(1894)
pso
26090229524
`;
    const avis = decouperEnAvis(texteAvecSectionSuivante);
    expect(avis).toHaveLength(1);
    expect(avis[0].reference).toBe("T 1501/2026");
    expect(avis[0].texteBrut).not.toContain("OBJETS DES APPELS D'OFFRES");
    expect(avis[0].texteBrut).not.toContain("of 77/2026");
  });

  it("accepte un espace avant le slash dans la légende (les deux graphies coexistent dans le même BOMP)", () => {
    // Observé en production (2026-09-23) : "F 300 /2026" et "F 302/2026"
    // apparaissent côte à côte dans la même édition du BOMP n°1896.
    const texteEspaceAvantSlash = `
ARTICLE 1 : AUTORITE CONTRACTANTE
Mairie E.
N° F 300 /2026
FOURNITURE E
`;
    const avis = decouperEnAvis(texteEspaceAvantSlash);
    expect(avis).toHaveLength(1);
    expect(avis[0].reference).toBe("F 300/2026");
  });
});
