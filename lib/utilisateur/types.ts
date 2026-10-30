export type RoleUtilisateur = "admin" | "membre";

export interface Invitation {
  id: string;
  role: RoleUtilisateur;
  expire_at: string;
}

// TEE = Taxe Estimée (pas de TVA) ; RSI/RNI = régimes imposables (TVA
// standard applicable) - voir CLAUDE.md "Spécificités Côte d'Ivoire".
export const REGIMES_FISCAUX = ["tee", "rsi", "rni"] as const;
export type RegimeFiscal = (typeof REGIMES_FISCAUX)[number];

export interface Entreprise {
  id: string;
  nom: string;
  rccm: string | null;
  adresse: string | null;
  representant_legal_nom: string | null;
  representant_legal_qualite: string | null;
  idu: string | null;
  telephone: string | null;
  email: string | null;
  taux_frais_structure_defaut: number | null;
  regime_fiscal: RegimeFiscal | null;
  secteurs_activite: string[];
  note_min_go_defaut: number;
  marge_min_visee_defaut: number;
  logo_path: string | null;
  logo_nom_original: string | null;
  logo_mime_type: string | null;
  cachet_path: string | null;
  cachet_nom_original: string | null;
  cachet_mime_type: string | null;
  signature_path: string | null;
  signature_nom_original: string | null;
  signature_mime_type: string | null;
  entete_gauche: string | null;
  entete_centre: string | null;
  entete_droite: string | null;
  pied_gauche: string | null;
  pied_centre: string | null;
  pied_droite: string | null;
  created_at: string;
}
