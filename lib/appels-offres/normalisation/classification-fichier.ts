export const TYPES_FICHIER_DAO = [
  "aao",
  "is",
  "dpao",
  "ccag",
  "ccap",
  "bpu",
  "non_classe",
] as const;

export type TypeFichierDao = (typeof TYPES_FICHIER_DAO)[number];

// Ordre canonique de concaténation — extraireInformationsAo suppose cet
// ordre (plage d'exclusion par index Instructions→DPAO, voir
// normalisation/extraire.ts). "bpu" et "non_classe" en sont
// délibérément absents : jamais concaténés dans dao_markdown.
export const ORDRE_CANONIQUE_CONCATENATION: readonly TypeFichierDao[] = [
  "aao",
  "is",
  "dpao",
  "ccag",
  "ccap",
];

interface MotsClesType {
  type: TypeFichierDao;
  motsCles: string[];
}

// Premier type dont un mot-clé apparaît dans le document qui l'emporte.
// Un DAO à un seul fichier (contenant tous les mots-clés) tombe toujours
// sur "aao" en premier — comportement voulu, mais cette fonction n'est
// en pratique jamais appelée dans ce cas : traiterDao saute la
// classification entièrement quand il n'y a qu'un seul fichier (voir
// traitement.ts), pour éliminer tout risque qu'un faux négatif de
// classification supprime du contenu sur le cas majoritaire.
const REGISTRE: MotsClesType[] = [
  { type: "aao", motsCles: ["avis d'appel d'offres", "avis d'appel d'offre"] },
  {
    type: "is",
    motsCles: ["instructions aux soumissionnaires", "instructions aux candidats"],
  },
  {
    type: "dpao",
    motsCles: ["données particulières de l'appel d'offres", "données particulières"],
  },
  { type: "ccag", motsCles: ["cahier des clauses administratives générales"] },
  { type: "ccap", motsCles: ["cahier des clauses administratives particulières"] },
  {
    type: "bpu",
    motsCles: ["bordereau des prix", "devis quantitatif et estimatif", "devis quantitatif"],
  },
];

function normaliser(texte: string): string {
  return texte.toLowerCase().replace(/['’‘]/g, "'");
}

export function classifierTypeFichierDao(markdown: string): TypeFichierDao {
  const texteNormalise = normaliser(markdown);
  for (const { type, motsCles } of REGISTRE) {
    if (motsCles.some((mot) => texteNormalise.includes(normaliser(mot)))) {
      return type;
    }
  }
  return "non_classe";
}

export interface FichierClasse {
  type: TypeFichierDao;
  markdown: string;
}

// Regroupe par catégorie canonique (dans ORDRE_CANONIQUE_CONCATENATION),
// concatène les fichiers d'une même catégorie dans leur ordre d'apparition
// dans le tableau d'entrée (deux fichiers classés "dpao" restent tous
// deux inclus, l'un après l'autre — pas de déduplication, pas de
// détection de contradiction). "bpu"/"non_classe" jamais inclus.
// Séparateur double saut de ligne pour ne jamais fusionner la dernière
// ligne d'un fichier avec la première du suivant.
export function assemblerDaoMarkdown(fichiersClasses: FichierClasse[]): string {
  return ORDRE_CANONIQUE_CONCATENATION.map((type) =>
    fichiersClasses
      .filter((f) => f.type === type)
      .map((f) => f.markdown)
      .join("\n\n"),
  )
    .filter((bloc) => bloc.length > 0)
    .join("\n\n");
}
