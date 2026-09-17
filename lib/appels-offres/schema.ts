import { z } from "zod";
import { MIME_TYPES_DAO_SUPPORTES } from "./normalisation/normaliser";
import { CRITERES_GO_NO_GO, ROLES_MEMBRE_GROUPEMENT, STATUTS_PIPELINE_AO } from "./types";

const TAILLE_MAX_OCTETS = 20 * 1024 * 1024; // 20 Mo

export const televerserDaoSchema = z.object({
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
      message: "Le fichier doit faire moins de 20 Mo",
    })
    .refine(
      (f) => (MIME_TYPES_DAO_SUPPORTES as readonly string[]).includes(f.type),
      { message: "Type de fichier non accepté (PDF ou DOCX uniquement)" },
    ),
});

export type TeleverserDaoInput = z.infer<typeof televerserDaoSchema>;

const champOptionnel = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null));

export const modifierAppelOffresSchema = z.object({
  titre: champOptionnel,
  acheteur: champOptionnel,
  secteur: champOptionnel,
  dateLimite: champOptionnel,
  montantCaution: z
    .string()
    .nullable()
    // `Number.isFinite` seul acceptait un montant négatif ("-500" est un
    // nombre fini) et la notation scientifique ("1e10" et "10000000000"
    // donnent le même nombre fini une fois convertis, donc indistinguables
    // après coup) — un montant de caution saisi par erreur en notation
    // scientifique passait silencieusement. Le format de la chaîne source
    // est donc vérifié avant conversion : uniquement des chiffres, avec au
    // plus une décimale, jamais de signe ni d'exposant.
    .refine((v) => v === null || v.trim().length === 0 || /^\d+(\.\d+)?$/.test(v.trim()), {
      message: "Montant invalide",
    })
    .transform((v) => (v && v.trim().length > 0 ? Number(v) : null))
    .refine((v) => v === null || Number.isFinite(v), {
      message: "Montant invalide",
    }),
});

export type ModifierAppelOffresInput = z.infer<typeof modifierAppelOffresSchema>;

export const modifierStatutPipelineSchema = z.object({
  statutPipeline: z.enum(STATUTS_PIPELINE_AO),
});

// Contrairement à `champOptionnel` (partagé avec modifierAppelOffresSchema,
// sans limite de longueur), les notes Go/No-Go imposent une longueur
// maximale : la Server Action mettreAJourEvaluationGoNoGo peut être
// appelée directement (hors UI), qui n'impose elle-même aucune limite de
// saisie sur le <Textarea>.
const noteGoNoGo = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null))
  .refine((v) => v === null || v.length <= 2000, {
    message: "Note trop longue (2000 caractères maximum)",
  });

export const mettreAJourEvaluationGoNoGoSchema = z.object({
  critereJuridique: z.enum(CRITERES_GO_NO_GO),
  noteJuridique: noteGoNoGo,
  critereFaisabilite: z.enum(CRITERES_GO_NO_GO),
  noteFaisabilite: noteGoNoGo,
  critereRentabilite: z.enum(CRITERES_GO_NO_GO),
  noteRentabilite: noteGoNoGo,
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
