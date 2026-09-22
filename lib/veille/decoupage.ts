import type { SupabaseClient } from "@supabase/supabase-js";
import { extrairePagesPdf } from "@/lib/appels-offres/normalisation/pdf";
import { decouperEnAvis } from "./chunking";
import { mettreEnFileStructurationAvis } from "./file-attente";
import type { BompNumero } from "./types";

// L'OCR de repli (appel Claude vision, une page à la fois) n'a aucun sens
// ici : le BOMP est du PDF texte natif, seule sa couverture est scannée.
// Sans plafond, chaque page quasi vide (séparateurs, pages de garde) d'un
// bulletin de 240 pages déclenche un appel facturé et séquentiel — coût
// non borné ET cause probable de dépassement du plafond de 60 s de la
// fonction serverless. Même valeur que lib/documents/normalisation.ts.
const MAX_PAGES_OCR_BOMP = 5;

export async function traiterDecoupageBomp(
  supabase: SupabaseClient,
  bompNumeroId: string,
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("bomp_numero")
    .select("*")
    .eq("id", bompNumeroId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`BOMP introuvable : ${bompNumeroId}`);
  }

  const bompNumero = data as BompNumero;

  // Garde de ré-entrée (même posture que traiterDao) : QStash retente un
  // job en échec, et sans garde une relance re-télécharge, re-découpe et
  // ré-insère un jeu COMPLET d'avis (aucune contrainte d'unicité ne
  // l'empêche), puis republie autant de jobs de structuration — chacun un
  // appel Claude facturé. Seul un BOMP encore 'en_attente' est traitable.
  if (bompNumero.statut !== "en_attente") {
    return;
  }

  // Transition conditionnelle plutôt qu'un update inconditionnel : deux
  // invocations concurrentes (retry QStash pendant que la première tourne
  // encore) pourraient toutes deux passer la garde ci-dessus. `.eq("statut",
  // "en_attente")` + `.select("id")` fait perdre la course proprement à la
  // seconde — le patron de vérification « cette écriture a-t-elle vraiment
  // touché une ligne ? » déjà utilisé par modifierStatutPipeline
  // (lib/appels-offres/actions.ts).
  const { data: lignesVerrouillees, error: erreurVerrou } = await supabase
    .from("bomp_numero")
    .update({ statut: "extraction_en_cours", mis_a_jour_le: new Date().toISOString() })
    .eq("id", bompNumeroId)
    .eq("statut", "en_attente")
    .select("id");

  if (erreurVerrou || !lignesVerrouillees || lignesVerrouillees.length === 0) {
    return;
  }

  try {
    const { data: fichierData, error: erreurTelechargement } = await supabase.storage
      .from("bomp-national")
      .download(bompNumero.fichier_path);

    if (erreurTelechargement || !fichierData) {
      throw new Error("Échec du téléchargement du fichier BOMP depuis le stockage.");
    }

    const buffer = Buffer.from(await fichierData.arrayBuffer());
    const pages = await extrairePagesPdf(buffer, MAX_PAGES_OCR_BOMP);
    const texteComplet = pages.map((p) => p.texte).join("\n");

    const avis = decouperEnAvis(texteComplet);

    if (avis.length === 0) {
      throw new Error(
        "Aucun avis reconnu dans ce BOMP — motif ARTICLE 1 introuvable (mise en page différente ?).",
      );
    }

    const { data: lignesInserees, error: erreurInsertion } = await supabase
      .from("avis_ao_national")
      .insert(
        avis.map((a) => ({
          bomp_numero_id: bompNumeroId,
          reference: a.reference,
          texte_brut: a.texteBrut,
        })),
      )
      .select("id");

    if (erreurInsertion || !lignesInserees) {
      throw new Error(`Échec de l'insertion des avis : ${erreurInsertion?.message}`);
    }

    await supabase
      .from("bomp_numero")
      .update({
        nombre_avis_extraits: lignesInserees.length,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", bompNumeroId);

    for (const ligne of lignesInserees) {
      await mettreEnFileStructurationAvis(ligne.id);
    }
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : "Erreur inconnue";
    await supabase
      .from("bomp_numero")
      .update({
        statut: "erreur",
        erreur_message: message,
        mis_a_jour_le: new Date().toISOString(),
      })
      .eq("id", bompNumeroId);
    throw erreur;
  }
}
