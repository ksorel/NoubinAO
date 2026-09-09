export const FOURNISSEURS_EMAIL = ["gmail", "outlook"] as const;
export type FournisseurEmail = (typeof FOURNISSEURS_EMAIL)[number];

export const STATUTS_COMPTE_EMAIL = ["connecte", "revoque", "erreur"] as const;
export type StatutCompteEmail = (typeof STATUTS_COMPTE_EMAIL)[number];

export interface CompteEmailConnecte {
  id: string;
  utilisateur_id: string;
  entreprise_id: string;
  fournisseur: FournisseurEmail;
  adresse_email: string;
  refresh_token_chiffre: string;
  access_token_chiffre: string | null;
  expire_le: string | null;
  statut: StatutCompteEmail;
  created_at: string;
  updated_at: string;
}
