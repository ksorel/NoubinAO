import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  AppelOffres,
  ClePieceGroupement,
  CleChecklistManuelle,
  DossierReponse,
  EvaluationGoNoGo,
  ExigenceAo,
  JalonRetroplanning,
  LigneBpu,
  MembreGroupement,
  SectionBpu,
  SectionDossier,
} from "./types";
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
  sections: SectionDossier[];
  documentsParSection: Record<string, Document[]>;
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

  const { data: sections, error: erreurSections } = await supabase
    .from("section_dossier")
    .select("*")
    .eq("dossier_reponse_id", dossierReponse.id)
    .order("created_at", { ascending: true });

  if (erreurSections) throw erreurSections;

  const sectionsTypees = (sections ?? []) as SectionDossier[];

  const documentsParSection: Record<string, Document[]> = {};

  if (sectionsTypees.length > 0) {
    const { data: liensSections, error: erreurLiensSections } = await supabase
      .from("section_document")
      .select("section_dossier_id, document(*)")
      .in(
        "section_dossier_id",
        sectionsTypees.map((s) => s.id),
      );

    if (erreurLiensSections) throw erreurLiensSections;

    for (const lien of liensSections ?? []) {
      const sectionId = lien.section_dossier_id as string;
      documentsParSection[sectionId] ??= [];
      documentsParSection[sectionId].push(lien.document as unknown as Document);
    }
  }

  return {
    appelOffres: appelOffres as AppelOffres,
    exigences: exigencesTypees,
    dossierReponse,
    documentsParExigence,
    sections: sectionsTypees,
    documentsParSection,
  };
}

export async function listerChecklistManuelle(
  dossierReponseId: string,
): Promise<CleChecklistManuelle[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_item_dossier")
    .select("cle_item")
    .eq("dossier_reponse_id", dossierReponseId);

  if (error) throw error;

  return (data ?? []).map((ligne) => ligne.cle_item as CleChecklistManuelle);
}

export async function obtenirEvaluationGoNoGo(
  appelOffresId: string,
): Promise<EvaluationGoNoGo> {
  const supabase = await createClient();

  const { data: existant, error: erreurSelect } = await supabase
    .from("evaluation_go_no_go")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (existant) return existant as EvaluationGoNoGo;

  const { data: cree, error: erreurInsertion } = await supabase
    .from("evaluation_go_no_go")
    .insert({ appel_offres_id: appelOffresId })
    .select("*")
    .maybeSingle();

  if (!erreurInsertion && cree) return cree as EvaluationGoNoGo;

  // Course possible avec une autre requête concurrente (deux onglets
  // ouverts sur le même AO) : la contrainte unique sur appel_offres_id a
  // été violée. Non fatal — la ligne existe forcément à ce stade, on la
  // relit (même filet de sécurité que obtenirOuCreerDossierReponse).
  const { data: relu, error: erreurRelecture } = await supabase
    .from("evaluation_go_no_go")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .maybeSingle();

  if (!relu) {
    throw new Error("Échec de la création de l'évaluation Go/No-Go.", {
      cause: erreurRelecture ?? erreurInsertion ?? erreurSelect,
    });
  }

  return relu as EvaluationGoNoGo;
}

export async function listerJalonsRetroplanning(
  appelOffresId: string,
): Promise<JalonRetroplanning[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jalon_retroplanning")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("date_cible", { ascending: true })
    .order("ordre", { ascending: true });

  if (error) throw error;
  return (data ?? []) as JalonRetroplanning[];
}

export async function listerBpu(appelOffresId: string): Promise<{
  sections: SectionBpu[];
  lignesParSection: Record<string, LigneBpu[]>;
}> {
  const supabase = await createClient();

  const { data: sections, error: erreurSections } = await supabase
    .from("section_bpu")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurSections) throw erreurSections;

  const sectionsTypees = (sections ?? []) as SectionBpu[];
  const lignesParSection: Record<string, LigneBpu[]> = {};

  for (const section of sectionsTypees) {
    lignesParSection[section.id] = [];
  }

  if (sectionsTypees.length > 0) {
    const { data: lignes, error: erreurLignes } = await supabase
      .from("ligne_bpu")
      .select("*")
      .in(
        "section_bpu_id",
        sectionsTypees.map((s) => s.id),
      )
      .order("ordre", { ascending: true });

    if (erreurLignes) throw erreurLignes;

    for (const ligne of (lignes ?? []) as LigneBpu[]) {
      lignesParSection[ligne.section_bpu_id].push(ligne);
    }
  }

  return { sections: sectionsTypees, lignesParSection };
}

export async function listerGroupement(appelOffresId: string): Promise<{
  membres: MembreGroupement[];
  piecesParMembre: Record<string, ClePieceGroupement[]>;
}> {
  const supabase = await createClient();

  const { data: membres, error: erreurMembres } = await supabase
    .from("membre_groupement")
    .select("*")
    .eq("appel_offres_id", appelOffresId)
    .order("ordre", { ascending: true });

  if (erreurMembres) throw erreurMembres;

  const membresTypes = (membres ?? []) as MembreGroupement[];
  const piecesParMembre: Record<string, ClePieceGroupement[]> = {};

  for (const membre of membresTypes) {
    piecesParMembre[membre.id] = [];
  }

  if (membresTypes.length > 0) {
    const { data: pieces, error: erreurPieces } = await supabase
      .from("piece_membre_groupement")
      .select("membre_groupement_id, cle_piece")
      .in(
        "membre_groupement_id",
        membresTypes.map((m) => m.id),
      );

    if (erreurPieces) throw erreurPieces;

    for (const piece of pieces ?? []) {
      piecesParMembre[piece.membre_groupement_id].push(piece.cle_piece as ClePieceGroupement);
    }
  }

  return { membres: membresTypes, piecesParMembre };
}
