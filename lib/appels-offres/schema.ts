import { z } from "zod";
import { MIME_TYPES_DAO_SUPPORTES } from "./normalisation/normaliser";
import { CRITERES_GO_NO_GO, STATUTS_PIPELINE_AO } from "./types";

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
