import Anthropic from "@anthropic-ai/sdk";
import type { Document } from "@/lib/documents/types";

const anthropic = new Anthropic({ maxRetries: 4 });

const LONGUEUR_MAX_DAO_MARKDOWN = 100000;
const LONGUEUR_MAX_CONTENU_DOCUMENT = 20000;

export function construirePromptRedaction(
  titreSection: string,
  daoMarkdown: string | null,
  documentsSource: Document[],
): string {
  const daoTronque = daoMarkdown
    ? daoMarkdown.length > LONGUEUR_MAX_DAO_MARKDOWN
      ? daoMarkdown.slice(0, LONGUEUR_MAX_DAO_MARKDOWN)
      : daoMarkdown
    : null;

  const documentsTexte = documentsSource
    .map((document) => {
      const contenu = document.contenu_markdown ?? "";
      const contenuTronque =
        contenu.length > LONGUEUR_MAX_CONTENU_DOCUMENT
          ? contenu.slice(0, LONGUEUR_MAX_CONTENU_DOCUMENT)
          : contenu;
      return `### ${document.nom}\n${contenuTronque}`;
    })
    .join("\n\n");

  const sectionDocuments =
    documentsTexte.length > 0
      ? `Documents de référence disponibles :\n\n${documentsTexte}`
      : "Aucun document de référence fourni pour cette section.";

  const sectionDao = daoTronque
    ? `Extrait du dossier d'appel d'offres (DAO), pour respecter ses consignes :\n\n${daoTronque}`
    : "";

  return `Tu rédiges la section "${titreSection}" d'un dossier de réponse à un appel d'offres ivoirien, pour le compte d'une entreprise de BTP/ingénierie/environnement/énergie-climat.

${sectionDao}

${sectionDocuments}

Consignes strictes :
- N'invente aucun fait, chiffre, certification ou référence absent des documents fournis ci-dessus.
- Si une information nécessaire à cette section n'est présente dans aucun document fourni, indique-le explicitement dans le texte plutôt que de l'inventer (ex. "à compléter : [information manquante]").
- N'ajoute aucun détail, chiffre ou précision supplémentaire qui te semble plausible ou habituel pour ce type de document ivoirien, même s'il n'est pas strictement "nécessaire" à la section — seule l'absence d'information nécessaire justifie une mention "à compléter", jamais une invention pour combler un silence du texte. Exemple réel à ne pas reproduire : ajouter "les offres doivent être adressées en trois (3) exemplaires originaux" alors que cette précision n'apparaît pas dans les documents fournis — même un détail de procédure courant doit être omis s'il n'y figure pas.
- Rédige uniquement le texte de la section, en français, en paragraphes de prose — sans titre, sans numérotation, sans commentaire sur la tâche elle-même.
- Réponds uniquement avec le texte de la section, sans préambule ni conclusion ajoutés.`;
}

export async function genererSectionRedaction(
  titreSection: string,
  daoMarkdown: string | null,
  documentsSource: Document[],
): Promise<string> {
  const prompt = construirePromptRedaction(titreSection, daoMarkdown, documentsSource);

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
