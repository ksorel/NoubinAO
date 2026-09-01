import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { traiterDao } from "@/lib/appels-offres/traitement";

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
