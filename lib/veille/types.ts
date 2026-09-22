export const TYPES_AVIS_AO_NATIONAL = [
  "travaux",
  "fournitures",
  "prestations",
  "manifestation_interet",
] as const;
export type TypeAvisAoNational = (typeof TYPES_AVIS_AO_NATIONAL)[number];

export type StatutTraitementBomp =
  | "en_attente"
  | "extraction_en_cours"
  | "termine"
  | "erreur";

export interface BompNumero {
  id: string;
  numero: string;
  date_publication: string;
  fichier_path: string;
  statut: StatutTraitementBomp;
  nombre_avis_extraits: number;
  erreur_message: string | null;
  cree_par: string;
  cree_le: string;
  mis_a_jour_le: string;
}

export interface AvisAoNational {
  id: string;
  bomp_numero_id: string;
  reference: string;
  type: TypeAvisAoNational | null;
  autorite_contractante: string | null;
  objet: string | null;
  secteur: string | null;
  montant_caution: number | null;
  date_limite_remise_offres: string | null;
  contact_retrait: string | null;
  nombre_lots: number | null;
  texte_brut: string;
  cree_le: string;
  // Horodatage de la structuration IA réussie, null tant qu'elle n'a pas
  // eu lieu. Ne pas déduire cet état de `type` : il est légitimement
  // nullable (voir structuration-avis.ts).
  structure_le: string | null;
}
