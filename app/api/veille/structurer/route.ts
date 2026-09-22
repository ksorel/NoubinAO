import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { traiterStructurationAvis } from "@/lib/veille/structuration-avis";
import { construireUrlCallbackStructuration } from "@/lib/veille/file-attente";

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
      url: construireUrlCallbackStructuration(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  let avisId: string;
  try {
    ({ avisId } = JSON.parse(corpsBrut) as { avisId: string });
  } catch {
    return new Response("Corps de requête invalide", { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    await traiterStructurationAvis(supabase, avisId);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return new Response(`Échec de la structuration : ${message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
