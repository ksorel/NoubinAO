export interface NotificationAvecAvis {
  id: string;
  lu: boolean;
  cree_le: string;
  // Nullable par prudence de typage (voir app/(app)/layout.tsx pour le
  // même patron sur un embed Supabase) : en pratique toujours présent,
  // avis_id est not null et notification est supprimée en cascade si
  // l'avis l'est.
  avis: {
    objet: string | null;
    autorite_contractante: string | null;
  } | null;
}
