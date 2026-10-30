const JOUR_MS = 24 * 60 * 60 * 1000;

export interface JalonGenere {
  libelle: string;
  dateCible: string;
}

interface RegleJalonSysteme {
  libelle: string;
  calculerDate: (dateLimite: Date, maintenant: Date) => Date;
}

function dateProportionnelle(fraction: number): (dateLimite: Date, maintenant: Date) => Date {
  return (dateLimite, maintenant) =>
    new Date(maintenant.getTime() + fraction * (dateLimite.getTime() - maintenant.getTime()));
}

const REGLES_PHASES_PROPORTIONNELLES: RegleJalonSysteme[] = [
  { libelle: "Analyse du DAO et décision Go/No-Go", calculerDate: dateProportionnelle(0.1) },
  {
    libelle: "Constitution du dossier (pièces, mapping, rédaction)",
    calculerDate: dateProportionnelle(0.4),
  },
  { libelle: "Revue interne de l'offre", calculerDate: dateProportionnelle(0.65) },
  { libelle: "Relecture finale et vérifications", calculerDate: dateProportionnelle(0.85) },
];

// Même fraction que l'analyse Go/No-Go (0.1) : la démarche bancaire pour
// obtenir la garantie prend souvent plusieurs jours, elle doit démarrer dès
// la décision de répondre, pas attendre.
const REGLE_CAUTION: RegleJalonSysteme = {
  libelle: "Obtenir la caution de soumission",
  calculerDate: dateProportionnelle(0.1),
};

// Jamais le jour même de la date limite - l'ebook insiste sur cette marge de
// sécurité (« Jour 14, H-24 : dépôt effectif »), un dépôt de dernière minute
// étant le principal facteur de rejet administratif.
const REGLE_DEPOT: RegleJalonSysteme = {
  libelle: "Dépôt du dossier",
  calculerDate: (dateLimite) => new Date(dateLimite.getTime() - JOUR_MS),
};

// Source de vérité unique pour les libellés/dates des jalons système,
// partagée entre la génération initiale (genererJalonsParDefaut) et le
// recalcul au changement de date limite (recalculerDatesJalonsSysteme) -
// évite que les deux dérivent l'une de l'autre.
const REGLES_JALONS_SYSTEME: readonly RegleJalonSysteme[] = [
  ...REGLES_PHASES_PROPORTIONNELLES,
  REGLE_CAUTION,
  REGLE_DEPOT,
];

function formatDateISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function genererJalonsParDefaut(
  dateLimite: Date,
  maintenant: Date = new Date(),
  montantCaution?: number | null,
): JalonGenere[] {
  const jalons = REGLES_PHASES_PROPORTIONNELLES.map(({ libelle, calculerDate }) => ({
    libelle,
    dateCible: formatDateISO(calculerDate(dateLimite, maintenant)),
  }));

  // Générée seulement si un montant de caution est déjà connu - aucun jalon
  // caution sur un AO qui n'en a pas (ou pas encore).
  if (montantCaution !== null && montantCaution !== undefined && montantCaution > 0) {
    jalons.splice(1, 0, {
      libelle: REGLE_CAUTION.libelle,
      dateCible: formatDateISO(REGLE_CAUTION.calculerDate(dateLimite, maintenant)),
    });
  }

  jalons.push({
    libelle: REGLE_DEPOT.libelle,
    dateCible: formatDateISO(REGLE_DEPOT.calculerDate(dateLimite, maintenant)),
  });

  return jalons;
}

// Recalcule les jalons système (voir REGLES_JALONS_SYSTEME) non cochés
// quand la date limite de l'AO change - voir
// docs/superpowers/specs/2026-10-30-recalcul-jalons-date-limite-design.md.
// Ne touche jamais : un jalon déjà coché (marqué fait), ou un jalon dont le
// libellé ne correspond à aucune règle système (ajouté à la main par
// l'utilisateur). Le jalon caution n'est recalculé que s'il figure déjà
// parmi jalonsExistants - cette fonction ne crée jamais de nouveau jalon.
export function recalculerDatesJalonsSysteme(
  jalonsExistants: { id: string; libelle: string; coche: boolean }[],
  nouvelleDateLimite: Date,
  maintenant: Date = new Date(),
): { id: string; nouvelleDateCible: string }[] {
  const reglesParLibelle = new Map(REGLES_JALONS_SYSTEME.map((regle) => [regle.libelle, regle]));

  const resultat: { id: string; nouvelleDateCible: string }[] = [];
  for (const jalon of jalonsExistants) {
    if (jalon.coche) continue;
    const regle = reglesParLibelle.get(jalon.libelle);
    if (!regle) continue;
    resultat.push({
      id: jalon.id,
      nouvelleDateCible: formatDateISO(regle.calculerDate(nouvelleDateLimite, maintenant)),
    });
  }
  return resultat;
}
