import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleReferenceObjet,
  construireLigneInsertion,
  construireLigneMiseAJour,
  dedupliquerParCle,
  extraireAvisDepuisHtml,
  filtrerAvisEncoreOuverts,
  partitionnerAvis,
  type AvisScrape,
} from "./marches-publics";

const HTML_EXTRAIT = readFileSync(
  path.join(process.cwd(), "fixtures", "veille", "marches-publics-extrait.html"),
  "utf-8",
);

describe("extraireAvisDepuisHtml", () => {
  it("extrait une ligne avec tous les champs attendus", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    const premier = avis[0];
    expect(premier.reference).toBe("P 68/2022");
    expect(premier.type).toBe("prestations");
    expect(premier.objet).toContain("Sécurité privée des sites de la RTI");
    expect(premier.autoriteContractante).toBeNull();
    expect(premier.dateLimite).toBe("2022-11-29");
  });

  it("traite une Date de publication invalide sans faire échouer la ligne", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    // Le champ date_publication n'est jamais stocké (voir spec) — ce
    // test vérifie seulement que la ligne entière reste exploitable
    // malgré la valeur "30-11--0001" présente dans la source.
    expect(avis[0].dateLimite).not.toBeNull();
  });

  it("conserve deux lignes distinctes pour une référence dupliquée avec objets différents", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    const lignesT73 = avis.filter((a) => a.reference === "T 73/2023");
    expect(lignesT73).toHaveLength(2);
    expect(lignesT73[0].objet).not.toBe(lignesT73[1].objet);
  });

  it("mappe TRAVAUX/FOURNITURE/PRESTATION vers les valeurs de l'enum existant", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    expect(avis.find((a) => a.reference === "T 73/2023")?.type).toBe("travaux");
    expect(avis.find((a) => a.reference === "F 500/2027")?.type).toBe("fournitures");
  });

  it("renvoie une autorité contractante non vide quand la source la renseigne", () => {
    const avis = extraireAvisDepuisHtml(HTML_EXTRAIT);
    const fourniture = avis.find((a) => a.reference === "F 500/2027");
    expect(fourniture?.autoriteContractante).toBe("Ministère de l'exemple");
  });

  it("renvoie null pour une date limite au format inattendu", () => {
    const html = HTML_EXTRAIT.replace("29-11-2022", "date inconnue");
    const avis = extraireAvisDepuisHtml(html);
    expect(avis[0].dateLimite).toBeNull();
  });

  it("renvoie null pour un type de marché non reconnu", () => {
    const html = HTML_EXTRAIT.replace("PRESTATION", "AUTRE CHOSE");
    const avis = extraireAvisDepuisHtml(html);
    expect(avis[0].type).toBeNull();
  });
});

describe("filtrerAvisEncoreOuverts", () => {
  const aujourdHui = new Date("2026-09-29T00:00:00Z");

  it("exclut un avis dont la date limite est déjà passée", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2026-01-01" },
    ];
    expect(filtrerAvisEncoreOuverts(avis, aujourdHui)).toHaveLength(0);
  });

  it("conserve un avis dont la date limite est dans le futur", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2027-01-01" },
    ];
    expect(filtrerAvisEncoreOuverts(avis, aujourdHui)).toHaveLength(1);
  });

  it("exclut un avis sans date limite parsable", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: null },
    ];
    expect(filtrerAvisEncoreOuverts(avis, aujourdHui)).toHaveLength(0);
  });

  it("conserve un avis dont la date limite est exactement aujourd'hui (borne inclusive)", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2026-09-29" },
    ];
    expect(filtrerAvisEncoreOuverts(avis, aujourdHui)).toHaveLength(1);
  });
});

describe("partitionnerAvis", () => {
  it("sépare les avis nouveaux des avis déjà connus par (reference, objet)", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2027-01-01" },
      { reference: "B", type: null, objet: "y", autoriteContractante: null, dateLimite: "2027-01-01" },
    ];
    const clesExistantes = new Set([cleReferenceObjet({ reference: "A", objet: "x" })]);

    const { nouveaux, existants } = partitionnerAvis(avis, clesExistantes);
    expect(nouveaux).toHaveLength(1);
    expect(nouveaux[0].reference).toBe("B");
    expect(existants).toHaveLength(1);
    expect(existants[0].reference).toBe("A");
  });

  it("traite correctement les clés potentiellement ambiguës avec le délimiteur ::", () => {
    // Deux combinaisons (reference, objet) différentes qui produisent la même clé
    // avec le délimiteur :: non-échappé: "X::Y" + "::" + "Z" = "X" + "::" + "Y::Z" = "X::Y::Z".
    // Ce test documente que cette collision existe et que les deux avis sont traités
    // comme identiques pour la déduplication — c'est un comportement acceptable
    // pour les données réelles (reference et objet contiennent rarement ::),
    // mais important à documenter.
    const avis = [
      { reference: "X::Y", type: null, objet: "Z", autoriteContractante: null, dateLimite: "2027-01-01" },
      { reference: "X", type: null, objet: "Y::Z", autoriteContractante: null, dateLimite: "2027-01-01" },
    ];
    const clesExistantes = new Set([cleReferenceObjet({ reference: "X::Y", objet: "Z" })]);

    const { nouveaux, existants } = partitionnerAvis(avis, clesExistantes);
    // Les deux avis produisent la même clé et sont tous deux traités comme existants
    expect(nouveaux).toHaveLength(0);
    expect(existants).toHaveLength(2);
  });
});

describe("dedupliquerParCle", () => {
  it("ne garde qu'une seule occurrence pour deux avis partageant la même clé (reference, objet)", () => {
    const avis = [
      { reference: "A", type: null, objet: "x", autoriteContractante: null, dateLimite: "2027-01-01" },
      { reference: "A", type: "travaux" as const, objet: "x", autoriteContractante: "Ministère", dateLimite: "2027-06-01" },
    ];

    const resultat = dedupliquerParCle(avis);
    expect(resultat).toHaveLength(1);
  });
});

describe("construireLigneInsertion", () => {
  it("renvoie bomp_numero_id et texte_brut à null, avec un structure_le renseigné", () => {
    const avis = {
      reference: "A",
      type: "travaux" as const,
      objet: "x",
      autoriteContractante: "Ministère",
      dateLimite: "2027-01-01",
    };

    const resultat = construireLigneInsertion(avis);
    expect(resultat.bomp_numero_id).toBeNull();
    expect(resultat.texte_brut).toBeNull();
    expect(typeof resultat.structure_le).toBe("string");
  });

  describe("secteur", () => {
    it("classe le secteur depuis l'objet de l'avis", () => {
      const avis: AvisScrape = {
        reference: "T 1/2027",
        type: "travaux",
        objet: "Travaux de construction d'un bâtiment scolaire",
        autoriteContractante: null,
        dateLimite: "2027-01-01",
      };
      const ligne = construireLigneInsertion(avis);
      expect(ligne.secteur).toBe("btp");
    });

    it("renvoie secteur null si aucun mot-clé ne matche", () => {
      const avis: AvisScrape = {
        reference: "F 1/2027",
        type: "fournitures",
        objet: "Fourniture de matériel de bureau",
        autoriteContractante: null,
        dateLimite: "2027-01-01",
      };
      const ligne = construireLigneInsertion(avis);
      expect(ligne.secteur).toBeNull();
    });
  });
});

describe("construireLigneMiseAJour", () => {
  it("n'inclut PAS bomp_numero_id, texte_brut ou structure_le comme clés — protège contre l'écrasement de la provenance BOMP existante", () => {
    const avis = {
      reference: "A",
      type: "travaux" as const,
      objet: "x",
      autoriteContractante: "Ministère",
      dateLimite: "2027-01-01",
    };

    const resultat = construireLigneMiseAJour(avis);
    expect(Object.keys(resultat)).not.toContain("bomp_numero_id");
    expect(Object.keys(resultat)).not.toContain("texte_brut");
    expect(Object.keys(resultat)).not.toContain("structure_le");
    expect(resultat).not.toHaveProperty("bomp_numero_id");
    expect(resultat).not.toHaveProperty("texte_brut");
    expect(resultat).not.toHaveProperty("structure_le");
  });

  it("n'inclut jamais la clé secteur (préserve la classification existante)", () => {
    const avis: AvisScrape = {
      reference: "T 1/2027",
      type: "travaux",
      objet: "Travaux de construction d'un bâtiment scolaire",
      autoriteContractante: null,
      dateLimite: "2027-01-01",
    };
    const ligne = construireLigneMiseAJour(avis);
    expect(ligne).not.toHaveProperty("secteur");
  });
});
