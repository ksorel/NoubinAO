import Anthropic from "@anthropic-ai/sdk";
import { AvisStructureSchema, type AvisStructure } from "./schema";

const anthropic = new Anthropic({ maxRetries: 4 });

export async function structurerAvis(texteBrut: string): Promise<AvisStructure> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Voici un avis d'appel d'offres extrait du Bulletin Officiel des Marchés Publics de Côte d'Ivoire :

${texteBrut}

Extrait les informations suivantes et réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, au format exact suivant :

{
  "type": "travaux" ou "fournitures" ou "prestations" ou "manifestation_interet" ou null,
  "autorite_contractante": "string ou null (nom de l'autorité contractante, ARTICLE 1)",
  "objet": "string ou null (objet de l'appel d'offres, ARTICLE 2)",
  "secteur": "string ou null (secteur d'activité concerné, déduis-le depuis l'objet — ex. BTP, ingénierie, environnement, énergie-climat, ou tout autre secteur pertinent)",
  "montant_caution": nombre ou null (montant de la garantie de soumission, en chiffres, sans devise),
  "date_limite_remise_offres": "string ou null (date limite de remise des offres, ARTICLE 8, au format ISO 8601 YYYY-MM-DD)",
  "contact_retrait": "string ou null (adresse/contact pour retirer le dossier, ARTICLE 7)",
  "nombre_lots": nombre ou null (nombre de lots de ce marché, ARTICLE 3)
}

Indications :
- Les montants utilisent le point comme séparateur de milliers, pas comme séparateur décimal (ex. "2 300 000" = 2300000).
- Le type se déduit du contenu de l'objet (ex. "TRAVAUX DE..." → travaux, "FOURNITURE ET POSE DE..." → fournitures, "PRESTATIONS DE..." → prestations, "MANIFESTATION D'INTERET" dans le texte → manifestation_interet).

N'invente aucune information absente du texte fourni. Si une information n'est pas présente, utilise null.`,
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
  return AvisStructureSchema.parse(JSON.parse(jsonBrut));
}
