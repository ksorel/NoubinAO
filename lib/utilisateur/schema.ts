import { z } from "zod";
import { SECTEURS_CIBLES } from "@/lib/veille/classification-secteur";

const champTexteOptionnel = z
  .string()
  .nullable()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : null));

export const modifierProfilEntrepriseSchema = z.object({
  nom: z.string().trim().min(1, "Le nom de l'entreprise est requis").max(200),
  rccm: champTexteOptionnel,
  adresse: champTexteOptionnel,
  representantLegalNom: champTexteOptionnel,
  representantLegalQualite: champTexteOptionnel,
  idu: champTexteOptionnel,
  telephone: champTexteOptionnel,
  email: champTexteOptionnel,
  secteursActivite: z.array(z.enum(SECTEURS_CIBLES)),
});

export type ModifierProfilEntrepriseInput = z.infer<typeof modifierProfilEntrepriseSchema>;

export const creerInvitationSchema = z.object({
  role: z.enum(["admin", "membre"]),
});
export type CreerInvitationInput = z.infer<typeof creerInvitationSchema>;

export const rejoindreEntrepriseSchema = z.object({
  token: z.string().trim().min(1, "Lien d'invitation invalide"),
  nom: z.string().trim().min(1, "Votre nom est requis").max(200),
});
export type RejoindreEntrepriseInput = z.infer<typeof rejoindreEntrepriseSchema>;
