import type { SupabaseClient } from "@supabase/supabase-js";
import { structurerAvis } from "./structurer";
import type { AvisAoNational } from "./types";

export async function traiterStructurationAvis(
  supabase: SupabaseClient,
  avisId: string,
): Promise<void> {
  const { data, error: erreurLecture } = await supabase
    .from("avis_ao_national")
    .select("*")
    .eq("id", avisId)
    .maybeSingle();

  if (erreurLecture || !data) {
    throw new Error(`Avis introuvable : ${avisId}`);
  }

  const avis = data as AvisAoNational;

  const structure = await structurerAvis(avis.texte_brut);

  const { error: erreurMiseAJour } = await supabase
    .from("avis_ao_national")
    .update({
      type: structure.type,
      autorite_contractante: structure.autorite_contractante,
      objet: structure.objet,
      secteur: structure.secteur,
      montant_caution: structure.montant_caution,
      date_limite_remise_offres: structure.date_limite_remise_offres,
      contact_retrait: structure.contact_retrait,
      nombre_lots: structure.nombre_lots,
    })
    .eq("id", avisId);

  if (erreurMiseAJour) {
    throw new Error(`Échec de la mise à jour de l'avis : ${erreurMiseAJour.message}`);
  }

  // Dernier avis structuré de ce BOMP : fait passer bomp_numero au statut
  // "termine". Pas d'orchestrateur séparé — chaque job de structuration
  // vérifie lui-même s'il était le dernier restant (type is null = pas
  // encore structuré, y compris ce job juste avant sa propre mise à jour
  // ci-dessus donc on requête APRÈS avoir écrit).
  const { count } = await supabase
    .from("avis_ao_national")
    .select("id", { count: "exact", head: true })
    .eq("bomp_numero_id", avis.bomp_numero_id)
    .is("type", null);

  if (count === 0) {
    await supabase
      .from("bomp_numero")
      .update({ statut: "termine" })
      .eq("id", avis.bomp_numero_id);
  }
}
