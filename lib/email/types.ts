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

export interface Email {
  id: string;
  entreprise_id: string;
  utilisateur_id: string;
  compte_email_connecte_id: string;
  appel_offres_id: string | null;
  message_id_gmail: string;
  expediteur: string | null;
  destinataires: string | null;
  objet: string | null;
  contenu: string | null;
  pieces_jointes: { nom: string; tailleOctets: number; typeMime: string }[];
  recu_le: string | null;
  created_at: string;
}
