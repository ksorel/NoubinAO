import { z } from "zod";

export const PieceRequiseSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  source: z.string(),
});

export const CritereEvaluationSchema = z.object({
  critere: z.string(),
  ponderation: z.number().nullable(),
  source: z.string(),
});

export const ExtractionDaoSchema = z.object({
  pieces_requises: z.array(PieceRequiseSchema),
  criteres_evaluation: z.array(CritereEvaluationSchema),
  sommaire_attendu: z.array(z.string()),
  delai_depot: z.string().nullable(),
});

export type ExtractionDao = z.infer<typeof ExtractionDaoSchema>;
