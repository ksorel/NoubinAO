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
const MOTIF_LEGENDE = /N°\s*([A-Z]+(?:\s[A-Z]+)?\s*\d+\/\d{4})(\s*\(suite\))?\s*\n/g;

export function decouperEnAvis(
  texteComplet: string,
): { reference: string; texteBrut: string }[] {
  const indices = [...texteComplet.matchAll(MOTIF_ARTICLE_1)].map((m) => m.index ?? 0);
  if (indices.length === 0) return [];

  const blocs = indices.map((debut, i) => {
    const fin = i + 1 < indices.length ? indices[i + 1] : texteComplet.length;
    return texteComplet.slice(debut, fin).trim();
  });

  const references = [...texteComplet.matchAll(MOTIF_LEGENDE)]
    .filter((m) => !m[2]) // exclut les légendes "(suite)"
    .map((m) => m[1].trim());

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
