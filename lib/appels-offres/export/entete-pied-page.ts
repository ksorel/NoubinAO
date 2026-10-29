import { ImageRun, PageNumber, TextRun, type ParagraphChild } from "docx";

export interface LogoExport {
  buffer: Buffer;
  type: "png" | "jpg" | "gif" | "bmp";
}

export interface ContexteEnTetePiedPage {
  nomEntreprise: string | null;
  dateExport: string;
  logo: LogoExport | null;
}

// Jetons "comme sous Excel" : insérés par l'utilisateur dans le
// paramétrage (voir entete-pied-page-card.tsx), résolus ici au moment de
// l'export. {{logo}} et {{entreprise}} sont statiques (connus avant la
// génération) ; {{page}}/{{pages}} sont des champs Word dynamiques
// (PageNumber.CURRENT / TOTAL_PAGES), recalculés par Word lui-même à
// l'ouverture - impossible à connaître côté serveur, le document n'étant
// pas encore paginé à la génération.
const JETON_REGEX = /(\{\{logo\}\}|\{\{entreprise\}\}|\{\{date\}\}|\{\{page\}\}|\{\{pages\}\})/;

const TAILLE_LOGO_PX = 50;

export function construireZoneDocx(
  texte: string | null,
  contexte: ContexteEnTetePiedPage,
): ParagraphChild[] {
  if (!texte) return [];

  return texte
    .split(JETON_REGEX)
    .filter((fragment) => fragment.length > 0)
    .map((fragment): ParagraphChild => {
      switch (fragment) {
        case "{{logo}}":
          return contexte.logo
            ? new ImageRun({
                type: contexte.logo.type,
                data: contexte.logo.buffer,
                transformation: { width: TAILLE_LOGO_PX, height: TAILLE_LOGO_PX },
              })
            : new TextRun({ text: "" });
        case "{{entreprise}}":
          return new TextRun({ text: contexte.nomEntreprise ?? "" });
        case "{{date}}":
          return new TextRun({ text: contexte.dateExport });
        case "{{page}}":
          return new TextRun({ children: [PageNumber.CURRENT] });
        case "{{pages}}":
          return new TextRun({ children: [PageNumber.TOTAL_PAGES] });
        default:
          return new TextRun({ text: fragment });
      }
    });
}

export function zonesVides(zones: (string | null)[]): boolean {
  return zones.every((zone) => !zone || zone.trim().length === 0);
}
