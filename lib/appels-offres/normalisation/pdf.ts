import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PageTexte } from "./types";
import { rendreImagePage, lireImageParClaude, initialiserWorkerSrc } from "./ocr";

const SEUIL_TEXTE_INSUFFISANT = 20;

// Un titre de section est presque toujours dans une police nettement plus
// grande que le corps du texte — contrairement à une comparaison de texte
// (voir markdown.ts pour le DOCX), cette approche ne dépend d'aucune liste
// figée de titres connus et fonctionne sur n'importe quel DAO. Remplace
// l'ancienne extraction via `pdf-parse`, qui ne donnait accès qu'au texte
// brut sans aucune information de mise en forme.
const RATIO_TITRE = 1.15;
// Un titre de section est une ligne courte (quelques mots) — ce garde-fou
// évite de classer un paragraphe entier comme titre si un DAO utilise
// exceptionnellement une police légèrement plus grande sur un bloc de texte.
const LONGUEUR_MAX_TITRE = 120;
// Tolérance sur la coordonnée verticale pour considérer deux fragments de
// texte comme appartenant à la même ligne (absorbe le jitter de ligne de
// base entre caractères d'une même ligne).
const TOLERANCE_MEME_LIGNE = 2;

export interface LignePdf {
  texte: string;
  taillePolice: number;
}

interface PageLignes {
  numero: number;
  lignes: LignePdf[];
}

async function extraireLignesParPage(buffer: Buffer): Promise<PageLignes[]> {
  initialiserWorkerSrc();

  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: PageLignes[] = [];

  for (let numero = 1; numero <= document.numPages; numero++) {
    const page = await document.getPage(numero);
    const contenu = await page.getTextContent();
    const lignes: LignePdf[] = [];

    let ligneCourante: { morceaux: string[]; y: number; taille: number } | null = null;

    for (const item of contenu.items) {
      if (!("str" in item) || item.str.trim().length === 0) continue;

      const taille = Math.hypot(item.transform[2], item.transform[3]);
      const y = item.transform[5];

      if (ligneCourante && Math.abs(ligneCourante.y - y) < TOLERANCE_MEME_LIGNE) {
        ligneCourante.morceaux.push(item.str);
        ligneCourante.taille = Math.max(ligneCourante.taille, taille);
      } else {
        if (ligneCourante) {
          lignes.push({
            texte: ligneCourante.morceaux.join("").trim(),
            taillePolice: ligneCourante.taille,
          });
        }
        ligneCourante = { morceaux: [item.str], y, taille };
      }
    }

    if (ligneCourante) {
      lignes.push({
        texte: ligneCourante.morceaux.join("").trim(),
        taillePolice: ligneCourante.taille,
      });
    }

    pages.push({ numero, lignes: lignes.filter((ligne) => ligne.texte.length > 0) });
  }

  return pages;
}

// La taille "normale" du corps de texte est la taille la plus fréquente
// parmi toutes les lignes du document — pas une moyenne, qui serait faussée
// par un document avec beaucoup de titres ou de tableaux à polices variées.
export function calculerTailleCorpsTexte(pages: { lignes: LignePdf[] }[]): number {
  const compteur = new Map<number, number>();

  for (const page of pages) {
    for (const ligne of page.lignes) {
      const taille = Math.round(ligne.taillePolice);
      compteur.set(taille, (compteur.get(taille) ?? 0) + 1);
    }
  }

  let tailleFrequente = 0;
  let frequenceMax = 0;
  for (const [taille, frequence] of compteur) {
    if (frequence > frequenceMax) {
      frequenceMax = frequence;
      tailleFrequente = taille;
    }
  }

  return tailleFrequente || 10;
}

// Un DAO réel imprime le même en-tête ou pied de page (souvent avec un
// numéro de page collé à la fin, ex. "...appel d'offres36") sur chaque page
// d'une section qui peut s'étendre sur plusieurs dizaines de pages. Ce texte
// est dans une police assez grande pour être détecté comme titre par
// construireTextePage, ce qui fragmente une section entière en autant de
// micro-sections que de pages — trouverSection (extraire.ts) ne récupère
// alors qu'un seul de ces fragments au lieu du contenu complet. Un titre
// isolé n'apparaît normalement qu'une fois ou deux (section + sommaire en
// préambule) ; un même texte détecté comme titre sur SEUIL_REPETITION_ENTETE
// pages distinctes ou plus est presque certainement un en-tête/pied de page
// récurrent, pas un vrai titre de section.
const SEUIL_REPETITION_ENTETE = 3;

function normaliserEntete(texte: string): string {
  return texte.replace(/\d+$/, "").trim();
}

function estCandidatTitre(ligne: LignePdf, tailleCorpsTexte: number): boolean {
  return (
    ligne.taillePolice >= tailleCorpsTexte * RATIO_TITRE &&
    ligne.texte.length <= LONGUEUR_MAX_TITRE
  );
}

export function identifierEntetesRepetees(
  pages: PageLignes[],
  tailleCorpsTexte: number,
): Set<string> {
  const pagesParEntete = new Map<string, Set<number>>();

  for (const page of pages) {
    for (const ligne of page.lignes) {
      if (!estCandidatTitre(ligne, tailleCorpsTexte)) continue;

      const normalise = normaliserEntete(ligne.texte);
      if (normalise.length === 0) continue;

      if (!pagesParEntete.has(normalise)) {
        pagesParEntete.set(normalise, new Set());
      }
      pagesParEntete.get(normalise)?.add(page.numero);
    }
  }

  const entetesRepetees = new Set<string>();
  for (const [texte, pagesVues] of pagesParEntete) {
    if (pagesVues.size >= SEUIL_REPETITION_ENTETE) {
      entetesRepetees.add(texte);
    }
  }
  return entetesRepetees;
}

export function construireTextePage(
  lignes: LignePdf[],
  tailleCorpsTexte: number,
  entetesRepetees: ReadonlySet<string> = new Set(),
): string {
  return lignes
    .map((ligne) => {
      const estTitre =
        estCandidatTitre(ligne, tailleCorpsTexte) &&
        !entetesRepetees.has(normaliserEntete(ligne.texte));
      return estTitre ? `\n## ${ligne.texte}\n` : ligne.texte;
    })
    .join("\n");
}

async function extraireTexteParPage(buffer: Buffer): Promise<PageTexte[]> {
  const pages = await extraireLignesParPage(buffer);
  const tailleCorpsTexte = calculerTailleCorpsTexte(pages);
  const entetesRepetees = identifierEntetesRepetees(pages, tailleCorpsTexte);

  return pages.map((page) => ({
    numero: page.numero,
    texte: construireTextePage(page.lignes, tailleCorpsTexte, entetesRepetees),
  }));
}

export async function extrairePagesPdf(buffer: Buffer): Promise<PageTexte[]> {
  const pages = await extraireTexteParPage(buffer);

  for (const page of pages) {
    // Le texte peut désormais contenir des marqueurs ## : on ne mesure que
    // le contenu réel pour décider si l'OCR de repli est nécessaire.
    const texteSansMarqueurs = page.texte.replace(/^##\s+/gm, "");
    if (texteSansMarqueurs.trim().length < SEUIL_TEXTE_INSUFFISANT) {
      const imagePage = await rendreImagePage(buffer, page.numero);
      page.texte = await lireImageParClaude(imagePage);
    }
  }

  return pages;
}
