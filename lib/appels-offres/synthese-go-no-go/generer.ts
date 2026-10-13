import Anthropic from "@anthropic-ai/sdk";
import { decouperParSection } from "../normalisation/markdown";
import { construireContenuPertinent } from "../normalisation/extraire";
import { construireListeQuestions } from "./questions";
import { SyntheseGoNoGoExtraiteSchema } from "./schema";
import { CLES_QUESTION_GO_NO_GO, type ReponseSyntheseGoNoGo } from "../types";

const anthropic = new Anthropic({ maxRetries: 4 });

const REPONSE_NON_PRECISEE = "Non précisé dans le DAO.";

export function construirePromptSyntheseGoNoGo(daoMarkdown: string): string {
  const sections = decouperParSection(daoMarkdown);
  const contenuPertinent = construireContenuPertinent(sections);

  return `Voici des sections extraites d'un dossier d'appel d'offres (DAO) ivoirien :

${contenuPertinent}

Réponds aux questions suivantes pour aider une entreprise à décider rapidement si elle doit répondre à cet appel d'offres (décision Go/No-Go). Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact suivant :

{
  "reponses": [
    { "cle": "string (une des clés listées ci-dessous)", "reponse": "string, en français, concis (2 à 4 phrases maximum)", "source_section": "nom de la section d'origine, ou null si non localisable" }
  ]
}

Questions, une entrée par clé, dans cet ordre :
${construireListeQuestions()}

Consignes strictes :
- Une entrée par clé, dans l'ordre indiqué ci-dessus, jamais de clé dupliquée ni absente.
- N'invente aucune information absente du texte fourni. Si le DAO ne précise pas l'information demandée, réponds exactement "${REPONSE_NON_PRECISEE}" pour cette clé, avec "source_section": null.
- Pour "facteurs_eliminatoires", ne retiens que les motifs de rejet EXPLICITEMENT qualifiés comme tels par le texte (ex. "sous peine de rejet", "critère éliminatoire", "rejet automatique de l'offre") — n'en déduis jamais à partir de l'importance perçue d'une exigence.`;
}

export async function genererSyntheseGoNoGo(daoMarkdown: string): Promise<ReponseSyntheseGoNoGo[]> {
  const prompt = construirePromptSyntheseGoNoGo(daoMarkdown);

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texteJson = bloc && bloc.type === "text" ? bloc.text : "{}";

  const debut = texteJson.indexOf("{");
  const fin = texteJson.lastIndexOf("}");

  if (debut === -1 || fin === -1 || fin < debut) {
    throw new Error("Réponse Claude sans JSON exploitable.");
  }

  const jsonBrut = texteJson.slice(debut, fin + 1);
  const extraction = SyntheseGoNoGoExtraiteSchema.parse(JSON.parse(jsonBrut));

  // Garantit une réponse par clé fixe, dans l'ordre d'affichage, même si
  // Claude en a omis une — plutôt que de propager un tableau incomplet ou
  // désordonné jusqu'à l'UI.
  const parCle = new Map(extraction.reponses.map((r) => [r.cle, r]));

  return CLES_QUESTION_GO_NO_GO.map(
    (cle) =>
      parCle.get(cle) ?? {
        cle,
        reponse: REPONSE_NON_PRECISEE,
        source_section: null,
      },
  );
}
