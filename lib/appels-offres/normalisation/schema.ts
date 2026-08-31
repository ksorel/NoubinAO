import { z } from "zod";
import { TYPES_EXIGENCE_AO } from "../types";

export const ExigenceExtraiteSchema = z.object({
  type_exigence: z.enum(TYPES_EXIGENCE_AO),
  libelle: z.string(),
  description: z.string().nullable(),
  ponderation: z.number().nullable(),
  source_section: z.string(),
});

export const ExtractionAoSchema = z.object({
  titre: z.string().nullable(),
  acheteur: z.string().nullable(),
  secteur: z.string().nullable(),
  date_limite: z.string().datetime().nullable(),
  montant_caution: z.number().nullable(),
  sommaire_attendu: z.array(z.string()),
  exigences: z.array(ExigenceExtraiteSchema),
});

export type ExtractionAo = z.infer<typeof ExtractionAoSchema>;
export type ExigenceExtraite = z.infer<typeof ExigenceExtraiteSchema>;
