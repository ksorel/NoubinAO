import { z } from "zod";
import { MIME_TYPES_DAO_SUPPORTES } from "./normalisation/normaliser";

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
