import { z } from "zod";
import { TYPES_AVIS_AO_NATIONAL } from "./types";

export const AvisStructureSchema = z.object({
  type: z.enum(TYPES_AVIS_AO_NATIONAL).nullable(),
  autorite_contractante: z.string().nullable(),
  objet: z.string().nullable(),
  secteur: z.string().nullable(),
  montant_caution: z.number().nullable(),
  date_limite_remise_offres: z.string().nullable(),
  contact_retrait: z.string().nullable(),
  nombre_lots: z.number().nullable(),
});
export type AvisStructure = z.infer<typeof AvisStructureSchema>;

export const uploaderBompSchema = z.object({
  numero: z.string().trim().min(1, "Le numéro est requis"),
  datePublication: z.string().trim().min(1, "La date est requise"),
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0, "Le fichier est requis")
    .refine((f) => f.type === "application/pdf", "Le fichier doit être un PDF"),
});
