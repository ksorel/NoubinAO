import Anthropic from "@anthropic-ai/sdk";
import { ExtractionAoSchema, type ExtractionAo } from "./schema";
import type { SectionMarkdown } from "./markdown";

const anthropic = new Anthropic();

function trouverSection(sections: SectionMarkdown[], motCle: string): SectionMarkdown | undefined {
  return sections.find((s) => s.titre.toUpperCase().includes(motCle.toUpperCase()));
}

export async function extraireInformationsAo(sections: SectionMarkdown[]): Promise<ExtractionAo> {
  const sectionAao = trouverSection(sections, "AVIS D'APPEL D'OFFRES");
  const sectionDpao = trouverSection(sections, "DONNÉES PARTICULIÈRES");
  const sectionSommaire = trouverSection(sections, "SOMMAIRE ATTENDU");

  const contenuPertinent = [sectionAao, sectionDpao, sectionSommaire]
    .filter((s): s is SectionMarkdown => s !== undefined)
    .map((s) => `## ${s.titre}\n${s.contenu}`)
    .join("\n\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
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

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise null ou un tableau vide selon le cas.`,
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");

  if (debut === -1 || fin === -1 || fin < debut) {
    // DIAGNOSTIC TEMPORAIRE — message volontairement détaillé pour ce
    // premier test sur un vrai DAO (jamais validé auparavant, voir
    // CLAUDE.md). À raccourcir une fois la cause confirmée : soit
    // contenuPertinent est vide (trouverSection ne matche aucun titre
    // réel du document), soit Claude a répondu sans JSON pour une autre
    // raison.
    throw new Error(
      `Réponse Claude sans JSON exploitable. contenuPertinent vide : ${contenuPertinent.length === 0}. Début de la réponse : ${texteJson.slice(0, 300)}`,
    );
  }

  const jsonBrut = texteJson.slice(debut, fin + 1);

  return ExtractionAoSchema.parse(JSON.parse(jsonBrut));
}
