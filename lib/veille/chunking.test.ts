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

  it("génère une référence de repli si le nombre de légendes ne correspond pas au nombre de blocs", () => {
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

  it("retourne un tableau vide si aucun motif ARTICLE 1 n'est trouvé", () => {
    expect(decouperEnAvis("Texte sans structure reconnue.")).toEqual([]);
  });
});
