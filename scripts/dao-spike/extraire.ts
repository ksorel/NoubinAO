import Anthropic from "@anthropic-ai/sdk";
import { ExtractionDaoSchema, type ExtractionDao } from "./schema";
import type { SectionMarkdown } from "./markdown";

const anthropic = new Anthropic();

function trouverSection(sections: SectionMarkdown[], motCle: string): SectionMarkdown | undefined {
  return sections.find((s) => s.titre.toUpperCase().includes(motCle.toUpperCase()));
}

export async function extraireExigences(sections: SectionMarkdown[]): Promise<ExtractionDao> {
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
  "pieces_requises": [{ "type": "string", "description": "string", "source": "nom de la section d'origine" }],
  "criteres_evaluation": [{ "critere": "string", "ponderation": nombre ou null, "source": "nom de la section d'origine" }],
  "sommaire_attendu": ["string"],
  "delai_depot": "string ou null"
}

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise un tableau vide ou null selon le cas.`,
      },
    ],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");
  const jsonBrut = texteJson.slice(debut, fin + 1);

  return ExtractionDaoSchema.parse(JSON.parse(jsonBrut));
}
