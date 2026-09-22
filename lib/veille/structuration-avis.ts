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
      // Marqueur de structuration réussie, écrit quel que soit le contenu
      // renvoyé par Claude — `type` compris. C'est ce qui distingue « déjà
      // passé par l'IA » de « jamais traité » ci-dessous.
      structure_le: new Date().toISOString(),
    })
    .eq("id", avisId);

  if (erreurMiseAJour) {
    throw new Error(`Échec de la mise à jour de l'avis : ${erreurMiseAJour.message}`);
  }

  // Dernier avis structuré de ce BOMP : fait passer bomp_numero au statut
  // "termine". Pas d'orchestrateur séparé — chaque job de structuration
  // vérifie lui-même s'il était le dernier restant (on requête APRÈS avoir
  // écrit, pour que ce job se compte lui-même).
  //
  // Le compteur porte sur `structure_le`, PAS sur `type` : `type` est
  // légitimement nullable (AvisStructureSchema autorise null quand Claude
  // ne sait pas classer l'avis), donc un avis correctement structuré mais
  // non classé resterait indistinguable d'un avis jamais traité — le
  // compte ne tomberait jamais à 0 et le bulletin entier resterait bloqué
  // en 'extraction_en_cours' à vie, alors que tout le reste a réussi.
  const { count } = await supabase
    .from("avis_ao_national")
    .select("id", { count: "exact", head: true })
    .eq("bomp_numero_id", avis.bomp_numero_id)
    .is("structure_le", null);

  if (count === 0) {
    await supabase
      .from("bomp_numero")
      .update({ statut: "termine", mis_a_jour_le: new Date().toISOString() })
      .eq("id", avis.bomp_numero_id);
  }
}
