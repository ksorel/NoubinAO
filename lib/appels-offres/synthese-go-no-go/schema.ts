import { z } from "zod";
import { CLES_QUESTION_GO_NO_GO } from "../types";

export const ReponseSyntheseExtraiteSchema = z.object({
  cle: z.enum(CLES_QUESTION_GO_NO_GO),
  reponse: z.string(),
  source_section: z.string().nullable(),
});

export const SyntheseGoNoGoExtraiteSchema = z.object({
  reponses: z.array(ReponseSyntheseExtraiteSchema),
});

export type ReponseSyntheseExtraite = z.infer<typeof ReponseSyntheseExtraiteSchema>;
export type SyntheseGoNoGoExtraite = z.infer<typeof SyntheseGoNoGoExtraiteSchema>;
