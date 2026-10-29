import type { ReferenceProjet } from "./types";
import type { Entreprise } from "@/lib/utilisateur/types";
import type { Document } from "@/lib/documents/types";

// Contrôles d'intégrité des références (sprint S7, parcours expert v2, voir
// CLAUDE.md, Étape 5.3) : bloquent l'insertion d'une pièce suspecte, ne
// suppriment rien - chaque drapeau est affiché, à l'utilisateur de corriger
// ou de joindre un justificatif supplémentaire (voir REF-02).

export interface AlertesIntegriteReference {
  // Le client n'existait pas encore au début du marché cité.
  clientAnterieurAuDebut: boolean;
  // Coordonnées du "client" identiques à celles du soumissionnaire -
  // signe qu'une référence cite en réalité sa propre entreprise.
  coordonneesPartagees: boolean;
  // ABE dans un format éditable (DOCX/DOC), sans passer par un scan -
  // signature manuscrite improbable.
  abeFormatEditableSansSignature: boolean;
  // date_debut/date_fin modifiées depuis la première importation.
  periodeModifiee: boolean;
}

function normaliser(texte: string): string {
  return texte.trim().toLowerCase();
}

function coordonneePartagee(valeurReference: string | null, valeurEntreprise: string | null): boolean {
  if (!valeurReference || !valeurEntreprise) return false;
  return normaliser(valeurReference) === normaliser(valeurEntreprise);
}

// Dupliqués plutôt qu'importés de lib/appels-offres/normalisation/normaliser.ts
// (MIME_DOCX) et lib/documents/normalisation.ts (MIME_DOC_LEGACY) - même
// raison que televerser-dao-dialog.tsx : ces modules serveur tirent
// pdfjs-dist/mammoth/word-extractor (dont des dépendances Node pures comme
// "fs"), trop lourds et incompatibles navigateur pour reference-row.tsx, qui
// appelle calculerAlertesIntegrite côté client pour l'affichage en direct.
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_DOC_LEGACY = "application/msword";
const MIME_FORMATS_EDITABLES: string[] = [MIME_DOCX, MIME_DOC_LEGACY];

export function calculerAlertesIntegrite(
  reference: Pick<
    ReferenceProjet,
    | "client_date_creation"
    | "date_debut"
    | "date_fin"
    | "date_debut_origine"
    | "date_fin_origine"
    | "client_telephone"
    | "client_email"
    | "client_adresse"
  >,
  entreprise: Pick<Entreprise, "telephone" | "email" | "adresse">,
  abeDocument: Pick<Document, "mime_type"> | null,
): AlertesIntegriteReference {
  const clientAnterieurAuDebut =
    reference.client_date_creation !== null &&
    reference.date_debut !== null &&
    new Date(reference.client_date_creation) > new Date(reference.date_debut);

  const coordonneesPartagees =
    coordonneePartagee(reference.client_telephone, entreprise.telephone) ||
    coordonneePartagee(reference.client_email, entreprise.email) ||
    coordonneePartagee(reference.client_adresse, entreprise.adresse);

  const abeFormatEditableSansSignature =
    abeDocument !== null && MIME_FORMATS_EDITABLES.includes(abeDocument.mime_type);

  const periodeModifiee =
    (reference.date_debut_origine !== null && reference.date_debut !== reference.date_debut_origine) ||
    (reference.date_fin_origine !== null && reference.date_fin !== reference.date_fin_origine);

  return {
    clientAnterieurAuDebut,
    coordonneesPartagees,
    abeFormatEditableSansSignature,
    periodeModifiee,
  };
}

export function aUneAlerte(alertes: AlertesIntegriteReference): boolean {
  return (
    alertes.clientAnterieurAuDebut ||
    alertes.coordonneesPartagees ||
    alertes.abeFormatEditableSansSignature ||
    alertes.periodeModifiee
  );
}

// Recevable seulement avec une ABE et au moins un justificatif (spec 5.3) -
// aucune condition sur les alertes d'intégrité : celles-ci avertissent,
// elles ne bloquent pas l'insertion (seul REF-02, en aval, les signale).
export function estReferenceRecevable(aAbe: boolean, nombreJustificatifs: number): boolean {
  return aAbe && nombreJustificatifs > 0;
}
