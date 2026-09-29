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

// Nombre de lignes lues par page lors de la lecture paginée des clés
// existantes ci-dessous — PostgREST tronque silencieusement à 1000 lignes
// par requête, donc tout select sur une table qui peut dépasser ce seuil
// doit être paginé explicitement.
const TAILLE_PAGE = 1000;

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

    // Dédoublonnage par (reference, objet) AVANT toute écriture : la
    // source a déjà montré une collision réelle sur "reference" seule
    // (voir migration 20260929120000), donc un doublon exact sur la clé
    // composite au sein d'une même page scrapée n'est pas à exclure. Sans
    // ce dédoublonnage, un seul appel INSERT ... ON CONFLICT DO UPDATE
    // portant sur deux lignes de la même instruction partageant la même
    // cible de conflit échoue avec "ON CONFLICT DO UPDATE command cannot
    // affect row a second time" — une limitation Postgres, pas une
    // particularité Supabase, donc aucun réglage côté client ne la
    // contourne. Ne garder que la dernière occurrence par clé suffit ici
    // (les doublons observés dans la source sont des répétitions
    // identiques, pas des versions concurrentes à arbitrer).
    const avisUniques = [...new Map(avisOuverts.map((a) => [cleReferenceObjet(a), a])).values()];

    // Lecture paginée des clés déjà connues, sur toute la table (pas
    // seulement les avis scrapés) : un avis déjà présent peut venir du
    // pipeline BOMP historique, pas seulement d'une exécution précédente
    // de ce scraping.
    const clesExistantes = new Set<string>();
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from("avis_ao_national")
        .select("reference, objet")
        .range(page * TAILLE_PAGE, (page + 1) * TAILLE_PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) {
        clesExistantes.add(cleReferenceObjet({ reference: row.reference, objet: row.objet ?? "" }));
      }
      if (data.length < TAILLE_PAGE) break;
      page++;
    }

    const { nouveaux, existants } = partitionnerAvis(avisUniques, clesExistantes);

    // Insertion simple des avis réellement nouveaux : dédoublonnage +
    // pagination complète ci-dessus garantissent qu'aucune collision
    // n'est possible ici, donc un insert brut (sans ON CONFLICT) est à la
    // fois correct et le plus simple. Seul ce bloc a le droit de
    // renseigner bomp_numero_id/texte_brut/structure_le : ce sont des
    // lignes réellement neuves.
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

    // Mise à jour des avis déjà connus, en un seul upsert par lot (pas
    // une boucle séquentielle par avis — évite de dépasser les 60s de
    // maxDuration sur un catalogue de plusieurs centaines d'avis, un
    // risque réel de la version précédente). Les colonnes
    // bomp_numero_id/texte_brut/structure_le sont VOLONTAIREMENT absentes
    // de chaque objet (pas mises à null — absentes en tant que clés) :
    // Supabase/PostgREST ne construit la clause ON CONFLICT DO UPDATE SET
    // que pour les colonnes présentes dans le payload envoyé, donc une
    // colonne omise reste intouchée sur la ligne existante. C'est
    // essentiel ici : une collision (reference, objet) entre un avis
    // scrapé et un avis déjà connu du pipeline BOMP est plausible (les
    // deux décrivent les mêmes AO nationaux ARCOP/SIGMAP) — écraser ces
    // trois colonnes détruirait silencieusement la provenance BOMP et
    // marquerait à tort la ligne comme structurée par l'IA alors qu'elle
    // n'est jamais passée par structuration-avis.ts.
    if (existants.length > 0) {
      const { error: erreurMiseAJour } = await supabase.from("avis_ao_national").upsert(
        existants.map((a) => ({
          reference: a.reference,
          objet: a.objet,
          type: a.type,
          autorite_contractante: a.autoriteContractante,
          date_limite_remise_offres: a.dateLimite,
        })),
        { onConflict: "reference,objet" },
      );
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

    const { error: erreurLogSucces } = await supabase.from("veille_execution").insert({
      statut: "succes",
      nombre_ao_trouves: avisOuverts.length,
      nombre_nouveaux_ao: nouveaux.length,
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
