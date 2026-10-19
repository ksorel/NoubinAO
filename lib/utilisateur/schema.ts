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

const zoneEnTetePiedPage = champTexteOptionnel.pipe(z.string().max(300, "300 caractères maximum").nullable());

export const entetePiedPageSchema = z.object({
  enteteGauche: zoneEnTetePiedPage,
  enteteCentre: zoneEnTetePiedPage,
  enteteDroite: zoneEnTetePiedPage,
  piedGauche: zoneEnTetePiedPage,
  piedCentre: zoneEnTetePiedPage,
  piedDroite: zoneEnTetePiedPage,
});
export type EntetePiedPageInput = z.infer<typeof entetePiedPageSchema>;

export const televerserLogoSchema = z.object({
  fichier: z
    .instanceof(File)
    .refine((f) => f.size > 0 && f.size <= 5 * 1024 * 1024, {
      message: "Le logo doit faire moins de 5 Mo",
    })
    .refine((f) => ["image/png", "image/jpeg"].includes(f.type), {
      message: "Format non accepté (PNG ou JPEG uniquement)",
    }),
});

export const creerInvitationSchema = z.object({
  role: z.enum(["admin", "membre"]),
});
export type CreerInvitationInput = z.infer<typeof creerInvitationSchema>;

export const rejoindreEntrepriseSchema = z.object({
  token: z.string().trim().min(1, "Lien d'invitation invalide"),
  nom: z.string().trim().min(1, "Votre nom est requis").max(200),
});
export type RejoindreEntrepriseInput = z.infer<typeof rejoindreEntrepriseSchema>;

export const changerEntrepriseActiveSchema = z.object({
  // z.string().guid() plutôt que .uuid() : sur Zod 4.4.3 installé ici, .uuid()
  // impose le format RFC 4122 strict (nibble de variante 8-b), que .guid()
  // n'exige pas tout en validant la même forme hexadécimale à tirets.
  entrepriseId: z.string().guid("Identifiant d'entreprise invalide"),
});
export type ChangerEntrepriseActiveInput = z.infer<typeof changerEntrepriseActiveSchema>;
