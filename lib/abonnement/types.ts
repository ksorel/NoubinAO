export type PlanAbonnement = "decouverte" | "starter" | "croissance" | "cabinet";
export type StatutAbonnement = "actif" | "suspendu";
export type ModeFacturationAbonnement = "mensuel" | "annuel";

export interface Abonnement {
  entreprise_id: string;
  plan: PlanAbonnement;
  quota_mensuel: number;
  statut: StatutAbonnement;
  date_renouvellement: string | null;
  mode_facturation: ModeFacturationAbonnement | null;
  created_at: string;
}
