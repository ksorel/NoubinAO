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
// d'une pièce de bibliothèque (lib/documents/schema.ts). Vérifié en
// production (2026-09-23) : le fichier ne passe plus du tout par une
// Server Action — un vrai upload à cette taille se heurtait à la limite de
// corps de requête de la plateforme Vercel elle-même (~4,5 Mo), bien en
// dessous du bodySizeLimit Next.js (40 Mo, next.config.ts) qui ne
// gouverne qu'une limite applicative, pas la limite d'infrastructure. Le
// fichier est donc envoyé directement du navigateur vers Supabase Storage
// via une URL signée (voir demarrerUploadBomp/confirmerUploadBomp dans
// actions.ts) ; cette constante ne sert plus qu'à la validation
// côté client avant de démarrer cet envoi direct.
export const TAILLE_MAX_BOMP_OCTETS = 35 * 1024 * 1024; // 35 Mo

export const demarrerUploadBompSchema = z.object({
  nomFichier: z.string().trim().min(1, "Nom de fichier invalide"),
});

export const confirmerUploadBompSchema = z.object({
  numero: z.string().trim().min(1, "Le numéro est requis"),
  datePublication: z.string().trim().min(1, "La date est requise"),
  cheminStockage: z.string().trim().min(1, "Chemin de stockage invalide"),
});
