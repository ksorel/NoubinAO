import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extraireAvisDepuisHtml } from "./marches-publics";

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
