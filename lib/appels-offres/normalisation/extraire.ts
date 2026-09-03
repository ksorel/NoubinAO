import Anthropic from "@anthropic-ai/sdk";
import { ExtractionAoSchema, type ExtractionAo } from "./schema";
import type { SectionMarkdown } from "./markdown";

// Voir le commentaire équivalent dans ocr.ts : maxRetries augmenté après
// une vraie erreur 529 "Overloaded" d'Anthropic sur un traitement réel
// (2026-09-03).
const anthropic = new Anthropic({ maxRetries: 4 });

function normaliserPourComparaison(texte: string): string {
  return texte.replace(/['’‘]/g, "'").toUpperCase();
}

// La détection heuristique de titres (comparaison de texte pour le DOCX,
// taille de police pour le PDF) reste fiable pour repérer UNE borne isolée
// comme "Formulaires de soumission", mais s'est révélée trop fragile pour
// sélectionner précisément le contenu de CHAQUE section utile (AAO, DPAO,
// Critères) prise séparément : un DAO réel met parfois en emphase (police
// plus grande) une simple phrase de réponse en plein milieu d'un article
// ("ARTICLE 2 : OBJET" suivi de sa réponse en gros caractères), ce qui la
// fait passer pour un nouveau titre et fragmente la vraie section en
// micro-sections orphelines qu'une sélection par titre ne peut plus
// retrouver (confirmé sur un DAO réel, 2026-09-03 : le contenu de l'AAO
// disparaissait presque entièrement malgré une détection de titre par
// ailleurs correcte). Plutôt que d'affiner encore l'heuristique de titre au
// cas par cas, on envoie à Claude tout le contenu utile en un seul bloc
// continu, du début du document jusqu'à la borne "Formulaires de
// soumission" (juste avant les modèles de formulaires vierges, qui
// n'apportent rien à l'extraction) — un seul point de coupure fiable à
// trouver plutôt que plusieurs sections précises à isoler.
const BORNE_FIN_CONTENU = "FORMULAIRES DE SOUMISSION";
// Filet de sécurité si la borne n'est pas trouvée (DAO au phrasé
// différent) : évite d'envoyer un document de plusieurs centaines de pages
// en entier à l'API.
const LONGUEUR_MAX_CONTENU_PERTINENT = 60000;

export function construireContenuPertinent(sections: SectionMarkdown[]): string {
  const indexBorne = sections.findIndex((s) =>
    normaliserPourComparaison(s.titre).includes(BORNE_FIN_CONTENU),
  );

  const sectionsPertinentes = indexBorne === -1 ? sections : sections.slice(0, indexBorne);

  const contenu = sectionsPertinentes.map((s) => `## ${s.titre}\n${s.contenu}`).join("\n\n");

  return contenu.length > LONGUEUR_MAX_CONTENU_PERTINENT
    ? contenu.slice(0, LONGUEUR_MAX_CONTENU_PERTINENT)
    : contenu;
}

export async function extraireInformationsAo(sections: SectionMarkdown[]): Promise<ExtractionAo> {
  const contenuPertinent = construireContenuPertinent(sections);

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    // 2000 s'est révélé insuffisant sur un vrai DAO (2026-09-03) : une fois
    // le vrai contenu de l'AAO/DPAO transmis (voir trouverSection ci-dessus),
    // la liste d'exigences générée est plus longue et le JSON se retrouvait
    // tronqué en plein milieu d'un tableau ("Expected ',' or ']'").
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Voici des sections extraites d'un dossier d'appel d'offres (DAO) ivoirien :

${contenuPertinent}

Extrait les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact suivant :

{
  "titre": "string ou null (objet/intitulé de l'appel d'offres)",
  "acheteur": "string ou null (nom de l'autorité contractante)",
  "secteur": "string ou null (secteur d'activité concerné)",
  "date_limite": "string ou null (date et heure limite de dépôt, au format ISO 8601 UTC, ex. 2026-11-03T12:00:00Z)",
  "montant_caution": nombre ou null (montant de la caution de soumission, en chiffres, sans devise),
  "sommaire_attendu": ["string"],
  "exigences": [
    { "type_exigence": "piece_requise", "libelle": "string", "description": "string ou null", "ponderation": null, "source_section": "nom de la section d'origine" },
    { "type_exigence": "critere_evaluation", "libelle": "string", "description": null, "ponderation": nombre ou null, "source_section": "nom de la section d'origine" }
  ]
}

Indications pour la date_limite et le montant_caution, souvent formatés à
la française dans ces documents :
- La date et l'heure limites de dépôt sont indiquées séparément (ex. "Date :
  24/08/2026" et "Heure : 09 heures 30 minutes Temps Universel", ou une
  formulation similaire dans le corps du texte). Combine les deux en un
  seul horodatage ISO 8601 UTC ("Temps Universel" = UTC).
- Les montants utilisent le point comme séparateur de milliers, pas comme
  séparateur décimal (ex. "545.000" francs CFA = 545000, pas 545). Le
  montant est aussi souvent écrit en toutes lettres juste à côté (ex.
  "Cinq cent quarante-cinq mille (545.000) francs CFA") — utilise cette
  écriture en lettres pour confirmer la valeur numérique exacte.

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise null ou un tableau vide selon le cas.`,
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");

  if (debut === -1 || fin === -1 || fin < debut) {
    throw new Error("Réponse Claude sans JSON exploitable.");
  }

  const jsonBrut = texteJson.slice(debut, fin + 1);

  return ExtractionAoSchema.parse(JSON.parse(jsonBrut));
}
