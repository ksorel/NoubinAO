export const TYPES_AVIS_AO_NATIONAL = [
  "travaux",
  "fournitures",
  "prestations",
  "manifestation_interet",
] as const;
export type TypeAvisAoNational = (typeof TYPES_AVIS_AO_NATIONAL)[number];

export interface BompNumero {
  id: string;
  numero: string;
  date_publication: string;
  fichier_path: string;
  statut: string;
  nombre_avis_extraits: number;
  erreur_message: string | null;
  cree_par: string;
  cree_le: string;
  mis_a_jour_le: string;
}

export interface AvisAoNational {
  id: string;
  // Nullable : un avis scrapé depuis marchespublics.ci n'appartient à
  // aucune édition BOMP (voir migration 20260929120000). Seul un avis
  // issu de l'ancien pipeline BOMP (retiré) renseigne cette colonne.
  bomp_numero_id: string | null;
  reference: string;
  type: TypeAvisAoNational | null;
  autorite_contractante: string | null;
  objet: string | null;
  secteur: string | null;
  montant_caution: number | null;
  date_limite_remise_offres: string | null;
  contact_retrait: string | null;
  nombre_lots: number | null;
  // Nullable : un avis scrapé n'a pas de fragment de texte source à
  // conserver pour traçabilité, contrairement à un avis BOMP extrait d'un
  // bloc de texte libre (voir migration 20260929120000).
  texte_brut: string | null;
  cree_le: string;
  // Horodatage de la structuration IA réussie, null tant qu'elle n'a pas
  // eu lieu. Ne pas déduire cet état de `type` : il est légitimement
  // nullable (voir l'ancienne structuration IA, pipeline BOMP, retiré).
  structure_le: string | null;
}

export type StatutExecutionVeille = "succes" | "erreur";

export interface VeilleExecution {
  id: string;
  execute_le: string;
  statut: StatutExecutionVeille;
  nombre_ao_trouves: number | null;
  nombre_nouveaux_ao: number | null;
  erreur_message: string | null;
}
