import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { traiterDecoupageBomp } from "@/lib/veille/decoupage";
import { construireUrlCallbackDecoupage } from "@/lib/veille/file-attente";

// Un BOMP fait 200+ pages : extraction pdfjs-dist + découpage + insertion
// de ~40 lignes peut dépasser quelques secondes — même plafond que le
// traitement DAO (60s, maximum autorisé sur le plan Vercel Hobby).
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
      url: construireUrlCallbackDecoupage(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  let bompNumeroId: string;
  try {
    ({ bompNumeroId } = JSON.parse(corpsBrut) as { bompNumeroId: string });
  } catch {
    return new Response("Corps de requête invalide", { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    await traiterDecoupageBomp(supabase, bompNumeroId);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    return new Response(`Échec du découpage : ${message}`, { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
