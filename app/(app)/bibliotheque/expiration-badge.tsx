import { Badge } from "@/components/ui/badge";
import { calculerStatutExpiration } from "@/lib/documents/expiration";

const STYLES = {
  rouge: "bg-destructive/15 text-destructive border-destructive/30",
  orange:
    "bg-[hsl(var(--status-soumis))]/15 text-[hsl(var(--status-soumis))] border-[hsl(var(--status-soumis))]/30",
  vert: "bg-[hsl(var(--status-gagne))]/15 text-[hsl(var(--status-gagne))] border-[hsl(var(--status-gagne))]/30",
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
