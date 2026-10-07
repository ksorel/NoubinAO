export type RoleUtilisateur = "admin" | "membre";

export interface Invitation {
  id: string;
  role: RoleUtilisateur;
  expire_at: string;
}

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
  secteurs_activite: string[];
  created_at: string;
}
