import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { synchroniserCompteEmail } from "@/lib/email/gmail-sync";
import { construireUrlCallbackSyncEmail } from "@/lib/email/file-attente";

// Même raison que app/api/dao/traiter/route.ts : la limite par défaut de
// Vercel est trop courte pour synchroniser plusieurs comptes avec
// plusieurs messages chacun sans être tuée en cours de route.
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
      url: construireUrlCallbackSyncEmail(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: comptes, error } = await supabase
    .from("compte_email_connecte")
    .select("id, utilisateur_id, entreprise_id, refresh_token_chiffre, dernier_sync_le")
    .eq("fournisseur", "gmail")
    .eq("statut", "connecte");

  if (error) {
    return new Response("Échec de la lecture des comptes connectés", { status: 500 });
  }

  for (const compte of comptes ?? []) {
    const resultat = await synchroniserCompteEmail(supabase, compte);

    // Un compte en échec (token révoqué, erreur réseau) ne doit jamais
    // bloquer la synchronisation des autres comptes — chaque compte est
    // indépendant, l'erreur est isolée et marquée sur ce compte précis.
    if ("erreur" in resultat) {
      await supabase
        .from("compte_email_connecte")
        .update({ statut: "erreur" })
        .eq("id", compte.id);
    }
  }

  return new Response("OK", { status: 200 });
}
