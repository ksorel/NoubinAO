import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ maxRetries: 4 });

export function construirePromptCvTransformation(
  cvSourceMarkdown: string,
  modeleCvMarkdown: string,
): string {
  return `Tu réorganises un CV existant selon la structure d'un modèle imposé par un appel d'offres ivoirien.

CV source (contenu réel à réorganiser) :

${cvSourceMarkdown}

Modèle imposé (structure et rubriques à respecter) :

${modeleCvMarkdown}

Consignes strictes :
- N'invente aucune information absente du CV source : aucun nom, aucune date, aucun diplôme, aucune expérience.
- Reprends uniquement les informations réellement présentes dans le CV source, réorganisées selon les rubriques du modèle.
- Si une rubrique du modèle n'a aucun équivalent dans le CV source, écris "[à compléter]" à cet endroit plutôt que d'inventer.
- Réponds uniquement avec le CV réorganisé, sans préambule ni commentaire sur la tâche elle-même.`;
}

export async function genererContenuCvTransforme(
  cvSourceMarkdown: string,
  modeleCvMarkdown: string,
): Promise<string> {
  const prompt = construirePromptCvTransformation(cvSourceMarkdown, modeleCvMarkdown);

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODELE_REDACTION ?? "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const bloc = message.content.find((b) => b.type === "text");
  const texte = bloc && bloc.type === "text" ? bloc.text : "";

  if (!texte.trim()) {
    throw new Error("Réponse Claude vide.");
  }

  return texte.trim();
}
