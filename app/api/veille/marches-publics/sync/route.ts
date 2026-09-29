import { Receiver } from "@upstash/qstash";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  extraireAvisDepuisHtml,
  filtrerAvisEncoreOuverts,
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
    // Capturé avant l'écriture pour compter ensuite les avis réellement
    // nouveaux (voir plus bas) sans dépendre d'un select de comparaison
    // préalable — évite la troncature PostgREST à 1000 lignes qui rendrait
    // ce select silencieusement incomplet une fois le catalogue d'avis
    // ouverts au-delà de ce seuil.
    const executionDebut = new Date().toISOString();

    const html = await recupererPageAppelOffres();
    const avisExtraits = extraireAvisDepuisHtml(html);
    const avisOuverts = filtrerAvisEncoreOuverts(avisExtraits, new Date());

    // Upsert atomique sur TOUS les avis ouverts (pas seulement les
    // nouveaux) : un seul aller-retour réseau au lieu d'un insert en lot
    // suivi d'une boucle de update séquentiel par avis déjà connu — cette
    // boucle risquait de dépasser les 60s de maxDuration sur un
    // catalogue de plusieurs centaines d'avis, tuant la fonction en
    // cours de route sans aucune ligne veille_execution écrite. L'upsert
    // est aussi auto-résilient à un doublon (reference, objet) au sein
    // de la même page scrapée (`onConflict` gère les cibles de conflit
    // répétées en une seule instruction), contrairement à un insert brut
    // qui aurait fait échouer tout le lot sur la contrainte unique.
    // `cree_le` est volontairement absent du payload : son défaut
    // `now()` ne s'applique qu'aux véritables insertions, ce qui permet
    // de compter les nouveaux avis après coup par comparaison de date.
    if (avisOuverts.length > 0) {
      const { error: erreurUpsert } = await supabase.from("avis_ao_national").upsert(
        avisOuverts.map((a) => ({
          reference: a.reference,
          type: a.type,
          objet: a.objet,
          autorite_contractante: a.autoriteContractante,
          date_limite_remise_offres: a.dateLimite,
          bomp_numero_id: null,
          texte_brut: null,
          structure_le: new Date().toISOString(),
        })),
        { onConflict: "reference,objet" },
      );
      if (erreurUpsert) throw erreurUpsert;
    }

    // Purge des avis devenus échus, tous pipelines confondus (BOMP
    // historique inclus) — voir spec, étape 6 du pipeline.
    const aujourdHuiTexte = new Date().toISOString().slice(0, 10);
    const { error: erreurNettoyage } = await supabase
      .from("avis_ao_national")
      .delete()
      .lt("date_limite_remise_offres", aujourdHuiTexte);
    if (erreurNettoyage) throw erreurNettoyage;

    // Nombre de lignes réellement insérées par l'upsert ci-dessus (donc
    // dont cree_le a pris sa valeur par défaut à l'exécution en cours),
    // par opposition aux lignes déjà connues qui ont seulement été mises
    // à jour. Un échec de ce comptage ne doit pas faire regarder cette
    // exécution comme un échec — l'upsert et la purge ont bien eu lieu —
    // donc on dégrade en `null` plutôt que de lever une erreur.
    let nombreNouveaux: number | null = null;
    const { count, error: erreurComptage } = await supabase
      .from("avis_ao_national")
      .select("id", { count: "exact", head: true })
      .gte("cree_le", executionDebut);
    if (erreurComptage) {
      console.error("Échec du comptage des nouveaux avis (veille marchés publics)", erreurComptage);
    } else {
      nombreNouveaux = count ?? 0;
    }

    const { error: erreurLogSucces } = await supabase.from("veille_execution").insert({
      statut: "succes",
      nombre_ao_trouves: avisOuverts.length,
      nombre_nouveaux_ao: nombreNouveaux,
    });
    if (erreurLogSucces) throw erreurLogSucces;

    return new Response("OK", { status: 200 });
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";

    const { error: erreurLogEchec } = await supabase.from("veille_execution").insert({
      statut: "erreur",
      erreur_message: message,
    });
    // Un échec de CE second insert (le journal d'erreur lui-même) ne
    // doit jamais masquer l'erreur d'origine qu'on est en train de
    // rapporter : on le journalise côté serveur et on renvoie quand même
    // la réponse 500 avec le message d'origine.
    if (erreurLogEchec) {
      console.error("Échec de l'enregistrement du journal d'erreur veille_execution", erreurLogEchec);
    }

    return new Response(`Échec de la synchronisation : ${message}`, { status: 500 });
  }
}
