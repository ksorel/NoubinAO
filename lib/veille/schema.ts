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

// Une édition réelle du BOMP pèse ~23 Mo (n°1896, 240 pages) — bien
// au-dessus des 20 Mo d'un DAO (lib/appels-offres/schema.ts) et des 10 Mo
// d'une pièce de bibliothèque (lib/documents/schema.ts), d'où un plafond
// propre à ce document. Doit rester strictement sous le bodySizeLimit des
// Server Actions (40 Mo, next.config.ts) pour qu'un fichier trop gros
// remonte un message lisible plutôt qu'un rejet brut du framework.
export const TAILLE_MAX_BOMP_OCTETS = 35 * 1024 * 1024; // 35 Mo

export const uploaderBompSchema = z.object({
  numero: z.string().trim().min(1, "Le numéro est requis"),
  datePublication: z.string().trim().min(1, "La date est requise"),
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0, "Le fichier est requis")
    .refine(
      (f) => f.size <= TAILLE_MAX_BOMP_OCTETS,
      "Le fichier doit faire moins de 35 Mo",
    )
    .refine((f) => f.type === "application/pdf", "Le fichier doit être un PDF"),
});
