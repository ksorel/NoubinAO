export const SECTEURS_CIBLES = [
  "btp",
  "ingenierie",
  "environnement",
  "energie_climat",
] as const;
export type SecteurCible = (typeof SECTEURS_CIBLES)[number];

interface MotsClesSecteur {
  secteur: SecteurCible;
  motsCles: string[];
}

// Ordre du registre = ordre de priorité en cas de chevauchement — premier
// secteur dont un mot-clé matche qui l'emporte, même patron que
// classifierTypeFichierDao
// (lib/appels-offres/normalisation/classification-fichier.ts).
// Mots-clés de départ, à affiner contre un échantillon réel d'avis en
// production (voir spec 2026-09-29-secteurs-activite-filtre-veille-design.md)
// — pas supposés exhaustifs.
const REGISTRE: MotsClesSecteur[] = [
  {
    secteur: "btp",
    motsCles: [
      "construction",
      "bâtiment",
      "voirie",
      "génie civil",
      "réhabilitation",
      "édifice",
      "salle de classe",
      "logement",
      "route",
      "pont",
      "dallage",
    ],
  },
  {
    secteur: "ingenierie",
    motsCles: [
      "étude",
      "ingénierie",
      "conception",
      "supervision",
      "contrôle technique",
      "maîtrise d'œuvre",
      "bureau d'études",
      "assistance technique",
    ],
  },
  {
    secteur: "environnement",
    motsCles: [
      "assainissement",
      "environnement",
      "déchets",
      "eau potable",
      "impact environnemental",
      "reboisement",
      "gestion des déchets",
    ],
  },
  {
    secteur: "energie_climat",
    motsCles: [
      "électrification",
      "solaire",
      "photovoltaïque",
      "climatisation",
      "réseau électrique",
      "éclairage public",
      "groupe électrogène",
    ],
  },
];

function normaliser(texte: string): string {
  return texte.toLowerCase();
}

export function classifierSecteur(objet: string): SecteurCible | null {
  const objetNormalise = normaliser(objet);
  for (const { secteur, motsCles } of REGISTRE) {
    if (motsCles.some((mot) => objetNormalise.includes(normaliser(mot)))) {
      return secteur;
    }
  }
  return null;
}
