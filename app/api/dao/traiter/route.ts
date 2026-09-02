import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { traiterDao } from "@/lib/appels-offres/traitement";

// Sans cette limite explicite, Vercel applique sa limite d'exécution par
// défaut (bien trop courte pour normaliser + faire l'OCR + extraire un DAO
// réel), tuant la fonction avant que le try/catch de traiterDao() n'ait pu
// écrire statut_traitement="erreur" — la ligne reste alors bloquée
// indéfiniment sur un statut intermédiaire pendant que QStash retente en
// silence. 60s est le maximum autorisé sur le plan Vercel Hobby ; à
// augmenter si le compte passe sur un plan supérieur et que des DAO plus
// volumineux (nombreuses pages scannées) continuent de dépasser ce délai.
export const maxDuration = 60;

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request): Promise<Response> {
  const corpsBrut = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return new Response("Signature manquante", { status: 401 });
  }

  let signatureValide: boolean;
  try {
    signatureValide = await receiver.verify({
      signature,
      body: corpsBrut,
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  const { appelOffresId, mimeType } = JSON.parse(corpsBrut) as {
    appelOffresId: string;
    mimeType: string;
  };

  const supabase = createServiceRoleClient();

  try {
    await traiterDao(supabase, appelOffresId, mimeType);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return new Response(`Échec du traitement : ${message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
