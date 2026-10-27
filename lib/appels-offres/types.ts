import type { TypeFichierDao } from "./normalisation/classification-fichier";

export const STATUTS_PIPELINE_AO = [
  "identifie",
  "en_preparation",
  "soumis",
  "en_attente",
  "gagne",
  "perdu",
  "sans_suite",
] as const;

export type StatutPipelineAo = (typeof STATUTS_PIPELINE_AO)[number];

export const RAISONS_RESULTAT_PERDU = [
  "prix_trop_eleve",
  "delai_manque",
  "criteres_techniques_non_respectes",
  "concurrent_mieux_positionne",
  "sans_reponse_acheteur",
  "autre",
] as const;

export const RAISONS_RESULTAT_GAGNE = [
  "prix_competitif",
  "references_solides",
  "relation_acheteur",
  "qualite_technique",
  "autre",
] as const;

// Union dédupliquée des deux listes ci-dessus, utilisée par le schéma zod
// (une seule contrainte, le filtrage par statut gagné/perdu reste une
// responsabilité de l'UI) et par la colonne appel_offres.raison_resultat.
export const RAISONS_RESULTAT_AO = [
  "prix_trop_eleve",
  "delai_manque",
  "criteres_techniques_non_respectes",
  "concurrent_mieux_positionne",
  "sans_reponse_acheteur",
  "prix_competitif",
  "references_solides",
  "relation_acheteur",
  "qualite_technique",
  "autre",
] as const;

export type RaisonResultatAo = (typeof RAISONS_RESULTAT_AO)[number];

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

// Gravité d'une exigence (parcours expert v2, voir CLAUDE.md) : remplace
// l'ancien booléen caché `est_eliminatoire` par un kind explicite, sur le
// modèle du `Requirement.kind` de la spec. Orthogonal à `type_exigence`
// (quoi : une pièce ou un critère) — `categorie_exigence` dit ce qui arrive
// en cas de non-respect.
// - eliminatoire : rejet automatique de l'offre (ancien est_eliminatoire=true)
// - qualification : condition obligatoire, pas noté mais pas automatiquement
//   éliminatoire non plus (seuil de recevabilité)
// - notee : contribue à la pondération (typiquement un critère d'évaluation)
// - formelle : simple pièce/condition administrative, sans enjeu particulier
export const CATEGORIES_EXIGENCE_AO = [
  "eliminatoire",
  "qualification",
  "notee",
  "formelle",
] as const;

export type CategorieExigenceAo = (typeof CATEGORIES_EXIGENCE_AO)[number];

// Profil procédure × canal de dépôt × type d'acheteur (parcours expert v2,
// voir CLAUDE.md) : pilote quelles pièces/formulaires/règles de contrôle
// s'appliquent à un AO. Les valeurs liées aux bailleurs (`bailleur`,
// `procedure_bailleur`, `portail_bailleur`) sont acceptées par le modèle
// dès maintenant mais ne sont pas détectées/activées en V1 (hors périmètre,
// voir CLAUDE.md) — uniquement pour ne pas avoir à migrer l'enum en V2.
export const TYPES_ACHETEUR_AO = [
  "public",
  "entreprise_publique",
  "bailleur",
  "prive",
  "ong",
] as const;

export type TypeAcheteurAo = (typeof TYPES_ACHETEUR_AO)[number];

export const PROCEDURES_AO = [
  "ao_ouvert",
  "ao_restreint",
  "ao_deux_etapes",
  "procedure_simplifiee",
  "gre_a_gre",
  "ami",
  "demande_propositions",
  "consultation_privee",
  "procedure_bailleur",
] as const;

export type ProcedureAo = (typeof PROCEDURES_AO)[number];

export const CANAUX_DEPOT_AO = [
  "sigomap",
  "papier",
  "email",
  "portail_acheteur",
  "portail_bailleur",
  "remise_main_propre",
] as const;

export type CanalDepotAo = (typeof CANAUX_DEPOT_AO)[number];

// Mode d'évaluation des offres (parcours expert v2, voir CLAUDE.md) :
// barème à points (l'écran affiche des barres de pondération) ou offre
// conforme la moins-disante (l'écran affiche une liste conforme/non
// conforme). Pilote l'affichage, pas encore de calcul (chiffrage = S5).
export const MODES_EVALUATION_AO = ["points", "conformite_moins_disant"] as const;

export type ModeEvaluationAo = (typeof MODES_EVALUATION_AO)[number];

export interface AppelOffres {
  id: string;
  entreprise_id: string;
  titre: string | null;
  acheteur: string | null;
  secteur: string | null;
  date_limite: string | null;
  montant_caution: number | null;
  // Informations de retrait du dossier, uniquement renseignées quand cet AO
  // vient d'un import du catalogue national (aucun fichier DAO joint : c'est
  // par ce contact que le client récupère le dossier complet).
  contact_retrait: string | null;
  statut_pipeline: StatutPipelineAo;
  statut_traitement: StatutTraitementAo;
  erreur_traitement: string | null;
  fichier_dao_path: string | null;
  fichier_dao_nom_original: string | null;
  modele_cv_path: string | null;
  modele_cv_nom_original: string | null;
  modele_cv_markdown: string | null;
  dao_markdown: string | null;
  sommaire_attendu: string[] | null;
  type_acheteur: TypeAcheteurAo | null;
  procedure_marche: ProcedureAo | null;
  canal_depot: CanalDepotAo | null;
  // Paramètres de prix (en %, non normalisés en ratio — voir migration) :
  // fourchette des offres anormalement basses/hautes, variation de
  // quantités admise, redevance de régulation ARCOP (public uniquement).
  // Pas encore consommés par un moteur de calcul (chiffrage = S5) : juste
  // affichés, pour l'instant.
  mode_evaluation: ModeEvaluationAo | null;
  fourchette_prix_basse: number | null;
  fourchette_prix_haute: number | null;
  // Estimation indicative (FCFA) servant de référence 100 % pour les
  // indicateurs chiffrage (sprint S5) : position du total HT dans la
  // fourchette ci-dessus. Saisie par l'entreprise, pas extraite du DAO.
  montant_estimatif: number | null;
  variation_quantite_hausse: number | null;
  variation_quantite_baisse: number | null;
  taux_redevance_reglementation: number | null;
  timbre_requis: boolean | null;
  // Chiffrage (sprint S5, parcours expert v2, voir CLAUDE.md) :
  // marge_plancher_pct avertit quand la marge globale du BPU (indicateurs
  // chiffrage) descend sous ce seuil, utile pour un gré à gré où la marge
  // peut être tirée vers le bas par la négociation. seuil_qualificatif_
  // technique_pct verrouille l'offre financière d'une demande de
  // propositions jusqu'à ce que la note technique simulée (critères
  // d'évaluation technique, pondération × note auto-déclarée) l'atteigne.
  marge_plancher_pct: number | null;
  seuil_qualificatif_technique_pct: number | null;
  // Date limite d'envoi des questions/demandes de clarification à
  // l'acheteur — distincte de date_limite (dépôt de l'offre).
  date_limite_questions: string | null;
  // Engagements (parcours expert v2, voir CLAUDE.md) : valeur exigée par le
  // DAO (extraite par IA, éditable) en regard de la valeur proposée par
  // l'entreprise dans son offre (saisie manuelle — pas encore de moteur de
  // génération F11/F12 automatique, vision cible de la spec pas construite).
  // Alimente le contrôle croisé ENG-01/02/03.
  delai_livraison_max_jours: number | null;
  delai_livraison_propose_jours: number | null;
  garantie_exigee_jours: number | null;
  garantie_proposee_jours: number | null;
  validite_offre_jours: number | null;
  validite_offre_propose_jours: number | null;
  assigne_a: string | null;
  created_by: string | null;
  raison_resultat: RaisonResultatAo | null;
  note_resultat: string | null;
  created_at: string;
}

export interface FichierDaoSupplementaire {
  id: string;
  appel_offres_id: string;
  chemin_stockage: string;
  nom_original: string;
  type_mime: string;
  type_classifie: TypeFichierDao | null;
  ordre: number;
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
  categorie_exigence: CategorieExigenceAo;
  // Note auto-déclarée (0-100, % du critère atteint), saisie uniquement sur
  // un critère d'évaluation technique — alimente la simulation de note qui
  // verrouille l'offre financière d'une demande de propositions (sprint S5,
  // parcours expert v2, voir CLAUDE.md et note-technique-simulee.ts). Sans
  // rapport avec `ponderation` (poids du critère dans le barème du DAO).
  note_simulee: number | null;
  created_at: string;
}

// Point flou du DAO (parcours expert v2, voir CLAUDE.md) : incohérence ou
// ambiguïté détectée à l'analyse (article présent dans un document mais pas
// un autre, renvoi vers une section vide, formulaire numéroté en double,
// unité/valeur ambiguë, quantité absente) — pas une exigence, juste un
// signal à faire lever par l'acheteur via la lettre de questions.
export interface PointFlouAo {
  id: string;
  appel_offres_id: string;
  description: string;
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

export const STATUTS_SECTION_DOSSIER = ["brouillon", "validee"] as const;

export type StatutSectionDossier = (typeof STATUTS_SECTION_DOSSIER)[number];

export interface SectionDossier {
  id: string;
  dossier_reponse_id: string;
  titre: string;
  contenu: string | null;
  statut: StatutSectionDossier;
  generated_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SectionDocument {
  id: string;
  section_dossier_id: string;
  document_id: string;
  created_at: string;
}

export const CLES_CHECKLIST_MANUELLE = [
  "pieces_signees",
  "prix_verifie",
  "depose_sigmap",
] as const;

export type CleChecklistManuelle = (typeof CLES_CHECKLIST_MANUELLE)[number];

export const CATEGORIES_QUESTION_GO_NO_GO = [
  "administratif",
  "savoir_faire",
  "ouverture_marche",
] as const;
export type CategorieQuestionGoNoGo = (typeof CATEGORIES_QUESTION_GO_NO_GO)[number];

export const REPONSES_GO_NO_GO = ["oui", "non", "a_confirmer"] as const;
export type ReponseGoNoGoValeur = (typeof REPONSES_GO_NO_GO)[number];

export interface TypeMarcheGoNoGo {
  id: string;
  entreprise_id: string;
  nom: string;
  actif: boolean;
  ordre: number;
  created_at: string;
}

export interface QuestionGoNoGo {
  id: string;
  entreprise_id: string;
  type_marche_id: string | null;
  categorie: CategorieQuestionGoNoGo;
  texte: string;
  ordre: number;
  actif: boolean;
  // Clé stable rattachant la question à une suggestion issue de la
  // bibliothèque documentaire ('agrement' | 'attestations'), null sinon.
  // Posée par le seed uniquement, jamais par la création côté admin.
  cle_suggestion: string | null;
  created_at: string;
}

export interface ReponseGoNoGo {
  id: string;
  go_no_go_id: string;
  question_id: string;
  texte_question_snapshot: string;
  reponse: ReponseGoNoGoValeur;
  commentaire: string | null;
  modifie_le: string;
}

export interface GoNoGo {
  id: string;
  appel_offres_id: string;
  type_marche_id: string | null;
  montant_marche_estime: number | null;
  cout_total_realisation: number | null;
  prix_dao: number | null;
  caution_soumission: number | null;
  frais_preparation: number | null;
  avance_pourcentage: number | null;
  delai_paiement_jours: number | null;
  argent_disponible_banque: number | null;
  note_interet_strategique: number | null;
  note_client_paie: number | null;
  note_concurrence: number | null;
  note_risques: number | null;
  commentaire_global: string | null;
  modifie_par: string | null;
  modifie_le: string;
}

// Questionnaire Go/No-Go : synthèse rapide du DAO générée par IA, pour
// aider la décision sans relire tout le document. Clés fixes, dans
// l'ordre d'affichage ; les libellés de question vivent dans les fichiers
// de traduction (AppelsOffres.detail.questionnaireGoNoGo.questions.*), pas
// ici, pour rester bilingues sans dupliquer le texte en base.
export const CLES_QUESTION_GO_NO_GO = [
  "facteurs_eliminatoires",
  "personnel_qualifie",
  "offre_technique",
  "offre_financiere",
  "references_requises",
  "garanties",
  "delai_contraintes",
  "points_vigilance",
] as const;

export type CleQuestionGoNoGo = (typeof CLES_QUESTION_GO_NO_GO)[number];

export interface ReponseSyntheseGoNoGo {
  cle: CleQuestionGoNoGo;
  reponse: string;
  source_section: string | null;
}

export interface SyntheseGoNoGo {
  id: string;
  appel_offres_id: string;
  reponses: ReponseSyntheseGoNoGo[];
  genere_par: string | null;
  genere_le: string;
}

export interface JalonRetroplanning {
  id: string;
  appel_offres_id: string;
  libelle: string;
  date_cible: string;
  coche: boolean;
  ordre: number;
  coche_par: string | null;
  coche_le: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SectionBpu {
  id: string;
  appel_offres_id: string;
  titre: string;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

export interface LigneBpu {
  id: string;
  section_bpu_id: string;
  code_article: string | null;
  designation: string;
  unite: string;
  quantite: number;
  prix_unitaire: number | null;
  debourse_sec: number | null;
  taux_frais_structure: number | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

export interface CotationFournisseur {
  id: string;
  ligne_bpu_id: string;
  fournisseur: string;
  prix: number;
  devise: string;
  delai_jours: number | null;
  validite_date: string | null;
  incoterm: string | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

// Historique des tours de négociation d'un gré à gré (sprint S5, parcours
// expert v2, voir CLAUDE.md) : chaque tour fige le montant proposé à ce
// stade, pour générer une lettre de proposition révisée qui référence le
// bon tour sans rouvrir une négociation déjà actée.
export interface TourNegociationGreAGre {
  id: string;
  appel_offres_id: string;
  numero: number;
  montant_propose: number;
  date_tour: string;
  commentaire: string | null;
  created_by: string | null;
  created_at: string;
}

export const ROLES_MEMBRE_GROUPEMENT = ["mandataire", "co_traitant"] as const;
export type RoleMembreGroupement = (typeof ROLES_MEMBRE_GROUPEMENT)[number];

export interface MembreGroupement {
  id: string;
  appel_offres_id: string;
  nom: string;
  role: RoleMembreGroupement;
  pourcentage: number | null;
  ordre: number;
  created_by: string | null;
  created_at: string;
}

// Mêmes 6 pièces que documentées dans CLAUDE.md (bibliothèque
// documentaire) — liste fixe, pas dérivée de TYPES_DOCUMENT (qui
// catégorise des fichiers uploadés, pas des exigences de suivi manuel
// sur une entreprise externe qui n'a pas de compte NoubinAO).
export const PIECES_GROUPEMENT = [
  "rccm",
  "carte_contribuable",
  "attestation_fiscale",
  "cnps",
  "non_faillite",
  "idu",
] as const;
export type ClePieceGroupement = (typeof PIECES_GROUPEMENT)[number];

export interface CvTransforme {
  id: string;
  appel_offres_id: string;
  document_id: string;
  contenu_markdown: string;
  export_path: string;
  genere_par: string | null;
  genere_le: string;
  created_at: string;
}
