import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PageTexte } from "./pdf-texte";

const execFileAsync = promisify(execFile);

export interface SectionMarkdown {
  titre: string;
  contenu: string;
}

const TITRES_CONNUS = [
  "AVIS D'APPEL D'OFFRES",
  "INSTRUCTIONS AUX SOUMISSIONNAIRES",
  "DONNÉES PARTICULIÈRES DE L'APPEL D'OFFRES",
  "CAHIER DES CLAUSES ADMINISTRATIVES GÉNÉRALES",
  "CAHIER DES CLAUSES ADMINISTRATIVES PARTICULIÈRES",
  "SOMMAIRE ATTENDU DE L'OFFRE",
];

export function structurerEnMarkdownHeuristique(pages: PageTexte[]): string {
  const morceaux: string[] = [];
  for (const page of pages) {
    let texte = page.texte;
    for (const titre of TITRES_CONNUS) {
      texte = texte.split(titre).join(`\n## ${titre}\n`);
    }
    morceaux.push(texte);
  }
  return morceaux.join("\n\n");
}

export async function structurerEnMarkdownPandoc(cheminPdf: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("pandoc", [cheminPdf, "-f", "pdf", "-t", "markdown"]);
    return stdout;
  } catch {
    return null;
  }
}

export function decouperParSection(markdown: string): SectionMarkdown[] {
  const sections: SectionMarkdown[] = [];
  const lignes = markdown.split("\n");
  let titreCourant = "Introduction";
  let contenuCourant: string[] = [];

  for (const ligne of lignes) {
    const correspondance = ligne.match(/^##\s+(.+)/);
    if (correspondance) {
      sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });
      titreCourant = correspondance[1].trim();
      contenuCourant = [];
    } else {
      contenuCourant.push(ligne);
    }
  }
  sections.push({ titre: titreCourant, contenu: contenuCourant.join("\n").trim() });

  return sections.filter((s) => s.contenu.length > 0 || s.titre !== "Introduction");
}
