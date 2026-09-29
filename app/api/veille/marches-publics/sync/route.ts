import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  cleReferenceObjet,
  extraireAvisDepuisHtml,
  filtrerAvisEncoreOuverts,
  partitionnerAvis,
  recupererPageAppelOffres,
} from "@/lib/veille/marches-publics";

// Même raison que app/api/dao/traiter/route.ts et app/api/email/sync/route.ts.
export const maxDuration = 60;

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

function construireUrlCallback(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/veille/marches-publics/sync`;
}

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
      url: construireUrlCallback(),
    });
  } catch {
    return new Response("Signature invalide", { status: 401 });
  }

  if (!signatureValide) {
    return new Response("Signature invalide", { status: 401 });
  }

  const supabase = createServiceRoleClient();

  try {
    const html = await recupererPageAppelOffres();
    const avisExtraits = extraireAvisDepuisHtml(html);
    const avisOuverts = filtrerAvisEncoreOuverts(avisExtraits, new Date());

    const { data: existants, error: erreurExistants } = await supabase
      .from("avis_ao_national")
      .select("reference, objet");
    if (erreurExistants) throw erreurExistants;

    const clesExistantes = new Set(
      (existants ?? []).map((e) => cleReferenceObjet({ reference: e.reference, objet: e.objet ?? "" })),
    );
    const { nouveaux, existants: avisAMettreAJour } = partitionnerAvis(avisOuverts, clesExistantes);

    if (nouveaux.length > 0) {
      const { error: erreurInsertion } = await supabase.from("avis_ao_national").insert(
        nouveaux.map((a) => ({
          reference: a.reference,
          type: a.type,
          objet: a.objet,
          autorite_contractante: a.autoriteContractante,
          date_limite_remise_offres: a.dateLimite,
          bomp_numero_id: null,
          texte_brut: null,
          structure_le: new Date().toISOString(),
        })),
      );
      if (erreurInsertion) throw erreurInsertion;
    }

    // Mise à jour des avis déjà connus : la source peut corriger un champ
    // après coup (autorité contractante renseignée plus tard, par
    // exemple) — un upsert par avis plutôt qu'un insert en lot, puisque
    // chacun cible une ligne différente par sa clé composite.
    for (const a of avisAMettreAJour) {
      const { error: erreurMiseAJour } = await supabase
        .from("avis_ao_national")
        .update({
          type: a.type,
          autorite_contractante: a.autoriteContractante,
          date_limite_remise_offres: a.dateLimite,
        })
        .eq("reference", a.reference)
        .eq("objet", a.objet);
      if (erreurMiseAJour) throw erreurMiseAJour;
    }

    // Purge des avis devenus échus, tous pipelines confondus (BOMP
    // historique inclus) — voir spec, étape 6 du pipeline.
    const aujourdHuiTexte = new Date().toISOString().slice(0, 10);
    const { error: erreurNettoyage } = await supabase
      .from("avis_ao_national")
      .delete()
      .lt("date_limite_remise_offres", aujourdHuiTexte);
    if (erreurNettoyage) throw erreurNettoyage;

    await supabase.from("veille_execution").insert({
      statut: "succes",
      nombre_ao_trouves: avisOuverts.length,
      nombre_nouveaux_ao: nouveaux.length,
    });

    return new Response("OK", { status: 200 });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase.from("veille_execution").insert({
      statut: "erreur",
      erreur_message: message,
    });
    return new Response(`Échec de la synchronisation : ${message}`, { status: 500 });
  }
}
