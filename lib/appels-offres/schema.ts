import { z } from "zod";
import { MIME_TYPES_DAO_SUPPORTES } from "./normalisation/normaliser";
import { MIME_DOC_LEGACY } from "../documents/normalisation";
import {
  CATEGORIES_QUESTION_GO_NO_GO,
  RAISONS_RESULTAT_AO,
  REPONSES_GO_NO_GO,
  ROLES_MEMBRE_GROUPEMENT,
  STATUTS_PIPELINE_AO,
  TYPES_ACHETEUR_AO,
  PROCEDURES_AO,
  CANAUX_DEPOT_AO,
  MODES_EVALUATION_AO,
  OPERATEURS_SPECIFICATION,
  STATUTS_CONFORMITE,
  ROLES_REFERENCE,
} from "./types";

export const TAILLE_MAX_OCTETS = 20 * 1024 * 1024; // 20 Mo

const fichierDaoUnique = z
  .instanceof(File)
  .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
    message: "Chaque fichier doit faire moins de 20 Mo",
  })
  .refine(
    (f) => (MIME_TYPES_DAO_SUPPORTES as readonly string[]).includes(f.type),
    { message: "Type de fichier non accepté (PDF ou DOCX uniquement)" },
  );

export const televerserDaoSchema = z.object({
  fichiers: z.array(fichierDaoUnique).min(1, "Ajoutez au moins un fichier"),
});

export type TeleverserDaoInput = z.infer<typeof televerserDaoSchema>;

// Le corps d'une Server Action est plafonné par Vercel à ~4,5 Mo, bien en
// deçà de TAILLE_MAX_OCTETS (20 Mo, déjà jugé nécessaire pour un DAO réel —
// voir le commentaire dans next.config.ts) : un DAO Word dépasse ce plafond
// plateforme en pratique et l'upload était rejeté en périphérie, avant même
// d'atteindre televerserDao, sans qu'aucune erreur ne remonte au client
// (bouton bloqué indéfiniment sur "en cours"). demarrerTeleversementDao /
// finaliserTeleversementDao ne reçoivent donc plus jamais le contenu des
// fichiers : seuls leurs noms transitent par la Server Action, l'upload des
// octets se fait directement navigateur → Supabase Storage via URL signée.
const nomFichierDao = z.object({
  nomOriginal: z.string().trim().min(1).max(255),
  mimeType: z.enum(MIME_TYPES_DAO_SUPPORTES),
});

export const demarrerTeleversementDaoSchema = z.object({
  fichiers: z.array(nomFichierDao).min(1, "Ajoutez au moins un fichier"),
});

export type DemarrerTeleversementDaoInput = z.infer<typeof demarrerTeleversementDaoSchema>;

// Un modèle de CV imposé par un DAO arrive parfois en .doc legacy (binaire
// OLE, pas OOXML) — contrairement au DAO lui-même, jamais transmis dans ce
// format en pratique. Accepte donc un format de plus que
// televerserDaoSchema ; normalisé par normaliserDocument (lib/documents),
// pas normaliserDao, pour couvrir ce troisième format.
const MIME_TYPES_MODELE_CV_SUPPORTES = [...MIME_TYPES_DAO_SUPPORTES, MIME_DOC_LEGACY] as const;

export const televerserModeleCvSchema = z.object({
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
      message: "Le fichier doit faire moins de 20 Mo",
    })
    .refine(
      (f) => (MIME_TYPES_MODELE_CV_SUPPORTES as readonly string[]).includes(f.type),
      { message: "Type de fichier non accepté (PDF ou Word uniquement)" },
    ),
});

export type TeleverserModeleCvInput = z.infer<typeof televerserModeleCvSchema>;

const champOptionnel = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null));

// FormData ne transporte que des strings, jamais null — "" (select natif)
// et "_non_renseigne" (sentinel Radix, voir appel-offres-detail.tsx : un
// <Select.Item> ne peut pas avoir value="") sont tous deux convertis en
// null avant validation de l'énumération, pour que le profil
// procédure×canal×acheteur reste effaçable depuis le formulaire, pas
// seulement renseignable.
const VALEUR_NON_RENSEIGNE = "_non_renseigne";

function champEnumOptionnel<T extends readonly [string, ...string[]]>(valeurs: T) {
  return z.preprocess(
    (v) =>
      typeof v === "string" && v.trim().length > 0 && v !== VALEUR_NON_RENSEIGNE ? v : null,
    z.enum(valeurs).nullable(),
  );
}

// Pourcentage stocké tel quel (pas de division par 100) : voir la migration
// mode_evaluation_fourchette_prix, aucun moteur de calcul ne consomme
// encore ces valeurs (chiffrage = sprint S5). `max` par défaut généreux
// (1000) plutôt que 100 : une fourchette haute ou une variation de
// quantité peut dépasser 100 % (ex. fourchette haute à 150 %).
// preprocess (comme champEnumOptionnel ci-dessus), pas juste
// .nullable() : accepte aussi bien une clé absente (undefined — anciens
// appels/fixtures de test écrits avant l'ajout de ce champ) qu'une chaîne
// vide ou une valeur explicitement nulle.
function pourcentageLibre(max = 1000) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null),
    z
      .string()
      .nullable()
      .refine((v) => v === null || /^\d+(\.\d+)?$/.test(v), { message: "Pourcentage invalide" })
      .transform((v) => (v === null ? null : Number(v)))
      .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= max), {
        message: `Le pourcentage doit être compris entre 0 et ${max}`,
      }),
  );
}

// Tri-état (Non renseigné / Oui / Non) soumis par un <select> natif — même
// sentinel "_non_renseigne" que champEnumOptionnel ci-dessus pour l'option
// vide. Une valeur hors ("oui" | "non" | sentinel | "") échoue la
// validation booléenne plutôt que d'être silencieusement acceptée.
// `Number.isFinite` seul acceptait un montant négatif ("-500" est un
// nombre fini) et la notation scientifique ("1e10" et "10000000000" donnent
// le même nombre fini une fois convertis, donc indistinguables après coup)
// — un montant saisi par erreur en notation scientifique passait
// silencieusement. Le format de la chaîne source est donc vérifié avant
// conversion : uniquement des chiffres, avec au plus une décimale, jamais
// de signe ni d'exposant. Partagé par montantCaution et montantEstimatif.
function montantLibre() {
  return z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Montant invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Montant invalide",
    });
}

function booleenOptionnel() {
  return z.preprocess((v) => {
    if (typeof v !== "string" || v.trim().length === 0 || v === VALEUR_NON_RENSEIGNE) return null;
    if (v === "oui") return true;
    if (v === "non") return false;
    return v;
  }, z.boolean().nullable());
}

export const modifierAppelOffresSchema = z.object({
  titre: champOptionnel,
  acheteur: champOptionnel,
  secteur: champOptionnel,
  dateLimite: champOptionnel,
  typeAcheteur: champEnumOptionnel(TYPES_ACHETEUR_AO),
  procedureMarche: champEnumOptionnel(PROCEDURES_AO),
  canalDepot: champEnumOptionnel(CANAUX_DEPOT_AO),
  modeEvaluation: champEnumOptionnel(MODES_EVALUATION_AO),
  fourchettePrixBasse: pourcentageLibre(),
  fourchettePrixHaute: pourcentageLibre(),
  montantEstimatif: montantLibre(),
  variationQuantiteHausse: pourcentageLibre(),
  variationQuantiteBaisse: pourcentageLibre(100),
  tauxRedevanceReglementation: pourcentageLibre(100),
  timbreRequis: booleenOptionnel(),
  delaiLivraisonMaxJours: joursNullable(),
  delaiLivraisonProposeJours: joursNullable(),
  garantieExigeeJours: joursNullable(),
  garantieProposeeJours: joursNullable(),
  validiteOffreJours: joursNullable(),
  validiteOffreProposeJours: joursNullable(),
  montantCaution: montantLibre(),
  // Gré à gré (marge plancher) et demande de propositions (seuil
  // qualificatif technique) — sprint S5 parcours expert v2, voir CLAUDE.md.
  // Mêmes bornes 0-100 que tauxRedevanceReglementation ci-dessus.
  margePlancherPct: pourcentageLibre(100),
  seuilQualificatifTechniquePct: pourcentageLibre(100),
  // Références (sprint S7, parcours expert v2, voir CLAUDE.md) : critères
  // de filtrage/recevabilité consommés par reference-filtre.ts et REF-01.
  // preprocess : même raison que joursNullable/pourcentageLibre — accepte
  // une clé absente du FormData (fixtures de test écrites avant l'ajout de
  // ces champs), champOptionnel/montantLibre seuls n'acceptent pas undefined.
  periodeReferencesDebut: z.preprocess((v) => v ?? null, champOptionnel),
  periodeReferencesFin: z.preprocess((v) => v ?? null, champOptionnel),
  natureReferencesTags: tagsLibres(),
  montantMinimalReference: z.preprocess((v) => v ?? null, montantLibre()),
  nombreReferencesExigees: entierPositifNullable(),
});

export type ModifierAppelOffresInput = z.infer<typeof modifierAppelOffresSchema>;

// Contrairement à `champOptionnel` (partagé avec modifierAppelOffresSchema,
// sans limite de longueur), les notes Go/No-Go imposent une longueur
// maximale : la Server Action correspondante peut être appelée
// directement (hors UI), qui n'impose elle-même aucune limite de
// saisie sur le <Textarea>. Réutilisée telle quelle par
// modifierStatutPipelineSchema/modifierResultatAoSchema ci-dessous — même
// exigence de longueur, pas de raison de la dupliquer.
const noteGoNoGo = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
  .refine((v) => v === null || v.length <= 2000, {
    message: "Note trop longue (2000 caractères maximum)",
  });

export const modifierStatutPipelineSchema = z.object({
  statutPipeline: z.enum(STATUTS_PIPELINE_AO),
  raisonResultat: z.enum(RAISONS_RESULTAT_AO).nullable().optional(),
  noteResultat: noteGoNoGo.optional(),
});

function montantNullable() {
  return z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+(\.\d+)?$/.test(v), { message: "Montant invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), {
      message: "Le montant doit être positif",
    });
}

function pourcentageNullable() {
  return z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+(\.\d+)?$/.test(v), { message: "Pourcentage invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (v >= 0 && v <= 100), {
      message: "Le pourcentage doit être compris entre 0 et 100",
    })
    .transform((v) => (v === null ? null : v / 100));
}

// preprocess (comme champEnumOptionnel/pourcentageLibre ci-dessus), pas
// juste .nullable() : accepte aussi bien une clé absente (undefined —
// anciens appels/fixtures de test écrits avant l'ajout d'un nouveau champ)
// qu'une chaîne vide ou une valeur explicitement nulle. Même piège que
// pourcentageLibre, trouvé une seconde fois en ajoutant les champs
// d'engagement (ENG) — joursNullable servait déjà delaiPaiementJours
// (Go/No-Go) sans jamais avoir été exercé avec une clé manquante.
function joursNullable() {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null),
    z
      .string()
      .nullable()
      .refine((v) => v === null || /^\d+$/.test(v), { message: "Nombre de jours invalide" })
      .transform((v) => (v === null ? null : Number(v)))
      .refine((v) => v === null || v >= 0, { message: "Le délai doit être positif" }),
  );
}

function noteBornee(max: number) {
  return z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+$/.test(v), { message: "Note invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (v >= 0 && v <= max), {
      message: `Note hors barème (0 à ${max})`,
    });
}

export const mettreAJourGoNoGoSchema = z.object({
  typeMarcheId: z.string().uuid().nullable(),
  montantMarcheEstime: montantNullable(),
  coutTotalRealisation: montantNullable(),
  prixDao: montantNullable(),
  cautionSoumission: montantNullable(),
  fraisPreparation: montantNullable(),
  avancePourcentage: pourcentageNullable(),
  delaiPaiementJours: joursNullable(),
  argentDisponibleBanque: montantNullable(),
  noteInteretStrategique: noteBornee(4),
  noteClientPaie: noteBornee(3),
  noteConcurrence: noteBornee(2),
  noteRisques: noteBornee(3),
  commentaireGlobal: noteGoNoGo,
});

export const mettreAJourReponseGoNoGoSchema = z.object({
  questionId: z.string().uuid(),
  reponse: z.enum(REPONSES_GO_NO_GO),
  commentaire: noteGoNoGo,
});

export const typeMarcheGoNoGoSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, "Le nom est requis")
    .max(100, "Nom trop long (100 caractères maximum)"),
});

export const questionGoNoGoSchema = z
  .object({
    categorie: z.enum(CATEGORIES_QUESTION_GO_NO_GO),
    typeMarcheId: z.string().uuid().nullable(),
    texte: z
      .string()
      .trim()
      .min(1, "Le texte est requis")
      .max(500, "Texte trop long (500 caractères maximum)"),
  })
  .refine((v) => (v.categorie === "savoir_faire") === (v.typeMarcheId !== null), {
    message: "Une question savoir-faire doit être liée à un type de marché (et inversement).",
    path: ["typeMarcheId"],
  });

export const modifierQuestionGoNoGoSchema = z.object({
  texte: z
    .string()
    .trim()
    .min(1, "Le texte est requis")
    .max(500, "Texte trop long (500 caractères maximum)"),
});

export const parametresGoNoGoSchema = z.object({
  noteMinGo: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Note invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => v >= 0 && v <= 20, { message: "La note doit être comprise entre 0 et 20" }),
  margeMinVisee: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Marge invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => v >= 0 && v <= 100, { message: "La marge doit être comprise entre 0 et 100" })
    .transform((v) => v / 100),
});

export const modifierResultatAoSchema = z.object({
  raisonResultat: z.enum(RAISONS_RESULTAT_AO).nullable(),
  noteResultat: noteGoNoGo,
});

export const creerJalonSchema = z.object({
  libelle: z
    .string()
    .trim()
    .min(1, "Le libellé est requis")
    .max(200, "Libellé trop long (200 caractères maximum)"),
  dateCible: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide")
    .refine((v) => {
      const [annee, mois, jour] = v.split("-").map(Number);
      const date = new Date(Date.UTC(annee, mois - 1, jour));
      return (
        date.getUTCFullYear() === annee &&
        date.getUTCMonth() === mois - 1 &&
        date.getUTCDate() === jour
      );
    }, { message: "Date invalide" }),
});

export const creerSectionBpuSchema = z.object({
  titre: z
    .string()
    .trim()
    .min(1, "Le titre est requis")
    .max(200, "Titre trop long (200 caractères maximum)"),
});

// Réutilisé pour la création ET la modification d'une ligne (même forme
// de saisie dans les deux cas — voir Server Actions).
export const ligneBpuSchema = z.object({
  codeArticle: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 50, {
      message: "Code article trop long (50 caractères maximum)",
    }),
  designation: z
    .string()
    .trim()
    .min(1, "La désignation est requise")
    .max(500, "Désignation trop longue (500 caractères maximum)"),
  unite: z
    .string()
    .trim()
    .min(1, "L'unité est requise")
    .max(20, "Unité trop longue (20 caractères maximum)"),
  // Même garde-fou que montantCaution (modifierAppelOffresSchema) contre
  // les négatifs et la notation scientifique : vérifier le format de la
  // chaîne source avant conversion, pas seulement Number.isFinite après.
  quantite: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Quantité invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => Number.isFinite(v) && v > 0, {
      message: "La quantité doit être positive",
    }),
  prixUnitaire: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Prix unitaire invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Prix unitaire invalide",
    }),
  debourseSec: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Déboursé sec invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Déboursé sec invalide",
    }),
  // Borné à [0, 100], contrairement à prixUnitaire/debourseSec : un taux
  // au-delà de 100% du déboursé sec n'a pas de sens dans ce modèle additif.
  tauxFraisStructure: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Taux de frais de structure invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le taux doit être compris entre 0 et 100",
    }),
});

export type LigneBpuInput = z.infer<typeof ligneBpuSchema>;

export const cotationFournisseurSchema = z.object({
  fournisseur: z
    .string()
    .trim()
    .min(1, "Le fournisseur est requis")
    .max(200, "Nom de fournisseur trop long (200 caractères maximum)"),
  prix: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Prix invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Le prix doit être positif" }),
  delaiJours: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+$/.test(v.trim()), {
      message: "Délai invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null)),
  validiteDate: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), {
      message: "Date invalide",
    }),
  incoterm: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 20, {
      message: "Incoterm trop long (20 caractères maximum)",
    }),
});

export type CotationFournisseurInput = z.infer<typeof cotationFournisseurSchema>;

export const tauxFraisStructureDefautSchema = z.object({
  taux: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Taux invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le taux doit être compris entre 0 et 100",
    }),
});

export const tourNegociationSchema = z.object({
  montantPropose: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Montant invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "Le montant doit être positif" }),
  dateTour: z
    .string()
    .trim()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Date invalide" }),
  commentaire: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 500, {
      message: "Commentaire trop long (500 caractères maximum)",
    }),
});

export type TourNegociationInput = z.infer<typeof tourNegociationSchema>;

// Note auto-déclarée sur un critère d'évaluation technique (0-100, % du
// critère atteint) — alimente la simulation de note qui verrouille l'offre
// financière d'une demande de propositions (sprint S5, parcours expert v2,
// voir CLAUDE.md et note-technique-simulee.ts). Même borne 0-100 que
// pourcentageLibre(100), mais sans préprocess : le champ peut être vidé
// explicitement pour revenir à "non noté" (null), distinct d'une absence de
// clé dans le FormData.
export const noteSimuleeSchema = z.object({
  noteSimulee: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || /^\d+(\.\d+)?$/.test(v), { message: "Note invalide" })
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (v >= 0 && v <= 100), {
      message: "La note doit être comprise entre 0 et 100",
    }),
});

export const membreGroupementSchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, "Le nom est requis")
    .max(200, "Nom trop long (200 caractères maximum)"),
  role: z.enum(ROLES_MEMBRE_GROUPEMENT),
  // Borné à [0, 100] : contrairement au taux de frais de structure du
  // sous-projet BPU (un coefficient qui peut dépasser 100%), c'est un
  // pourcentage réel de répartition d'un marché — jamais > 100 pour un
  // seul membre.
  pourcentage: z
    .string()
    .nullable()
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Pourcentage invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v.trim()) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), {
      message: "Le pourcentage doit être compris entre 0 et 100",
    }),
});

export type MembreGroupementInput = z.infer<typeof membreGroupementSchema>;

// Conformité technique article par article (sprint S6, parcours expert v2,
// voir CLAUDE.md, Étape 5.2).

export const articleDaoSchema = z.object({
  numero: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 50, {
      message: "Numéro trop long (50 caractères maximum)",
    }),
  designation: z
    .string()
    .trim()
    .min(1, "La désignation est requise")
    .max(300, "Désignation trop longue (300 caractères maximum)"),
  unite: z
    .string()
    .trim()
    .min(1, "L'unité est requise")
    .max(20, "Unité trop longue (20 caractères maximum)"),
  quantite: z
    .string()
    .refine((v) => /^\d+(\.\d+)?$/.test(v.trim()), { message: "Quantité invalide" })
    .transform((v) => Number(v.trim()))
    .refine((v) => Number.isFinite(v) && v > 0, { message: "La quantité doit être positive" }),
  ligneBpuId: z.string().uuid().nullable(),
});

export type ArticleDaoInput = z.infer<typeof articleDaoSchema>;

const libelleSpecification = z
  .string()
  .trim()
  .min(1, "Le libellé est requis")
  .max(200, "Libellé trop long (200 caractères maximum)");

const uniteSpecificationNullable = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
  .refine((v) => v === null || v.length <= 20, {
    message: "Unité trop longue (20 caractères maximum)",
  });

export const ligneSpecificationSchema = z.object({
  libelle: libelleSpecification,
  operateur: z.enum(OPERATEURS_SPECIFICATION),
  valeur: z
    .string()
    .trim()
    .min(1, "La valeur est requise")
    .max(100, "Valeur trop longue (100 caractères maximum)"),
  unite: uniteSpecificationNullable,
  sourceSection: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
});

export type LigneSpecificationInput = z.infer<typeof ligneSpecificationSchema>;

export const produitSchema = z.object({
  marque: z
    .string()
    .trim()
    .min(1, "La marque est requise")
    .max(100, "Marque trop longue (100 caractères maximum)"),
  modele: z
    .string()
    .trim()
    .min(1, "Le modèle est requis")
    .max(100, "Modèle trop long (100 caractères maximum)"),
  reference: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 100, {
      message: "Référence trop longue (100 caractères maximum)",
    }),
});

export type ProduitInput = z.infer<typeof produitSchema>;

export const specificationProduitSchema = z.object({
  libelle: libelleSpecification,
  valeur: z
    .string()
    .trim()
    .min(1, "La valeur est requise")
    .max(100, "Valeur trop longue (100 caractères maximum)"),
  unite: uniteSpecificationNullable,
  sourceSection: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
});

export type SpecificationProduitInput = z.infer<typeof specificationProduitSchema>;

// Pièces jointes produit (fiche technique, autorisation fabricant,
// certificat d'étalonnage) — PDF/image, pas de DOC legacy (pas de contenu à
// normaliser en Markdown contrairement au modèle de CV : juste stockées et
// affichées).
const MIME_TYPES_PIECE_PRODUIT = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
] as const;

export const nomFichierPieceProduitSchema = z.object({
  nomOriginal: z.string().trim().min(1).max(255),
  mimeType: z.enum(MIME_TYPES_PIECE_PRODUIT),
});

export type NomFichierPieceProduitInput = z.infer<typeof nomFichierPieceProduitSchema>;

export const TYPES_PIECE_PRODUIT = [
  "fiche_technique",
  "autorisation_fabricant",
  "certificat_etalonnage",
] as const;
export type TypePieceProduit = (typeof TYPES_PIECE_PRODUIT)[number];

export const dateValiditePieceProduitSchema = z.object({
  dateValidite: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), {
      message: "Date invalide",
    }),
});

export const justificationKoSchema = z.object({
  justification: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 1000, {
      message: "Justification trop longue (1000 caractères maximum)",
    }),
});

export const conformiteForceeSchema = z.object({
  statut: z.enum(STATUTS_CONFORMITE),
  justification: z
    .string()
    .nullable()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
    .refine((v) => v === null || v.length <= 1000, {
      message: "Justification trop longue (1000 caractères maximum)",
    }),
});

export type ConformiteForceeInput = z.infer<typeof conformiteForceeSchema>;

// Références (sprint S7, parcours expert v2, voir CLAUDE.md, Étape 5.3).

// Tags libres saisis séparés par des virgules (contrairement à
// entreprise.secteurs_activite, liste fermée à 4 valeurs, voir CLAUDE.md —
// la nature d'une référence est un texte libre, pas une taxonomie produit)
// : trim + filtre des entrées vides, jamais de déduplication forcée ici
// (une nature répétée n'a pas d'effet néfaste sur un filtre par
// intersection).
function tagsLibres() {
  // preprocess (comme joursNullable/pourcentageLibre) : accepte aussi bien
  // une clé absente du FormData (anciens appels/fixtures de test écrits
  // avant l'ajout de ce champ) qu'une chaîne vide ou explicitement nulle.
  return z.preprocess(
    (v) => (typeof v === "string" ? v : null),
    z
      .string()
      .nullable()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      ),
  );
}

function entierPositifNullable() {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null),
    z
      .string()
      .nullable()
      .refine((v) => v === null || /^\d+$/.test(v), { message: "Nombre invalide" })
      .transform((v) => (v === null ? null : Number(v)))
      .refine((v) => v === null || v > 0, { message: "Le nombre doit être positif" }),
  );
}

export const referenceProjetSchema = z.object({
  clientNom: z
    .string()
    .trim()
    .min(1, "Le nom du client est requis")
    .max(200, "Nom du client trop long (200 caractères maximum)"),
  clientRccm: champOptionnel,
  clientDateCreation: champOptionnel,
  clientTelephone: champOptionnel,
  clientEmail: champOptionnel,
  clientAdresse: champOptionnel,
  objet: z
    .string()
    .trim()
    .min(1, "L'objet est requis")
    .max(300, "Objet trop long (300 caractères maximum)"),
  natureTags: tagsLibres(),
  montant: montantLibre(),
  role: z.enum(ROLES_REFERENCE),
  dateDebut: champOptionnel,
  dateFin: champOptionnel,
});

export type ReferenceProjetInput = z.infer<typeof referenceProjetSchema>;
