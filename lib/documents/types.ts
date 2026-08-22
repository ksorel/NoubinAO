export const TYPES_DOCUMENT = [
  "piece_administrative",
  "reference_projet",
  "cv",
  "agrement",
] as const;

export type TypeDocument = (typeof TYPES_DOCUMENT)[number];

export const TYPES_AVEC_EXPIRATION: TypeDocument[] = [
  "piece_administrative",
  "agrement",
];

export interface Document {
  id: string;
  entreprise_id: string;
  type: TypeDocument;
  nom: string;
  fichier_path: string;
  fichier_nom_original: string;
  mime_type: string;
  taille_octets: number;
  date_expiration: string | null;
  contenu_markdown: string | null;
  source_ocr: boolean | null;
  created_by: string | null;
  created_at: string;
}
