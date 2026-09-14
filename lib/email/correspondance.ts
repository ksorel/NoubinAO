const MOTS_VIDES = new Set([
  "de", "la", "le", "les", "des", "du", "un", "une", "et", "ou", "pour",
  "avec", "dans", "sur", "au", "aux", "en", "à", "d", "l", "par",
]);

export function extraireMotsCles(texte: string): string[] {
  return texte
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((mot) => mot.length >= 4 && !MOTS_VIDES.has(mot));
}

const QUARANTE_CINQ_JOURS_MS = 45 * 24 * 60 * 60 * 1000;

export interface EmailAScorer {
  objet: string | null;
  contenu: string | null;
  expediteur: string | null;
  recu_le: string | null;
}

export interface AppelOffresAScorer {
  titre: string | null;
  acheteur: string | null;
  date_limite: string | null;
}

// Distingue la part du score qui vient d'un vrai signal textuel (acheteur,
// mots-clés du titre) de la part qui vient uniquement de la proximité de
// date. La proximité de date est un renfort utile pour départager/trier,
// mais un signal trop faible et trop peu spécifique pour qualifier une
// suggestion à lui seul — un ancien seuil numérique global (ex. `total > 3`)
// excluait à tort un email dont l'objet matche exactement un seul mot-clé du
// titre (score = 2), alors que c'est un vrai signal textuel. On exige donc
// désormais `sansDate > 0`, peu importe sa valeur exacte, plutôt qu'un seuil
// numérique sur le total.
export interface ScoreCorrespondance {
  total: number;
  sansDate: number;
}

export function calculerScoreCorrespondanceDetaille(
  email: EmailAScorer,
  appelOffres: AppelOffresAScorer,
): ScoreCorrespondance {
  const texteEmail = [email.objet, email.expediteur, email.contenu]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let sansDate = 0;

  if (appelOffres.acheteur && texteEmail.includes(appelOffres.acheteur.toLowerCase())) {
    sansDate += 10;
  }

  if (appelOffres.titre) {
    const motsCles = extraireMotsCles(appelOffres.titre);
    const correspondances = motsCles.filter((mot) => texteEmail.includes(mot)).length;
    sansDate += correspondances * 2;
  }

  let bonusDate = 0;
  if (appelOffres.date_limite && email.recu_le) {
    const diffMs = Math.abs(
      new Date(email.recu_le).getTime() - new Date(appelOffres.date_limite).getTime(),
    );
    if (diffMs <= QUARANTE_CINQ_JOURS_MS) bonusDate = 3;
  }

  return { total: sansDate + bonusDate, sansDate };
}

export function calculerScoreCorrespondance(
  email: EmailAScorer,
  appelOffres: AppelOffresAScorer,
): number {
  return calculerScoreCorrespondanceDetaille(email, appelOffres).total;
}
