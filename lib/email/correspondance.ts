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

export function calculerScoreCorrespondance(
  email: EmailAScorer,
  appelOffres: AppelOffresAScorer,
): number {
  const texteEmail = [email.objet, email.expediteur, email.contenu]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;

  if (appelOffres.acheteur && texteEmail.includes(appelOffres.acheteur.toLowerCase())) {
    score += 10;
  }

  if (appelOffres.titre) {
    const motsCles = extraireMotsCles(appelOffres.titre);
    const correspondances = motsCles.filter((mot) => texteEmail.includes(mot)).length;
    score += correspondances * 2;
  }

  if (appelOffres.date_limite && email.recu_le) {
    const diffMs = Math.abs(
      new Date(email.recu_le).getTime() - new Date(appelOffres.date_limite).getTime(),
    );
    if (diffMs <= QUARANTE_CINQ_JOURS_MS) score += 3;
  }

  return score;
}
