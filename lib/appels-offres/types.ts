export const STATUTS_PIPELINE_AO = [
  "identifie",
  "en_preparation",
  "soumis",
  "en_attente",
  "gagne",
  "perdu",
] as const;

export type StatutPipelineAo = (typeof STATUTS_PIPELINE_AO)[number];

export const STATUTS_TRAITEMENT_AO = [
  "en_attente",
  "normalisation",
  "extraction",
  "termine",
  "erreur",
] as const;

export type StatutTraitementAo = (typeof STATUTS_TRAITEMENT_AO)[number];

export const TYPES_EXIGENCE_AO = [
  "piece_requise",
  "critere_evaluation",
] as const;

export type TypeExigenceAo = (typeof TYPES_EXIGENCE_AO)[number];

export interface AppelOffres {
  id: string;
  entreprise_id: string;
  titre: string | null;
  acheteur: string | null;
  secteur: string | null;
  date_limite: string | null;
  montant_caution: number | null;
  statut_pipeline: StatutPipelineAo;
  statut_traitement: StatutTraitementAo;
  erreur_traitement: string | null;
  fichier_dao_path: string;
  fichier_dao_nom_original: string;
  dao_markdown: string | null;
  sommaire_attendu: string[] | null;
  created_by: string | null;
  created_at: string;
}

export interface ExigenceAo {
  id: string;
  appel_offres_id: string;
  type_exigence: TypeExigenceAo;
  libelle: string;
  description: string | null;
  ponderation: number | null;
  source_section: string | null;
  created_at: string;
}

export const STATUTS_RELECTURE_DOSSIER = ["brouillon", "relu", "exporte"] as const;

export type StatutRelectureDossier = (typeof STATUTS_RELECTURE_DOSSIER)[number];

export interface DossierReponse {
  id: string;
  appel_offres_id: string;
  statut_relecture: StatutRelectureDossier;
  export_path: string | null;
  exporte_le: string | null;
  created_at: string;
}

export interface ExigenceDocument {
  id: string;
  exigence_ao_id: string;
  document_id: string;
  created_by: string | null;
  created_at: string;
}
