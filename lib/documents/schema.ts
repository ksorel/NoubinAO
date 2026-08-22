import { z } from "zod";
import { TYPES_DOCUMENT, TYPES_AVEC_EXPIRATION } from "./types";

const TAILLE_MAX_OCTETS = 10 * 1024 * 1024;
const TYPES_MIME_ACCEPTES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

export const documentUploadSchema = z
  .object({
    type: z.enum(TYPES_DOCUMENT),
    nom: z.string().trim().min(1, "Le nom est requis").max(200),
    dateExpiration: z.string().date().optional().nullable(),
    fichier: z
      .instanceof(File)
      .refine((f) => f.size > 0 && f.size <= TAILLE_MAX_OCTETS, {
        message: "Le fichier doit faire moins de 10 Mo",
      })
      .refine((f) => TYPES_MIME_ACCEPTES.includes(f.type), {
        message: "Type de fichier non accepté",
      }),
  })
  .refine(
    (data) =>
      !TYPES_AVEC_EXPIRATION.includes(data.type) || !!data.dateExpiration,
    {
      message: "La date d'expiration est requise pour ce type de document",
      path: ["dateExpiration"],
    },
  );

export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
