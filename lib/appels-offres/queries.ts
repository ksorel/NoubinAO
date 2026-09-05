import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppelOffres, DossierReponse, ExigenceAo } from "./types";
import type { Document } from "@/lib/documents/types";

export async function listerAppelsOffres(
  entrepriseId: string,
): Promise<AppelOffres[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as AppelOffres[];
}

// Le get-or-create ci-dessous diffère délibérément de l'insertion
// best-effort de traitement.ts (lib/appels-offres/traitement.ts) : là-bas,
// un échec ne doit jamais faire échouer un traitement par ailleurs réussi.
// Ici, la page de détail a besoin de cette ligne pour fonctionner (afficher
// le mapping, plus tard le statut de relecture) — un échec doit donc
// remonter une vraie erreur.
async function obtenirOuCreerDossierReponse(
  supabase: SupabaseClient,
  appelOffresId: string,
): Promise<DossierReponse> {
  const { data: existant } = await supabase
    .from("dossier_reponse")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (existant) return existant as DossierReponse;

  const { data: cree, error: erreurInsertion } = await supabase
    .from("dossier_reponse")
    .insert({ appel_offres_id: appelOffresId })
    .select("*")
    .maybeSingle();

  if (!erreurInsertion && cree) return cree as DossierReponse;

  // Course possible avec une autre requête concurrente (ex. deux onglets
  // ouverts sur le même AO au même instant, ou l'insertion best-effort de
  // traitement.ts qui vient de s'exécuter entre notre SELECT et notre
  // INSERT) : la contrainte unique sur appel_offres_id a été violée. Non
  // fatal — la ligne existe forcément à ce stade, on la relit.
  const { data: relu } = await supabase
    .from("dossier_reponse")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (!relu) {
    throw new Error("Échec de la création du dossier de réponse.");
  }

  return relu as DossierReponse;
}

export async function obtenirAppelOffres(
  id: string,
  entrepriseId: string,
): Promise<{
  appelOffres: AppelOffres;
  exigences: ExigenceAo[];
  dossierReponse: DossierReponse;
  documentsParExigence: Record<string, Document[]>;
} | null> {
  const supabase = await createClient();

  const { data: appelOffres, error: erreurAppelOffres } = await supabase
    .from("appel_offres")
    .select("*")
    .eq("id", id)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurAppelOffres || !appelOffres) return null;

  const { data: exigences, error: erreurExigences } = await supabase
    .from("exigence_ao")
    .select("*")
    .eq("appel_offres_id", id)
    .order("created_at", { ascending: true });

  if (erreurExigences) throw erreurExigences;

  const exigencesTypees = (exigences ?? []) as ExigenceAo[];

  const dossierReponse = await obtenirOuCreerDossierReponse(supabase, id);

  const documentsParExigence: Record<string, Document[]> = {};

  if (exigencesTypees.length > 0) {
    const { data: liens, error: erreurLiens } = await supabase
      .from("exigence_document")
      .select("exigence_ao_id, document(*)")
      .in(
        "exigence_ao_id",
        exigencesTypees.map((e) => e.id),
      );

    if (erreurLiens) throw erreurLiens;

    for (const lien of liens ?? []) {
      const exigenceId = lien.exigence_ao_id as string;
      documentsParExigence[exigenceId] ??= [];
      documentsParExigence[exigenceId].push(lien.document as unknown as Document);
    }
  }

  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: exigencesTypees,
    dossierReponse,
    documentsParExigence,
  };
}
