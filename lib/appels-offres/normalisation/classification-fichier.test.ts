import { describe, expect, it } from "vitest";
import {
  classifierTypeFichierDao,
  assemblerDaoMarkdown,
  type FichierClasse,
} from "./classification-fichier";

describe("classifierTypeFichierDao", () => {
  it("classe un texte contenant 'Avis d'Appel d'Offres' en aao", () => {
    expect(classifierTypeFichierDao("## Avis d'Appel d'Offres\nContenu.")).toBe("aao");
  });

  it("reconnaît la variante d'apostrophe typographique", () => {
    expect(classifierTypeFichierDao("Avis d'Appel d'Offres")).toBe("aao");
  });

  it("classe un texte contenant 'Instructions aux soumissionnaires' en is", () => {
    expect(classifierTypeFichierDao("Instructions aux Soumissionnaires\nArticle 1.")).toBe("is");
  });

  it("classe un texte contenant 'Instructions aux candidats' en is", () => {
    expect(classifierTypeFichierDao("Instructions aux Candidats")).toBe("is");
  });

  it("classe un texte contenant 'Données particulières' en dpao", () => {
    expect(classifierTypeFichierDao("Données Particulières de l'Appel d'Offres")).toBe("dpao");
  });

  it("classe un texte contenant 'Cahier des clauses administratives générales' en ccag", () => {
    expect(classifierTypeFichierDao("Cahier des Clauses Administratives Générales")).toBe("ccag");
  });

  it("classe un texte contenant 'Cahier des clauses administratives particulières' en ccap", () => {
    expect(classifierTypeFichierDao("Cahier des Clauses Administratives Particulières")).toBe(
      "ccap",
    );
  });

  it("classe un texte contenant 'Bordereau des prix' en bpu", () => {
    expect(classifierTypeFichierDao("Bordereau des Prix Unitaires")).toBe("bpu");
  });

  it("classe un texte contenant 'Devis quantitatif' en bpu", () => {
    expect(classifierTypeFichierDao("Devis Quantitatif et Estimatif")).toBe("bpu");
  });

  it("classe en aao un texte contenant tous les mots-clés (cas du fichier unique)", () => {
    const texteComplet = [
      "Avis d'Appel d'Offres",
      "Instructions aux Soumissionnaires",
      "Données Particulières de l'Appel d'Offres",
      "Cahier des Clauses Administratives Générales",
      "Cahier des Clauses Administratives Particulières",
    ].join("\n\n");
    expect(classifierTypeFichierDao(texteComplet)).toBe("aao");
  });

  it("classe non_classe un texte sans aucun mot-clé connu", () => {
    expect(classifierTypeFichierDao("Ceci est un document quelconque sans titre reconnu.")).toBe(
      "non_classe",
    );
  });
});

function creerFichierClasse(type: FichierClasse["type"], markdown: string): FichierClasse {
  return { type, markdown };
}

describe("assemblerDaoMarkdown", () => {
  it("concatène dans l'ordre canonique, indépendamment de l'ordre d'entrée", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("dpao", "Contenu DPAO"),
      creerFichierClasse("aao", "Contenu AAO"),
      creerFichierClasse("is", "Contenu IS"),
    ]);
    const indexAao = resultat.indexOf("Contenu AAO");
    const indexIs = resultat.indexOf("Contenu IS");
    const indexDpao = resultat.indexOf("Contenu DPAO");
    expect(indexAao).toBeGreaterThanOrEqual(0);
    expect(indexAao).toBeLessThan(indexIs);
    expect(indexIs).toBeLessThan(indexDpao);
  });

  it("concatène deux fichiers de la même catégorie dans leur ordre d'apparition", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("dpao", "Partie 1"),
      creerFichierClasse("dpao", "Partie 2"),
    ]);
    expect(resultat.indexOf("Partie 1")).toBeLessThan(resultat.indexOf("Partie 2"));
  });

  it("exclut les fichiers classés bpu", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("aao", "Contenu AAO"),
      creerFichierClasse("bpu", "Contenu BPU"),
    ]);
    expect(resultat).not.toContain("Contenu BPU");
  });

  it("exclut les fichiers classés non_classe", () => {
    const resultat = assemblerDaoMarkdown([
      creerFichierClasse("aao", "Contenu AAO"),
      creerFichierClasse("non_classe", "Contenu inconnu"),
    ]);
    expect(resultat).not.toContain("Contenu inconnu");
  });

  it("retourne une chaîne vide si aucun fichier n'est dans une catégorie canonique", () => {
    const resultat = assemblerDaoMarkdown([creerFichierClasse("bpu", "Contenu BPU")]);
    expect(resultat).toBe("");
  });

  it("retourne une chaîne vide pour un tableau vide", () => {
    expect(assemblerDaoMarkdown([])).toBe("");
  });
});
