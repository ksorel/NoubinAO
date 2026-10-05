import type { Entreprise } from "@/lib/utilisateur/types";
import type { AppelOffres } from "./types";
import type { Document } from "@/lib/documents/types";
import { formaterMontant } from "./bpu";

export const TYPES_FORMULAIRE_STANDARD = [
  "lettre_soumission",
  "declaration_honneur",
  "pouvoir_habilitant",
  "formulaire_identification",
  "tableau_personnel",
  "tableau_materiel",
] as const;

export type TypeFormulaireStandard = (typeof TYPES_FORMULAIRE_STANDARD)[number];

// Même patron que deviserTypeDocumentPrefere (suggestion-document.ts) :
// mots-clés sur le libellé en texte libre extrait du DAO, pas de
// classification IA tant qu'une règle simple suffit.
export function identifierFormulaireStandard(libelle: string): TypeFormulaireStandard | null {
  const l = libelle.toLowerCase();
  if (l.includes("lettre de soumission")) return "lettre_soumission";
  if (l.includes("déclaration sur l'honneur") || l.includes("declaration sur l'honneur")) {
    return "declaration_honneur";
  }
  // "pouvoir(s) habilitant" : le DAO ivoirien utilise indifféremment le
  // singulier et le pluriel pour ce même document (ex. "Pouvoirs habilitant
  // du soumissionnaire") — un simple .includes("pouvoir habilitant") rate
  // le pluriel car le "s" casse la correspondance de sous-chaîne.
  if (l.includes("pouvoir habilitant") || l.includes("pouvoirs habilitant")) {
    return "pouvoir_habilitant";
  }
  if (
    l.includes("identification du soumissionnaire") ||
    l.includes("renseignements sur le soumissionnaire") ||
    l.includes("fiche de renseignements")
  ) {
    return "formulaire_identification";
  }
  if (
    l.includes("tableau du personnel") ||
    l.includes("liste du personnel") ||
    l.includes("tableau de l'équipe") ||
    l.includes("tableau de l'equipe")
  ) {
    return "tableau_personnel";
  }
  if (l.includes("tableau du matériel") || l.includes("tableau du materiel")) {
    return "tableau_materiel";
  }
  return null;
}

function valeurOu(champ: string | null, remplacement = "[à compléter]"): string {
  return champ && champ.trim().length > 0 ? champ : remplacement;
}

export function genererLettreSoumission(
  entreprise: Entreprise,
  appelOffres: AppelOffres,
  montantTotalBpu: number | null,
  lignesNonChiffrees: number,
): string {
  const montant =
    lignesNonChiffrees > 0
      ? `[montant à compléter — ${lignesNonChiffrees} ligne(s) du BPU non chiffrée(s)]`
      : montantTotalBpu !== null && montantTotalBpu > 0
        ? `${formaterMontant(montantTotalBpu)} FCFA`
        : "[montant à compléter]";

  return `LETTRE DE SOUMISSION

Objet : ${valeurOu(appelOffres.titre)}
Maître d'ouvrage : ${valeurOu(appelOffres.acheteur)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom}, immatriculée au RCCM sous le numéro ${valeurOu(entreprise.rccm)}, dont le siège est situé à ${valeurOu(entreprise.adresse)}, après avoir pris connaissance du Dossier d'Appel d'Offres relatif au marché ci-dessus désigné, m'engage à exécuter les prestations conformément aux clauses et conditions dudit dossier, pour un montant total de ${montant}.

Fait à _________________, le _________________.

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}

export function genererDeclarationHonneur(entreprise: Entreprise, appelOffres: AppelOffres): string {
  return `DÉCLARATION SUR L'HONNEUR

Objet : ${valeurOu(appelOffres.titre)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom} (RCCM ${valeurOu(entreprise.rccm)}, IDU ${valeurOu(entreprise.idu)}), déclare sur l'honneur :

- que l'entreprise n'est pas sous le coup d'une interdiction de participer aux marchés publics ;
- que l'entreprise n'est pas en état de faillite, de liquidation ou de cessation d'activité ;
- que les informations et pièces fournies dans le cadre de la présente offre sont exactes et sincères ;
- que l'entreprise s'engage à respecter la réglementation en vigueur en matière de marchés publics et à n'exercer ni offrir aucune forme de corruption dans le cadre de la présente procédure.

Fait à _________________, le _________________.

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}

export function genererPouvoirHabilitant(entreprise: Entreprise, appelOffres: AppelOffres): string {
  return `POUVOIR HABILITANT

Objet : ${valeurOu(appelOffres.titre)}

Je soussigné(e), ${valeurOu(entreprise.representant_legal_nom)}, agissant en qualité de ${valeurOu(entreprise.representant_legal_qualite)} de l'entreprise ${entreprise.nom}, immatriculée au RCCM sous le numéro ${valeurOu(entreprise.rccm)}, donne par la présente pouvoir à [à compléter — nom et qualité du signataire habilité] à l'effet de signer, au nom et pour le compte de l'entreprise, tous documents relatifs à la présente procédure de passation de marché, et notamment l'offre déposée en réponse à l'appel d'offres susvisé.

Fait à [à compléter], le [à compléter].

Le représentant légal,
${valeurOu(entreprise.representant_legal_nom)}`;
}

export function genererFormulaireIdentification(
  entreprise: Entreprise,
  appelOffres: AppelOffres,
): string {
  return `FORMULAIRE D'IDENTIFICATION DU SOUMISSIONNAIRE

Objet : ${valeurOu(appelOffres.titre)}
Maître d'ouvrage : ${valeurOu(appelOffres.acheteur)}

Raison sociale : ${entreprise.nom}
RCCM : ${valeurOu(entreprise.rccm)}
IDU : ${valeurOu(entreprise.idu)}
Adresse du siège : ${valeurOu(entreprise.adresse)}
Téléphone : ${valeurOu(entreprise.telephone)}
Email : ${valeurOu(entreprise.email)}
Représentant légal : ${valeurOu(entreprise.representant_legal_nom)}
Qualité du représentant légal : ${valeurOu(entreprise.representant_legal_qualite)}`;
}

// Pas d'extraction de champs (nom/rôle/expérience pour une CV, désignation/
// quantité pour du matériel) : le contenu des documents de bibliothèque est
// un texte libre non structuré, et une extraction par IA serait un nouveau
// sous-système à part entière (coût, fiabilité à valider sur échantillon
// réel) — hors scope de cette extension. V1 : liste simplement, de façon
// traçable, les documents déjà associés à cette pièce (voir
// DocumentsExigence) ; le dossier le complète avec le détail.
export function genererTableauDocuments(documents: Document[], titre: string): string {
  if (documents.length === 0) {
    return `${titre}

Aucun document associé pour l'instant — associez les CV ou la liste de matériel correspondants à cette pièce, puis régénérez ce tableau.`;
  }

  const lignes = documents.map(
    (d) => `| ${d.nom} | ${new Date(d.created_at).toLocaleDateString("fr-FR")} |`,
  );

  return `${titre}

| Document | Ajouté le |
|---|---|
${lignes.join("\n")}`;
}
