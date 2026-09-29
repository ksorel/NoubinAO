import * as cheerio from "cheerio";
import type { TypeAvisAoNational } from "./types";

export interface AvisScrape {
  reference: string;
  type: TypeAvisAoNational | null;
  objet: string;
  autoriteContractante: string | null;
  dateLimite: string | null;
}

// Mapping volontairement strict (comparaison exacte après trim/upper) —
// aucune valeur "manifestation d'intérêt" observée dans l'échantillon
// inspecté à ce jour ; ce mapping reste ouvert à cette 4e valeur si elle
// apparaît sous un libellé à découvrir en pratique (voir spec).
const MAPPING_TYPE_MARCHE: Record<string, TypeAvisAoNational> = {
  TRAVAUX: "travaux",
  FOURNITURE: "fournitures",
  PRESTATION: "prestations",
};

function mapperTypeMarche(texteSource: string): TypeAvisAoNational | null {
  const cle = texteSource.trim().toUpperCase();
  return MAPPING_TYPE_MARCHE[cle] ?? null;
}

// Format observé dans la source : "JJ-MM-AAAA", parfois avec un espace
// final. Convertit vers le format ISO attendu par une colonne Postgres
// `date`. Toute valeur qui ne correspond pas exactement à ce format
// devient null plutôt que de risquer une date silencieusement fausse.
function parserDateLimite(texteSource: string): string | null {
  const nettoye = texteSource.trim();
  const correspondance = nettoye.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!correspondance) return null;

  const [, jour, mois, annee] = correspondance;
  return `${annee}-${mois}-${jour}`;
}

export function extraireAvisDepuisHtml(html: string): AvisScrape[] {
  const $ = cheerio.load(html);
  const avis: AvisScrape[] = [];

  $("#example tbody tr").each((_, ligne) => {
    const cellules = $(ligne).find("td");
    if (cellules.length < 6) return;

    const reference = $(cellules[0]).text().trim();
    const typeTexte = $(cellules[1]).text().trim();
    const objet = $(cellules[2]).text().trim();
    const autoriteContractanteTexte = $(cellules[3]).text().trim();
    const dateLimiteTexte = $(cellules[5]).text().trim();

    if (!reference || !objet) return;

    avis.push({
      reference,
      type: mapperTypeMarche(typeTexte),
      objet,
      autoriteContractante: autoriteContractanteTexte.length > 0 ? autoriteContractanteTexte : null,
      dateLimite: parserDateLimite(dateLimiteTexte),
    });
  });

  return avis;
}
