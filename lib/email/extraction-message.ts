export interface PartieMessage {
  mimeType?: string | null;
  filename?: string | null;
  body?: { data?: string | null; size?: number | null } | null;
  parts?: PartieMessage[];
}

export function extraireCorpsTexte(payload: PartieMessage | undefined): string | null {
  if (!payload) return null;

  const partieTexte = trouverPartie(payload, "text/plain");
  if (partieTexte?.body?.data && typeof partieTexte.body.data === "string") {
    return decoderBase64Url(partieTexte.body.data);
  }

  const partieHtml = trouverPartie(payload, "text/html");
  if (partieHtml?.body?.data && typeof partieHtml.body.data === "string") {
    const html = decoderBase64Url(partieHtml.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ");
    return html.replace(/<[^>]+>/g, " ");
  }

  return null;
}

function trouverPartie(
  partie: PartieMessage,
  mimeType: string,
): PartieMessage | null {
  if (!partie.filename && partie.mimeType === mimeType) return partie;
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

export function collecterPiecesJointes(
  payload: PartieMessage | undefined,
): { nom: string; tailleOctets: number; typeMime: string }[] {
  const resultat: { nom: string; tailleOctets: number; typeMime: string }[] = [];

  function parcourir(partie: PartieMessage) {
    if (partie.filename) {
      resultat.push({
        nom: partie.filename,
        tailleOctets: partie.body?.size ?? 0,
        typeMime: partie.mimeType ?? "application/octet-stream",
      });
    }
    for (const sousPartie of partie.parts ?? []) {
      parcourir(sousPartie);
    }
  }

  if (payload) parcourir(payload);
  return resultat;
}
