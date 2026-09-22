// Un avis nouveau du BOMP suit toujours un bloc ARTICLE 1 à ARTICLE 13,
// mais la légende "N° <référence>\n<TITRE>" de chaque avis n'apparaît PAS
// juste après son propre bloc ARTICLE 13 — inspection réelle du BOMP
// n°1896 (pages 48-49) : les légendes de deux avis consécutifs sont
// groupées ensemble après le contenu ARTICLE des DEUX avis (artefact de
// mise en page : la légende est une colonne latérale extraite après la
// colonne de corps de texte par pdfjs-dist, pas une erreur de ce parseur
// en particulier). Plutôt que de deviner un lien de proximité fragile,
// les légendes et les blocs ARTICLE 1 sont extraits séparément puis
// réassociés par position ordinale — les deux séquences apparaissent dans
// le même ordre relatif dans le document même si elles sont physiquement
// entrelacées différemment.
const MOTIF_ARTICLE_1 = /ARTICLE\s+1\s*:\s*AUTORIT[EÉ]\s+CONTRACTANTE/gi;
// Une légende "(suite)" désigne un avis déjà entamé sur une page
// précédente (donc déjà capturé par un bloc ARTICLE 1 antérieur) — elle
// ne doit jamais être comptée comme la référence d'un nouveau bloc.
// L'espace optionnel avant le slash (`\s*\/`) est nécessaire : le BOMP
// réel mélange les deux graphies pour un même type d'avis dans la même
// édition ("F 300 /2026" et "F 302/2026" côte à côte, n°1896) — sans lui,
// les légendes espacées ne matchent jamais et déclenchent le repli
// SANS-REF sur l'ensemble du lot (observé en production, 2026-09-23).
const MOTIF_LEGENDE = /N°\s*([A-Z]+(?:\s[A-Z]+)?\s*\d+)\s*\/\s*(\d{4})(\s*\(suite\))?\s*\n/g;
// Après le dernier avis « nouveau », le BOMP enchaîne sur d'autres
// sections (programmation, résultats, décisions ARCOP...) qui ne suivent
// plus le format ARTICLE 1-13 mais contiennent quand même des occurrences
// de "N°" que MOTIF_LEGENDE peut confondre avec de vraies légendes — par
// exemple l'en-tête de tableau "N° APPELS D'OFFRES" d'une section de
// programmation, ou "N°182/2026/ARCOP/CRS..." dans les décisions ARCOP
// (observé en production sur le BOMP n°1896, 2026-09-23). Sans borne, le
// dernier bloc ARTICLE-1 — qui n'a pas de bloc suivant pour délimiter sa
// fin — avale tout le reste du document, plusieurs centaines de pages
// hors périmètre V1 (voir spec, section « Hors périmètre »). Le titre de
// tableau "OBJETS DES APPELS D'OFFRES" marque de façon fiable le début de
// cette section suivante ; recherché uniquement après le dernier ARTICLE
// 1 pour ne jamais tronquer un avis dont le corps le mentionnerait.
const MOTIF_FIN_SECTION_AVIS = /OBJETS DES APPELS D.OFFRES/i;

export function decouperEnAvis(
  texteComplet: string,
): { reference: string; texteBrut: string }[] {
  const indices = [...texteComplet.matchAll(MOTIF_ARTICLE_1)].map((m) => m.index ?? 0);
  if (indices.length === 0) return [];

  const dernierIndex = indices[indices.length - 1];
  const positionFinSection = texteComplet.slice(dernierIndex).search(MOTIF_FIN_SECTION_AVIS);
  const texteBorne =
    positionFinSection === -1
      ? texteComplet
      : texteComplet.slice(0, dernierIndex + positionFinSection);

  const blocs = indices.map((debut, i) => {
    const fin = i + 1 < indices.length ? indices[i + 1] : texteBorne.length;
    return texteBorne.slice(debut, fin).trim();
  });

  const references = [...texteBorne.matchAll(MOTIF_LEGENDE)]
    .filter((m) => !m[3]) // exclut les légendes "(suite)"
    .map((m) => `${m[1].trim()}/${m[2]}`);

  // L'appariement positionnel n'est valide que si les deux séquences ont
  // exactement la même longueur. S'il manque une seule légende AU MILIEU
  // de la séquence (pdfjs fusionne deux lignes de légende que le motif
  // attend séparées par un saut de ligne, par exemple), tous les blocs
  // suivants reçoivent silencieusement la référence de leur voisin — des
  // données fausses mais parfaitement plausibles, impossibles à repérer à
  // la relecture. Un repli global rend au contraire la panne évidente
  // (une liste pleine de "SANS-REF"), ce qui est le comportement voulu :
  // mieux vaut un catalogue visiblement incomplet qu'un catalogue
  // faussement exact.
  if (references.length !== blocs.length) {
    return blocs.map((texteBrut, i) => ({
      reference: `SANS-REF-${i + 1}`,
      texteBrut,
    }));
  }

  return blocs.map((texteBrut, i) => ({
    reference: references[i],
    texteBrut,
  }));
}
