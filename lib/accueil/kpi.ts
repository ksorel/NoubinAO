import { STATUTS_PIPELINE_AO } from "@/lib/appels-offres/types";
import type { AppelOffres, StatutPipelineAo } from "@/lib/appels-offres/types";
import type { Document } from "@/lib/documents/types";
import { calculerStatutEcheance } from "@/lib/appels-offres/echeance";
import { calculerStatutExpiration } from "@/lib/documents/expiration";

export const STATUTS_PIPELINE_FERMES: readonly StatutPipelineAo[] = [
  "gagne",
  "perdu",
  "sans_suite",
];

export interface KpiAccueil {
  aoEnCours: number;
  aoEcheanceProche: number;
  documentsExpirant: number;
  notificationsNonLues: number;
}

export interface RepartitionStatut {
  statut: StatutPipelineAo;
  nombre: number;
}

export interface AoEcheanceProche {
  id: string;
  titre: string | null;
  fichierDaoNomOriginal: string | null;
  dateLimite: string;
}

export interface DocumentExpirant {
  id: string;
  nom: string;
  dateExpiration: string;
}

function estAoEnCours(ao: AppelOffres): boolean {
  return !STATUTS_PIPELINE_FERMES.includes(ao.statut_pipeline);
}

function estEcheanceProche(ao: AppelOffres, maintenant: Date): boolean {
  const statut = calculerStatutEcheance(ao.date_limite, maintenant);
  return statut === "rouge" || statut === "depassee";
}

export function calculerKpiAccueil(
  appelsOffres: AppelOffres[],
  documents: Document[],
  notificationsNonLues: number,
  maintenant: Date = new Date(),
): KpiAccueil {
  const aoEnCours = appelsOffres.filter(estAoEnCours);
  const aoEcheanceProche = aoEnCours.filter((ao) => estEcheanceProche(ao, maintenant)).length;
  const documentsExpirant = documents.filter(
    (doc) => calculerStatutExpiration(doc.date_expiration, maintenant) === "rouge",
  ).length;

  return {
    aoEnCours: aoEnCours.length,
    aoEcheanceProche,
    documentsExpirant,
    notificationsNonLues,
  };
}

export function calculerRepartitionPipeline(appelsOffres: AppelOffres[]): RepartitionStatut[] {
  const compteurs = new Map<StatutPipelineAo, number>();
  for (const ao of appelsOffres) {
    compteurs.set(ao.statut_pipeline, (compteurs.get(ao.statut_pipeline) ?? 0) + 1);
  }
  return STATUTS_PIPELINE_AO.filter((statut) => compteurs.has(statut)).map((statut) => ({
    statut,
    nombre: compteurs.get(statut) as number,
  }));
}

export function listerAoEcheanceProche(
  appelsOffres: AppelOffres[],
  maintenant: Date = new Date(),
  limite = 5,
): AoEcheanceProche[] {
  return appelsOffres
    .filter(estAoEnCours)
    .filter((ao) => estEcheanceProche(ao, maintenant))
    .sort((a, b) => {
      const aDate = a.date_limite as string;
      const bDate = b.date_limite as string;
      return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
    })
    .slice(0, limite)
    .map((ao) => ({
      id: ao.id,
      titre: ao.titre,
      fichierDaoNomOriginal: ao.fichier_dao_nom_original,
      dateLimite: ao.date_limite as string,
    }));
}

export function listerDocumentsExpirant(
  documents: Document[],
  maintenant: Date = new Date(),
  limite = 5,
): DocumentExpirant[] {
  return documents
    .filter((doc) => calculerStatutExpiration(doc.date_expiration, maintenant) === "rouge")
    .sort((a, b) => {
      const aDate = a.date_expiration as string;
      const bDate = b.date_expiration as string;
      return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
    })
    .slice(0, limite)
    .map((doc) => ({
      id: doc.id,
      nom: doc.nom,
      dateExpiration: doc.date_expiration as string,
    }));
}
