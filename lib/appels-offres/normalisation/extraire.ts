import Anthropic from "@anthropic-ai/sdk";
import { ExtractionAoSchema, type ExtractionAo } from "./schema";
import type { SectionMarkdown } from "./markdown";

const anthropic = new Anthropic();

// Un même titre peut apparaître plusieurs fois dans un DAO réel : une
// simple mention en préambule (ex. le "Sommaire" du document qui énumère
// ses propres sections par leur nom : "Section 0. Avis d'Appel d'Offres
// (AAO)") produit un marqueur ## quasi vide, distinct de la vraie section
// pleine de contenu qui suit plus loin. Prendre la première correspondance
// (`.find`) récupérait systématiquement la mention creuse. On prend plutôt,
// parmi toutes les correspondances, celle avec le plus de contenu.
function trouverSection(sections: SectionMarkdown[], motCle: string): SectionMarkdown | undefined {
  const correspondances = sections.filter((s) =>
    s.titre.toUpperCase().includes(motCle.toUpperCase()),
  );

  if (correspondances.length === 0) return undefined;

  return correspondances.reduce((plusRiche, section) =>
    section.contenu.length > plusRiche.contenu.length ? section : plusRiche,
  );
}

export async function extraireInformationsAo(sections: SectionMarkdown[]): Promise<ExtractionAo> {
  const sectionAao = trouverSection(sections, "AVIS D'APPEL D'OFFRES");
  const sectionDpao = trouverSection(sections, "DONNÉES PARTICULIÈRES");
  const sectionCriteres = trouverSection(sections, "CRITÈRES D'ÉVALUATION");
  const sectionSommaire = trouverSection(sections, "SOMMAIRE ATTENDU");

  const contenuPertinent = [sectionAao, sectionDpao, sectionCriteres, sectionSommaire]
    .filter((s): s is SectionMarkdown => s !== undefined)
    .map((s) => `## ${s.titre}\n${s.contenu}`)
    .join("\n\n");

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
