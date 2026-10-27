import { StandardFonts, rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

const RGB_NOIR = rgb(0, 0, 0);

// pdf-lib ne fournit aucun moteur de mise en page (ni retour à la ligne, ni
// saut de page automatique) : il faut découper le texte caractère par
// caractère selon la largeur mesurée par la police, et gérer soi-même le
// passage à la page suivante quand `y` atteint la marge basse. Partagé entre
// tous les exports PDF (Go/No-Go, dossier de réponse) pour ne pas dupliquer
// cette mise en page ligne par ligne à chaque nouveau générateur.
export const MARGE = 50;
export const LARGEUR_PAGE = 595.28; // A4 portrait, points
export const HAUTEUR_PAGE = 841.89;
export const LARGEUR_TEXTE = LARGEUR_PAGE - 2 * MARGE;

export interface EtatRendu {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  police: PDFFont;
  policeGras: PDFFont;
}

export async function creerEtatRendu(doc: PDFDocument): Promise<EtatRendu> {
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const policeGras = await doc.embedFont(StandardFonts.HelveticaBold);
  const etat: EtatRendu = { doc, page: doc.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]), y: 0, police, policeGras };
  etat.y = HAUTEUR_PAGE - MARGE;
  return etat;
}

function decouperTexte(texte: string, police: PDFFont, taille: number, largeurMax: number): string[] {
  const mots = texte.split(/\s+/);
  const lignes: string[] = [];
  let ligneActuelle = "";
  for (const mot of mots) {
    const essai = ligneActuelle.length === 0 ? mot : `${ligneActuelle} ${mot}`;
    if (police.widthOfTextAtSize(essai, taille) > largeurMax && ligneActuelle.length > 0) {
      lignes.push(ligneActuelle);
      ligneActuelle = mot;
    } else {
      ligneActuelle = essai;
    }
  }
  if (ligneActuelle.length > 0) lignes.push(ligneActuelle);
  return lignes;
}

export function nouvellePage(etat: EtatRendu): void {
  etat.page = etat.doc.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
  etat.y = HAUTEUR_PAGE - MARGE;
}

export function ecrireLigne(
  etat: EtatRendu,
  texte: string,
  options: { gras?: boolean; taille?: number } = {},
): void {
  const taille = options.taille ?? 11;
  const police = options.gras ? etat.policeGras : etat.police;
  const lignes = decouperTexte(texte, police, taille, LARGEUR_TEXTE);
  for (const ligne of lignes) {
    if (etat.y < MARGE + taille) nouvellePage(etat);
    etat.page.drawText(ligne, { x: MARGE, y: etat.y, size: taille, font: police, color: RGB_NOIR });
    etat.y -= taille * 1.4;
  }
}

export function ecrireEspace(etat: EtatRendu, hauteur = 8): void {
  etat.y -= hauteur;
}
