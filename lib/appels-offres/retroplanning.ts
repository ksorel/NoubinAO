const JOUR_MS = 24 * 60 * 60 * 1000;

export interface JalonGenere {
  libelle: string;
  dateCible: string;
}

const PHASES_PROPORTIONNELLES: { libelle: string; fraction: number }[] = [
  { libelle: "Analyse du DAO et décision Go/No-Go", fraction: 0.1 },
  { libelle: "Constitution du dossier (pièces, mapping, rédaction)", fraction: 0.4 },
  { libelle: "Revue interne de l'offre", fraction: 0.65 },
  { libelle: "Relecture finale et vérifications", fraction: 0.85 },
];

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function genererJalonsParDefaut(
  dateLimite: Date,
  maintenant: Date = new Date(),
): JalonGenere[] {
  const dureeMs = dateLimite.getTime() - maintenant.getTime();

  const jalons = PHASES_PROPORTIONNELLES.map(({ libelle, fraction }) => ({
    libelle,
    dateCible: formatDateISO(new Date(maintenant.getTime() + fraction * dureeMs)),
  }));

  // Jamais le jour même de la date limite — l'ebook insiste sur cette
  // marge de sécurité (« Jour 14, H-24 : dépôt effectif »), un dépôt de
  // dernière minute étant le principal facteur de rejet administratif.
  jalons.push({
    libelle: "Dépôt du dossier",
    dateCible: formatDateISO(new Date(dateLimite.getTime() - JOUR_MS)),
  });

  return jalons;
}
