import { Badge } from "@/components/ui/badge";
import { calculerStatutExpiration } from "@/lib/documents/expiration";

const STYLES = {
  rouge: "bg-destructive text-destructive-foreground border-transparent",
  orange: "bg-[hsl(var(--status-soumis))] text-slate-900 border-transparent",
  vert: "bg-[hsl(var(--status-gagne))] text-slate-900 border-transparent",
} as const;

const LABELS = {
  rouge: "Expire bientôt",
  orange: "À surveiller",
  vert: "Valide",
} as const;

export function ExpirationBadge({
  dateExpiration,
}: {
  dateExpiration: string | null;
}) {
  const statut = calculerStatutExpiration(dateExpiration);

  if (!statut) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  return (
    <Badge variant="outline" className={STYLES[statut]}>
      {LABELS[statut]}
    </Badge>
  );
}
