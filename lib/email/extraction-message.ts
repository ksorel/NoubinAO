export interface PartieMessage {
  mimeType?: string | null;
  body?: Record<string, unknown> | null;
  parts?: PartieMessage[];
  filename?: string;
}

export function extraireCorpsTexte(payload: PartieMessage | undefined): string | null {
  if (!payload) return null;

  const partieTexte = trouverPartie(payload, "text/plain");
  if (partieTexte?.body?.data && typeof partieTexte.body.data === "string") {
    return decoderBase64Url(partieTexte.body.data);
  }

  const partieHtml = trouverPartie(payload, "text/html");
  if (partieHtml?.body?.data && typeof partieHtml.body.data === "string") {
    return decoderBase64Url(partieHtml.body.data).replace(/<[^>]+>/g, " ");
  }

  return null;
}

function trouverPartie(
  partie: PartieMessage,
  mimeType: string,
): PartieMessage | null {
  if (partie.mimeType === mimeType) return partie;
  for (const sousPartie of partie.parts ?? []) {
    const trouvee = trouverPartie(sousPartie, mimeType);
    if (trouvee) return trouvee;
  }
  return null;
}

function decoderBase64Url(donnees: string): string {
  const base64 = donnees.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}
