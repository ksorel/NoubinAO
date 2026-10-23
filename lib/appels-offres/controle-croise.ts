import type { ExigenceAo, LigneBpu, SectionDossier } from "./types";
import type { Document } from "@/lib/documents/types";
import { compterLignesNonChiffrees } from "./bpu";

// Contrôle croisé (parcours expert v2, voir CLAUDE.md) : relit le dossier
// comme la commission, avant elle — catalogue de règles par famille
// (MNT/EXH/ENG/TEC/IDN/PER/SIG/DAT/VAL/SAI/FMT/CAN/PRC dans la spec), dont
// seule la famille EXH (exhaustivité) est construite pour l'instant : les
// autres dépendent d'une modélisation pas encore en place (ex. MNT compare
// des montants F4/DQE/F3 qui n'existent pas comme entités distinctes ici,
// SAI scanne le texte des pièces jointes).

export const SEVERITES_CONTROLE = ["bloquante", "avertissement", "info"] as const;
export type SeveriteControle = (typeof SEVERITES_CONTROLE)[number];

export interface ResultatControle {
  id: string;
  severite: SeveriteControle;
  ok: boolean;
  /** Nombre d'éléments concernés (0 si ok), pour un message type "2 lignes sans prix". */
  nombre: number;
}

export function calculerControleExhaustivite(
  exigences: ExigenceAo[],
  documentsParExigence: Record<string, Document[]>,
  lignesBpu: Pick<LigneBpu, "quantite" | "prix_unitaire">[],
): ResultatControle[] {
  const piecesRequises = exigences.filter((e) => e.type_exigence === "piece_requise");
  const piecesManquantes = piecesRequises.filter(
    (e) => (documentsParExigence[e.id] ?? []).length === 0,
  ).length;

  const lignesNonChiffrees = compterLignesNonChiffrees(lignesBpu);

  return [
    {
      id: "EXH-01",
      severite: "bloquante",
      ok: lignesNonChiffrees === 0,
      nombre: lignesNonChiffrees,
    },
    {
      id: "EXH-02",
      severite: "bloquante",
      ok: piecesManquantes === 0,
      nombre: piecesManquantes,
    },
  ];
}

// Même collecte de documents utilisés que calculerChecklistAutomatique
// (checklist.ts), mais comparée à la date de dépôt plutôt qu'à "maintenant" :
// un document encore valide aujourd'hui mais qui expirera avant le dépôt
// reste un vrai problème que la checklist actuelle ne détecte pas.
export function calculerControleValidite(
  documentsParExigence: Record<string, Document[]>,
  dateDepot: Date,
): ResultatControle[] {
  const documentsUtilises = new Map<string, Document>();
  for (const docs of Object.values(documentsParExigence)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }

  const documentsPerimes = Array.from(documentsUtilises.values()).filter(
    (doc) => doc.date_expiration !== null && new Date(doc.date_expiration) < dateDepot,
  ).length;

  return [
    {
      id: "VAL-01",
      severite: "bloquante",
      ok: documentsPerimes === 0,
      nombre: documentsPerimes,
    },
  ];
}

// Motifs volontairement étroits et ancrés sur les cas réels documentés dans
// la spec plutôt que des heuristiques larges ("..." seul, trop courant dans
// une prose normale, n'est pas retenu) : mieux vaut sous-détecter que noyer
// l'utilisateur sous de faux positifs sur une heuristique encore jamais
// éprouvée sur un échantillon réel.
const MOTIFS_TEXTE_EXEMPLE: RegExp[] = [
  /ins[ée]rer\s/i,
  /\(\s*indiquer\b/i,
  /\[\s*[àa]\s*compl[ée]ter\s*\]/i,
  // 4 points/points de suspension consécutifs ou plus : ligne à blanc à
  // remplir ("………"), distingué des "..." isolés d'une prose normale.
  /[.…]{4,}/,
];

// Un seul cas réel documenté ("OPTION (Section III…)") : motif délibérément
// étroit, à élargir seulement si d'autres cas réels l'exigent.
const MOTIFS_NOTE_INTERNE: RegExp[] = [/\boption\s*\(/i];

function texteContientMotif(texte: string | null, motifs: RegExp[]): boolean {
  if (!texte) return false;
  return motifs.some((motif) => motif.test(texte));
}

// Scanne le texte qui part effectivement dans le dossier exporté : les
// documents de bibliothèque rattachés à une pièce requise, et les sections
// rédigées (narratives). N'inclut pas documentsParSection (matériel source
// de la rédaction assistée, pas lui-même exporté tel quel).
export function calculerControleSaisie(
  documentsParExigence: Record<string, Document[]>,
  sections: Pick<SectionDossier, "contenu">[],
): ResultatControle[] {
  const documentsUtilises = new Map<string, Document>();
  for (const docs of Object.values(documentsParExigence)) {
    for (const doc of docs) documentsUtilises.set(doc.id, doc);
  }

  const textes: (string | null)[] = [
    ...Array.from(documentsUtilises.values()).map((doc) => doc.contenu_markdown),
    ...sections.map((section) => section.contenu),
  ];

  const nombreTexteExemple = textes.filter((texte) =>
    texteContientMotif(texte, MOTIFS_TEXTE_EXEMPLE),
  ).length;
  const nombreNoteInterne = textes.filter((texte) =>
    texteContientMotif(texte, MOTIFS_NOTE_INTERNE),
  ).length;

  return [
    {
      id: "SAI-01",
      severite: "bloquante",
      ok: nombreTexteExemple === 0,
      nombre: nombreTexteExemple,
    },
    {
      id: "SAI-02",
      severite: "bloquante",
      ok: nombreNoteInterne === 0,
      nombre: nombreNoteInterne,
    },
  ];
}
